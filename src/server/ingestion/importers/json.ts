import type { Importer, ImportedDocument } from "../importer";

// ---------------------------------------------------------------------------
// ChatGPT data export (conversations.json) detection + extraction.
//
// The export is a JSON array of conversation objects, each holding a
// `mapping` of node id -> { message }. Turns are addressed via a tree
// (parent/children) to support edits and branches; for Phase 1 purposes we
// take the simpler, more robust route of collecting every user/assistant
// text message and ordering by create_time, rather than walking the tree —
// this loses branch structure on edited messages but never drops content.
// ---------------------------------------------------------------------------

interface ChatGptMessage {
  author?: { role?: string };
  content?: { content_type?: string; parts?: unknown[] };
  create_time?: number | null;
}

interface ChatGptNode {
  message?: ChatGptMessage | null;
}

interface ChatGptConversation {
  title?: string;
  create_time?: number;
  mapping?: Record<string, ChatGptNode>;
}

function isChatGptExport(value: unknown): value is ChatGptConversation[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.slice(0, 3).every((item) => typeof item === "object" && item !== null && "mapping" in item);
}

function extractConversationText(conv: ChatGptConversation): string {
  const mapping = conv.mapping ?? {};
  const turns = Object.values(mapping)
    .map((node) => node.message)
    .filter((m): m is ChatGptMessage => !!m && (m.author?.role === "user" || m.author?.role === "assistant"))
    .filter((m) => m.content?.content_type === "text" && Array.isArray(m.content?.parts))
    .map((m) => ({
      role: m.author!.role as "user" | "assistant",
      text: (m.content!.parts as unknown[])
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .join(" "),
      time: m.create_time ?? 0,
    }))
    .filter((t) => t.text.length > 0)
    .sort((a, b) => a.time - b.time);

  return turns.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n\n");
}

function parseChatGptExport(fileName: string, conversations: ChatGptConversation[], sizeBytes: number): ImportedDocument {
  const sections = conversations
    .map((conv) => {
      const body = extractConversationText(conv);
      if (!body) return null;
      const title = conv.title?.trim() || "Untitled conversation";
      const date = conv.create_time ? new Date(conv.create_time * 1000).toISOString().slice(0, 10) : "unknown date";
      return `### ${title} (${date})\n${body}`;
    })
    .filter((s): s is string => s !== null);

  return {
    title: fileName,
    text: sections.join("\n\n---\n\n"),
    metadata: {
      sizeBytes,
      source: "chatgpt-export",
      conversationCount: conversations.length,
      extractedCount: sections.length,
    },
  };
}

// ---------------------------------------------------------------------------

export const jsonImporter: Importer = {
  extensions: [".json"],
  async parse(fileName, buffer): Promise<ImportedDocument> {
    const raw = buffer.toString("utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON in ${fileName}: ${(err as Error).message}`);
    }

    if (isChatGptExport(parsed)) {
      return parseChatGptExport(fileName, parsed, buffer.byteLength);
    }

    return {
      title: fileName,
      text: JSON.stringify(parsed, null, 2),
      metadata: {
        sizeBytes: buffer.byteLength,
        topLevelType: Array.isArray(parsed) ? "array" : typeof parsed,
      },
    };
  },
};
