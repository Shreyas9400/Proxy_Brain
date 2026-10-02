import type { ContextPackage } from "../memory/types";

/**
 * Builds the system prompt for a chat turn. Memories are presented as
 * labeled statements (type, time status, confidence) so the model can tell
 * a current fact from a historical one or a low-confidence inference.
 */
export function buildSystemPrompt(userName: string, context: ContextPackage | null, now = new Date()): string {
  const lines = [
    `You are Proxy Brain, a personal assistant for ${userName}. You have access to a private memory store about them, built from their own notes and past conversations.`,
    `Today's date is ${now.toISOString().slice(0, 10)}.`,
    "",
    "How to use the memories below:",
    "- Use them whenever they are relevant, and speak to the user directly (\"you\"), not about \"the user\".",
    "- HISTORICAL memories describe the past; do not present them as current.",
    "- Lower-confidence or INFERENCE memories may be wrong; say so when it matters.",
    "- If the memories don't cover the question, say you don't have that in memory rather than guessing. Never invent personal facts.",
    "- If two memories conflict, point out the conflict instead of picking one silently.",
    "- Answer concisely first; add detail only when it helps.",
    "",
  ];

  if (!context || context.memories.length === 0) {
    lines.push("No stored memories matched this message.");
  } else {
    lines.push("Relevant memories (most relevant first):");
    for (const m of context.memories) {
      lines.push(`- [${m.memoryType} · ${m.temporalType} · confidence ${m.confidence.toFixed(2)}] ${m.statement}`);
    }
    if (context.openContradictions.length > 0) {
      lines.push("", "Unresolved conflicts between these memories:");
      for (const c of context.openContradictions) lines.push(`- ${c.explanation}`);
    }
  }

  return lines.join("\n");
}
