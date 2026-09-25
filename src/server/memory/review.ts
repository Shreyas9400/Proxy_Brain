import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { memories, memoryRelationships, memoryReviews } from "../db/schema";
import { writeMemoryVersion } from "./versioning";
import { embedMemory, removeMemoryEmbedding } from "./embedding";
import { finalizeSupersession } from "./temporal";
import { recordAudit } from "../audit/log";
import type { MemoryReviewAction } from "../validation/schemas";

async function finalizeOutgoingSupersessions(memoryId: string, statement: string): Promise<void> {
  const outgoing = await db
    .select()
    .from(memoryRelationships)
    .where(and(eq(memoryRelationships.fromMemoryId, memoryId), eq(memoryRelationships.relationshipType, "SUPERSEDES")));

  for (const rel of outgoing) {
    await finalizeSupersession({
      newMemoryId: memoryId,
      newStatement: statement,
      oldMemoryId: rel.toMemoryId,
      changeReason: "Supersession approved via review",
      actor: "user",
    });
  }
}

/**
 * Applies a user decision (approve/edit/reject) to a PENDING_REVIEW memory.
 * Returns undefined if the memory doesn't exist, isn't the user's, or isn't
 * actually pending review.
 */
export async function applyReviewAction(
  userId: string,
  memoryId: string,
  action: MemoryReviewAction,
): Promise<{ id: string; status: string } | undefined> {
  const [memory] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
    .limit(1);
  if (!memory || memory.status !== "PENDING_REVIEW") return undefined;

  const [reviewRow] = await db
    .select()
    .from(memoryReviews)
    .where(eq(memoryReviews.memoryId, memoryId))
    .limit(1);

  if (action.action === "reject") {
    await db.update(memories).set({ status: "ARCHIVED", updatedAt: new Date() }).where(eq(memories.id, memoryId));
    if (reviewRow) {
      await db
        .update(memoryReviews)
        .set({ status: "REJECTED", reviewedAt: new Date() })
        .where(eq(memoryReviews.id, reviewRow.id));
    }
    await writeMemoryVersion({
      memoryId,
      previousStatement: memory.statement,
      newStatement: memory.statement,
      previousConfidence: memory.confidence,
      newConfidence: memory.confidence,
      previousStatus: memory.status,
      newStatus: "ARCHIVED",
      changeReason: "Rejected in review",
      actor: "user",
    });
    await recordAudit({ userId, actor: "user", action: "memory.rejected", entityType: "memory", entityId: memoryId });
    return { id: memoryId, status: "ARCHIVED" };
  }

  const finalStatement = action.action === "edit" ? action.editedStatement ?? memory.statement : memory.statement;

  await db
    .update(memories)
    .set({
      statement: finalStatement,
      status: "ACTIVE",
      updatedAt: new Date(),
      lastConfirmedAt: new Date(),
    })
    .where(eq(memories.id, memoryId));

  if (reviewRow) {
    await db
      .update(memoryReviews)
      .set({
        status: action.action === "edit" ? "EDITED" : "APPROVED",
        editedStatement: action.action === "edit" ? finalStatement : undefined,
        reviewedAt: new Date(),
      })
      .where(eq(memoryReviews.id, reviewRow.id));
  }

  await writeMemoryVersion({
    memoryId,
    previousStatement: memory.statement,
    newStatement: finalStatement,
    previousConfidence: memory.confidence,
    newConfidence: memory.confidence,
    previousStatus: memory.status,
    newStatus: "ACTIVE",
    changeReason: action.action === "edit" ? "Edited and approved in review" : "Approved in review",
    actor: "user",
  });

  await embedMemory(memoryId, finalStatement);
  await finalizeOutgoingSupersessions(memoryId, finalStatement);

  await recordAudit({
    userId,
    actor: "user",
    action: action.action === "edit" ? "memory.edited_and_approved" : "memory.approved",
    entityType: "memory",
    entityId: memoryId,
  });

  return { id: memoryId, status: "ACTIVE" };
}

/** Archives an ACTIVE memory outside the review flow (the [Archive] action in the memory browser). */
export async function archiveMemory(userId: string, memoryId: string): Promise<{ id: string } | undefined> {
  const [memory] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
    .limit(1);
  if (!memory) return undefined;

  await db.update(memories).set({ status: "ARCHIVED", updatedAt: new Date() }).where(eq(memories.id, memoryId));
  await removeMemoryEmbedding(memoryId);

  await writeMemoryVersion({
    memoryId,
    previousStatement: memory.statement,
    newStatement: memory.statement,
    previousConfidence: memory.confidence,
    newConfidence: memory.confidence,
    previousStatus: memory.status,
    newStatus: "ARCHIVED",
    changeReason: "Archived by user",
    actor: "user",
  });

  await recordAudit({ userId, actor: "user", action: "memory.archived", entityType: "memory", entityId: memoryId });
  return { id: memoryId };
}
