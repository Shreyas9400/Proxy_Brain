import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { getConversationMessages } from "@/server/agent/chat-agent";

export async function GET(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId } = await params;
  const result = await getConversationMessages(userId, conversationId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(result);
}
