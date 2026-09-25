import { NextResponse } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";
import { requireUserId } from "@/server/auth/session";
import { db } from "@/server/db/client";
import {
  contradictions as contradictionsTable,
  entities,
  memories,
  memoryEntities,
  memoryReviews,
  memorySources,
  memoryVersions,
  sources,
} from "@/server/db/schema";
import { memoryUpdateSchema } from "@/server/validation/schemas";
import { writeMemoryVersion } from "@/server/memory/versioning";
import { embedMemory } from "@/server/memory/embedding";
import { archiveMemory } from "@/server/memory/review";
import { recordAudit } from "@/server/audit/log";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [memory] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .limit(1);
  if (!memory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await db.select().from(memoryVersions).where(eq(memoryVersions.memoryId, id)).orderBy(desc(memoryVersions.createdAt));

  const sourceRows = await db
    .select({ source: sources })
    .from(memorySources)
    .innerJoin(sources, eq(sources.id, memorySources.sourceId))
    .where(eq(memorySources.memoryId, id));

  const entityRows = await db
    .select({ entity: entities })
    .from(memoryEntities)
    .innerJoin(entities, eq(entities.id, memoryEntities.entityId))
    .where(eq(memoryEntities.memoryId, id));

  const [review] = await db.select().from(memoryReviews).where(eq(memoryReviews.memoryId, id)).orderBy(desc(memoryReviews.createdAt)).limit(1);

  const openContradictions = await db
    .select()
    .from(contradictionsTable)
    .where(and(eq(contradictionsTable.status, "OPEN"), or(eq(contradictionsTable.memoryIdA, id), eq(contradictionsTable.memoryIdB, id))));

  return NextResponse.json({
    memory,
    versions,
    sources: sourceRows.map((r) => r.source),
    entities: entityRows.map((r) => r.entity),
    review,
    openContradictions,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await request.json().catch(() => undefined);
  const parsed = memoryUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  if (parsed.data.status === "ARCHIVED") {
    const result = await archiveMemory(userId, id);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ id: result.id, status: "ARCHIVED" });
  }

  const [memory] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .limit(1);
  if (!memory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newStatement = parsed.data.statement ?? memory.statement;
  const newStatus = parsed.data.status ?? memory.status;

  await db.update(memories).set({ statement: newStatement, status: newStatus, updatedAt: new Date() }).where(eq(memories.id, id));

  await writeMemoryVersion({
    memoryId: id,
    previousStatement: memory.statement,
    newStatement,
    previousConfidence: memory.confidence,
    newConfidence: memory.confidence,
    previousStatus: memory.status,
    newStatus,
    changeReason: "Manual edit",
    actor: "user",
  });

  if (newStatus === "ACTIVE") {
    await embedMemory(id, newStatement);
  }

  await recordAudit({ userId, actor: "user", action: "memory.manually_edited", entityType: "memory", entityId: id });

  return NextResponse.json({ id, statement: newStatement, status: newStatus });
}
