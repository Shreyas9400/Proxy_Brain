import OpenAI from "openai";
import { z } from "zod";
import type { ChatMessage, EmbeddingProvider, GenerateTextOptions, LLMProvider } from "../provider";

/**
 * Implements the same interface as OllamaProvider so LLM_PROVIDER=openai
 * can be swapped in without touching call sites. Not exercised by default
 * Phase 1 setup (which uses Ollama) — requires OPENAI_API_KEY.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateText(messages: ChatMessage[], options?: GenerateTextOptions): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens,
    });
    return res.choices[0]?.message?.content ?? "";
  }

  async *streamText(messages: ChatMessage[], options?: GenerateTextOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        temperature: options?.temperature ?? 0.4,
        max_tokens: options?.maxTokens,
        stream: true,
      },
      { signal: options?.signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async generateStructured<T>(
    messages: ChatMessage[],
    schema: z.ZodType<T>,
    options?: GenerateTextOptions,
  ): Promise<T> {
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.maxTokens,
      response_format: {
        type: "json_schema",
        json_schema: { name: "structured_output", schema: jsonSchema, strict: false },
      },
    });
    const raw = res.choices[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`OpenAI returned non-JSON structured output: ${raw.slice(0, 500)}`);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`OpenAI structured output failed schema validation: ${result.error.message}`);
    }
    return result.data;
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions = 768;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });
    return res.data.map((d) => d.embedding);
  }
}
