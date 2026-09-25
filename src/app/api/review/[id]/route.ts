import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { memoryReviewActionSchema } from "@/server/validation/schemas";
import { applyReviewAction } from "@/server/memory/review";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await request.json().catch(() => undefined);
  const parsed = memoryReviewActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const result = await applyReviewAction(userId, id, parsed.data);
  if (!result) return NextResponse.json({ error: "Not found or not pending review" }, { status: 404 });

  return NextResponse.json(result);
}
