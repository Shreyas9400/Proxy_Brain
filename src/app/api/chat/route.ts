import { z } from "zod";
import { auth } from "@/server/auth";
import {
  appendMessage,
  createConversation,
  getConversation,
  getMessages,
} from "@/server/chat/conversations";
import { buildSystemPrompt } from "@/server/chat/prompt";
import { stripThinking } from "@/server/chat/strip-thinking";
import type { ChatEvent } from "@/server/chat/events";
import { getLLMProvider, type ChatMessage } from "@/server/llm";
import { buildContextPackage } from "@/server/memory/retrieval";
import type { ContextPackage } from "@/server/memory/types";

// Only the most recent turns are replayed to the model, to stay inside the
// context window of small local models.
const HISTORY_LIMIT = 20;
// Hard stop for runaway generations (small models can loop on repeated lines).
const MAX_REPLY_TOKENS = 2048;

const bodySchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(8000),
});

/**
 * POST /api/chat — answers one user message. The response is
 * newline-delimited JSON (ChatEvent per line): a `meta` event with the
 * conversation id and the memories used, then `delta` text events, then
 * `done` or `error`. Both messages are persisted to the conversation.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { message } = parsed.data;

  let conversation = parsed.data.conversationId ? await getConversation(userId, parsed.data.conversationId) : undefined;
  if (parsed.data.conversationId && !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  const isNew = !conversation;
  conversation ??= await createConversation(userId, message);

  const history = isNew ? [] : (await getMessages(conversation.id)).slice(-HISTORY_LIMIT);
  await appendMessage(conversation.id, "user", message);

  // Retrieval needs the embedding model; if it is down, still answer, just
  // without memories, and tell the UI why.
  let context: ContextPackage | null = null;
  let warning: string | undefined;
  try {
    context = await buildContextPackage(userId, message);
  } catch (err) {
    console.error("[chat] memory retrieval failed:", err);
    warning = "Memory search is unavailable (is Ollama running with the embedding model?). Answering without memories.";
  }

  const llmMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(session.user?.name ?? "the user", context) },
    ...history
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  const conversationId = conversation.id;
  const title = conversation.title;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      send({
        type: "meta",
        conversationId,
        title,
        warning,
        memories: (context?.memories ?? []).map((m) => ({
          id: m.id,
          statement: m.statement,
          memoryType: m.memoryType,
          temporalType: m.temporalType,
          confidence: m.confidence,
        })),
      });

      let reply = "";
      try {
        const chunks = stripThinking(
          getLLMProvider().streamText(llmMessages, { signal: request.signal, maxTokens: MAX_REPLY_TOKENS }),
        );
        for await (const chunk of chunks) {
          if (chunk.kind === "reset") {
            reply = "";
            send({ type: "reset" });
          } else {
            reply += chunk.text;
            send({ type: "delta", text: chunk.text });
          }
        }
        const messageId = await appendMessage(conversationId, "assistant", reply);
        send({ type: "done", messageId });
      } catch (err) {
        // Keep whatever was generated before a failure or a client abort.
        if (reply) await appendMessage(conversationId, "assistant", reply).catch(() => {});
        if (!request.signal.aborted) {
          console.error("[chat] generation failed:", err);
          send({ type: "error", message: err instanceof Error ? err.message : "Generation failed" });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed because the client went away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
