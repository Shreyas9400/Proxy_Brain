import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { memories, memoryRelationships, memoryReviews, memorySources } from "../db/schema";
import type {
  memoryDomainEnum,
  memoryImportanceEnum,
  memoryOriginEnum,
  memoryStatusEnum,
  memoryTypeEnum,
} from "../db/schema";
import { writeMemoryVersion } from "./versioning";
import { embedMemory } from "./embedding";
import { recordAudit } from "../audit/log";

type MemoryType = (typeof memoryTypeEnum.enumValues)[number];
type MemoryDomain = (typeof memoryDomainEnum.enumValues)[number];
type MemoryOrigin = (typeof memoryOriginEnum.enumValues)[number];
type MemoryImportance = (typeof memoryImportanceEnum.enumValues)[number];
type MemoryStatus = (typeof memoryStatusEnum.enumValues)[number];

export interface SupersedeInput {
  userId: string;
  oldMemoryId: string;
  newStatement: string;
  newConfidence: number;
  changeReason: string;
  sourceId?: string;
  memoryType: MemoryType;
  domain: MemoryDomain;
  origin: MemoryOrigin;
  importance: MemoryImportance;
  /** Risk-policy decision for the new statement — ACTIVE supersedes immediately, PENDING_REVIEW waits. */
  status: Extract<MemoryStatus, "ACTIVE" | "PENDING_REVIEW">;
  reviewRequired: boolean;
  reviewReason?: string;
  actor: "user" | "system" | "llm";
}

/**
 * Creates a new memory that supersedes an existing one. The SUPERSEDES
 * relationship is recorded immediately so the intent is always visible, but
 * the old memory is only flipped to SUPERSEDED once the new one is actually
 * ACTIVE — a PENDING_REVIEW candidate must never retroactively invalidate a
 * memory currently in active use.
 */
export async function supersedeMemory(input: SupersedeInput): Promise<{ id: string }> {
  const [newRow] = await db
    .insert(memories)
    .values({
      userId: input.userId,
      statement: input.newStatement,
      memoryType: input.memoryType,
      domain: input.domain,
      origin: input.origin,
      confidence: input.newConfidence,
      importance: input.importance,
      status: input.status,
      temporalType: "CURRENT",
      reviewRequired: input.reviewRequired,
      reviewReason: input.reviewReason,
    })
    .returning();

  if (input.sourceId) {
    await db.insert(memorySources).values({ memoryId: newRow.id, sourceId: input.sourceId });
  }

  await db.insert(memoryRelationships).values({
    fromMemoryId: newRow.id,
    toMemoryId: input.oldMemoryId,
    relationshipType: "SUPERSEDES",
  });

  await writeMemoryVersion({
    memoryId: newRow.id,
    newStatement: input.newStatement,
    newConfidence: input.newConfidence,
    newStatus: input.status,
    changeReason: input.changeReason,
    actor: input.actor,
    sourceId: input.sourceId,
  });

  if (input.status === "ACTIVE") {
    await finalizeSupersession({
      newMemoryId: newRow.id,
      newStatement: input.newStatement,
      oldMemoryId: input.oldMemoryId,
      changeReason: input.changeReason,
      actor: input.actor,
      sourceId: input.sourceId,
    });
  } else {
    await db.insert(memoryReviews).values({ memoryId: newRow.id, status: "PENDING", originalStatement: input.newStatement });
  }

  await recordAudit({
    userId: input.userId,
    actor: input.actor,
    action: "memory.supersede_candidate_created",
    entityType: "memory",
    entityId: newRow.id,
    details: { oldMemoryId: input.oldMemoryId, status: input.status },
  });

  return { id: newRow.id };
}

interface FinalizeInput {
  newMemoryId: string;
  newStatement: string;
  oldMemoryId: string;
  changeReason: string;
  actor: "user" | "system" | "llm";
  sourceId?: string;
}

/**
 * Marks the old memory SUPERSEDED and embeds the new one. Called either
 * immediately (auto-activated supersession) or from review.ts when a
 * PENDING_REVIEW supersession candidate is approved.
 */
export async function finalizeSupersession(input: FinalizeInput): Promise<void> {
  const [old] = await db.select().from(memories).where(eq(memories.id, input.oldMemoryId)).limit(1);
  if (old && old.status !== "SUPERSEDED") {
    await db
      .update(memories)
      .set({ status: "SUPERSEDED", temporalType: "SUPERSEDED", updatedAt: new Date() })
      .where(eq(memories.id, input.oldMemoryId));

    await writeMemoryVersion({
      memoryId: input.oldMemoryId,
      previousStatement: old.statement,
      newStatement: old.statement,
      previousConfidence: old.confidence,
      newConfidence: old.confidence,
      previousStatus: old.status,
      newStatus: "SUPERSEDED",
      changeReason: input.changeReason,
      actor: input.actor,
      sourceId: input.sourceId,
    });
  }

  await embedMemory(input.newMemoryId, input.newStatement);
}
