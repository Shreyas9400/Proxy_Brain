import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { conversationMessages, conversations } from "../db/schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export async function listConversations(userId: string, limit = 50): Promise<ConversationSummary[]> {
  return db
    .select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
}

/** Returns the conversation only if it belongs to the user. */
export async function getConversation(userId: string, conversationId: string) {
  if (!isUuid(conversationId)) return undefined;
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  return row;
}

export async function getMessages(conversationId: string): Promise<StoredMessage[]> {
  return db
    .select({ id: conversationMessages.id, role: conversationMessages.role, content: conversationMessages.content })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt));
}

export async function createConversation(userId: string, firstMessage: string) {
  const oneLine = firstMessage.replace(/\s+/g, " ").trim();
  const title = oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine || "New conversation";
  const [row] = await db.insert(conversations).values({ userId, title }).returning();
  return row;
}

export async function appendMessage(conversationId: string, role: "user" | "assistant", content: string) {
  const [row] = await db
    .insert(conversationMessages)
    .values({ conversationId, role, content })
    .returning({ id: conversationMessages.id });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  return row.id;
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  if (!isUuid(conversationId)) return;
  await db.delete(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}
