// Wire format of POST /api/chat: one JSON object per line.

export interface UsedMemory {
  id: string;
  statement: string;
  memoryType: string;
  temporalType: string;
  confidence: number;
}

export type ChatEvent =
  | { type: "meta"; conversationId: string; title: string; memories: UsedMemory[]; warning?: string }
  | { type: "delta"; text: string }
  // The text streamed so far was model reasoning; clear it.
  | { type: "reset" }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };
