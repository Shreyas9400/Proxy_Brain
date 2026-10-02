import type { z } from "zod";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateTextOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * A chat-capable LLM. Implementations must support both free-text generation
 * (for the chat UI) and schema-validated structured output (for memory
 * formation, contradiction checks, and command classification).
 */
export interface LLMProvider {
  readonly name: string;
  generateText(messages: ChatMessage[], options?: GenerateTextOptions): Promise<string>;
  /** Yields the reply as text deltas, for the streaming chat UI. */
  streamText(messages: ChatMessage[], options?: GenerateTextOptions): AsyncIterable<string>;
  generateStructured<T>(
    messages: ChatMessage[],
    schema: z.ZodType<T>,
    options?: GenerateTextOptions,
  ): Promise<T>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
