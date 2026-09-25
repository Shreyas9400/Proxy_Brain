import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ChatMessage, GenerateTextOptions, LLMProvider } from "../provider";

/**
 * Implements the same interface as OllamaProvider so LLM_PROVIDER=anthropic
 * can be swapped in without touching call sites. Not exercised by default
 * Phase 1 setup (which uses Ollama) — requires ANTHROPIC_API_KEY.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  private splitSystem(messages: ChatMessage[]): { system: string | undefined; rest: ChatMessage[] } {
    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages.filter((m) => m.role !== "system");
    return { system, rest };
  }

  async generateText(messages: ChatMessage[], options?: GenerateTextOptions): Promise<string> {
    const { system, rest } = this.splitSystem(messages);
    const res = await this.client.messages.create({
      model: this.model,
      system,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.4,
      messages: rest.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });
    const textBlock = res.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  }

  async generateStructured<T>(
    messages: ChatMessage[],
    schema: z.ZodType<T>,
    options?: GenerateTextOptions,
  ): Promise<T> {
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
    const { system, rest } = this.splitSystem(messages);
    const instructedSystem = `${system ?? ""}\n\nRespond with ONLY valid JSON matching this schema, no prose, no markdown fences:\n${JSON.stringify(jsonSchema)}`;

    const res = await this.client.messages.create({
      model: this.model,
      system: instructedSystem,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.1,
      messages: rest.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const raw = textBlock?.type === "text" ? textBlock.text : "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Anthropic returned non-JSON structured output: ${raw.slice(0, 500)}`);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Anthropic structured output failed schema validation: ${result.error.message}`);
    }
    return result.data;
  }
}
