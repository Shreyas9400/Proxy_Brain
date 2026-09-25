import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { chatRequestSchema } from "@/server/validation/schemas";
import { runChatTurn, listConversations } from "@/server/agent/chat-agent";
import { checkRateLimit } from "@/server/security/rate-limit";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversations = await listConversations(userId);
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = checkRateLimit(`chat:${userId}`, { windowMs: 60_000, max: 20 });
  if (!rate.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const body = await request.json().catch(() => undefined);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const result = await runChatTurn(userId, parsed.data.conversationId, parsed.data.message);
  return NextResponse.json(result);
}
