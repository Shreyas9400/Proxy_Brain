import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { contradictions, memories } from "../db/schema";
import { recordAudit } from "../audit/log";
import type { ContradictionResolution } from "../validation/schemas";

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
