import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { contradictions, memories } from "../db/schema";
import { recordAudit } from "../audit/log";
import type { ContradictionResolution } from "../validation/schemas";

/**
 * Pure contradiction-detection guard: only ids the LLM was actually offered
 * as EXISTING MEMORY CONTEXT are trusted as real contradictions. A
 * hallucinated id, or one injected via an imported document's content,
 * must never silently mark an unrelated memory contradicted.
 */
export function filterKnownContradictionIds(candidateIds: string[], knownIds: Set<string>): string[] {
  return candidateIds.filter((id) => knownIds.has(id));
}

export async function createContradiction(memoryIdA: string, memoryIdB: string, explanation: string) {
  const [row] = await db
    .insert(contradictions)
    .values({ memoryIdA, memoryIdB, explanation, status: "OPEN" })
    .returning();

  await recordAudit({
    actor: "system",
    action: "contradiction.opened",
    entityType: "contradiction",
    entityId: row.id,
    details: { memoryIdA, memoryIdB, explanation },
  });

  return row;
}

export async function resolveContradiction(
  contradictionId: string,
  resolution: ContradictionResolution["resolution"],
  userId: string,
) {
  const [existing] = await db.select().from(contradictions).where(eq(contradictions.id, contradictionId)).limit(1);
  if (!existing) return undefined;

  // contradictions has no user_id column of its own — ownership is proven
  // via the memories it references, never assumed from single-user scope.
  const [ownedMemory] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(eq(memories.id, existing.memoryIdA), eq(memories.userId, userId)))
    .limit(1);
  if (!ownedMemory) return undefined;

  const [row] = await db
    .update(contradictions)
    .set({ status: resolution, resolvedAt: new Date(), resolvedBy: "user" })
    .where(eq(contradictions.id, contradictionId))
    .returning();

  if (!row) return undefined;

  // RESOLVED_A / RESOLVED_B mark the losing memory CONTRADICTED. Both-valid
  // and dismissed leave both memories exactly as they were.
  if (resolution === "RESOLVED_A") {
    await db.update(memories).set({ status: "CONTRADICTED", updatedAt: new Date() }).where(eq(memories.id, row.memoryIdB));
  } else if (resolution === "RESOLVED_B") {
    await db.update(memories).set({ status: "CONTRADICTED", updatedAt: new Date() }).where(eq(memories.id, row.memoryIdA));
  }

  await recordAudit({
    userId,
    actor: "user",
    action: "contradiction.resolved",
    entityType: "contradiction",
    entityId: row.id,
    details: { resolution },
  });

  return row;
}
