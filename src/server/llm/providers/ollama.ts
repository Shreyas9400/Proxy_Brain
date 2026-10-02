import { z } from "zod";
import type { ChatMessage, EmbeddingProvider, GenerateTextOptions, LLMProvider } from "../provider";

interface OllamaChatResponse {
  message: { role: string; content: string };
}

interface OllamaStreamChunk {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;
  // undefined = model default. false makes thinking models (qwen3 etc.)
  // answer directly, which is much faster on small local hardware.
  private readonly think: boolean | undefined;

  constructor(baseUrl: string, model: string, think?: boolean) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.think = think;
  }

  async generateText(messages: ChatMessage[], options?: GenerateTextOptions): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        think: this.think,
        options: {
          temperature: options?.temperature ?? 0.4,
          num_predict: options?.maxTokens,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama chat request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    return data.message.content;
  }

  async *streamText(messages: ChatMessage[], options?: GenerateTextOptions): AsyncIterable<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options?.signal,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        think: this.think,
        options: {
          temperature: options?.temperature ?? 0.4,
          num_predict: options?.maxTokens,
        },
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama chat request failed: ${res.status} ${await res.text()}`);
    }

    // Newline-delimited JSON, one chunk per line. Only `content` is
    // forwarded; a separate `thinking` field (if any) is dropped.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as OllamaStreamChunk;
        if (chunk.error) throw new Error(`Ollama chat stream failed: ${chunk.error}`);
        if (chunk.message?.content) yield chunk.message.content;
      }
    }
  }

  async generateStructured<T>(
    messages: ChatMessage[],
    schema: z.ZodType<T>,
    options?: GenerateTextOptions,
  ): Promise<T> {
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: jsonSchema,
        options: {
          temperature: options?.temperature ?? 0.1,
          num_predict: options?.maxTokens,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama structured request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.message.content);
    } catch {
      throw new Error(`Ollama returned non-JSON structured output: ${data.message.content.slice(0, 500)}`);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Ollama structured output failed schema validation: ${result.error.message}`);
    }
    return result.data;
  }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama";
  readonly dimensions = 768;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!res.ok) {
      throw new Error(`Ollama embed request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OllamaEmbedResponse;
    return data.embeddings;
  }
}
