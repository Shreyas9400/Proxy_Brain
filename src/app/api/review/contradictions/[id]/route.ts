import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { contradictionResolutionSchema } from "@/server/validation/schemas";
import { resolveContradiction } from "@/server/memory/contradictions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await request.json().catch(() => undefined);
  const parsed = contradictionResolutionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const result = await resolveContradiction(id, parsed.data.resolution, userId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(result);
}
