import type { EmbeddingProvider, LLMProvider } from "./provider";
import { OllamaEmbeddingProvider, OllamaProvider } from "./providers/ollama";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIEmbeddingProvider, OpenAIProvider } from "./providers/openai";

type ProviderName = "ollama" | "anthropic" | "openai";

function getProviderName(): ProviderName {
  const value = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase();
  if (value === "ollama" || value === "anthropic" || value === "openai") return value;
  throw new Error(`Unknown LLM_PROVIDER: ${value}`);
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim().toLowerCase() === "true";
}

let llmSingleton: LLMProvider | undefined;
let embeddingSingleton: EmbeddingProvider | undefined;

export function getLLMProvider(): LLMProvider {
  if (llmSingleton) return llmSingleton;

  const provider = getProviderName();
  if (provider === "ollama") {
    llmSingleton = new OllamaProvider(
      process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      process.env.OLLAMA_CHAT_MODEL ?? "llama3.1",
      parseOptionalBoolean(process.env.OLLAMA_THINK),
    );
  } else if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic");
    llmSingleton = new AnthropicProvider(apiKey, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5");
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
    llmSingleton = new OpenAIProvider(apiKey, process.env.OPENAI_MODEL ?? "gpt-4o");
  }
  return llmSingleton;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingSingleton) return embeddingSingleton;

  const provider = getProviderName();
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
    embeddingSingleton = new OpenAIEmbeddingProvider(apiKey, process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small");
  } else {
    // Ollama is also the embedding provider when LLM_PROVIDER=anthropic,
    // since Anthropic has no embeddings API. Keep everything on one local
    // model unless the user explicitly wants OpenAI embeddings.
    embeddingSingleton = new OllamaEmbeddingProvider(
      process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
    );
  }
  return embeddingSingleton;
}

export type { ChatMessage, EmbeddingProvider, LLMProvider } from "./provider";
