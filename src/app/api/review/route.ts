import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireUserId } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { contradictions as contradictionsTable, memories } from "@/server/db/schema";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pending = await db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, userId), eq(memories.status, "PENDING_REVIEW")))
    .orderBy(desc(memories.createdAt));

  const userMemoryIds = await db.select({ id: memories.id }).from(memories).where(eq(memories.userId, userId));
  const idSet = new Set(userMemoryIds.map((m) => m.id));

  const openContradictionsRaw = await db.select().from(contradictionsTable).where(eq(contradictionsTable.status, "OPEN"));
  const openContradictions = openContradictionsRaw.filter((c) => idSet.has(c.memoryIdA) || idSet.has(c.memoryIdB));

  return NextResponse.json({ pending, openContradictions });
}
