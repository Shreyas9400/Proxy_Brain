import { db } from "../db/client";
import { memoryVersions, memoryStatusEnum } from "../db/schema";

type MemoryStatus = (typeof memoryStatusEnum.enumValues)[number];

export interface VersionEntry {
  memoryId: string;
  previousStatement?: string;
  newStatement: string;
  previousConfidence?: number;
  newConfidence: number;
  previousStatus?: MemoryStatus;
  newStatus: MemoryStatus;
  changeReason: string;
  actor: "user" | "system" | "llm";
  sourceId?: string;
}

/**
 * Append-only history write. Called on every meaningful memory change —
 * creation, approval, edit, supersession, correction — so the full lifecycle
 * of a memory is always reconstructable (never overwrite, only append).
 */
export async function writeMemoryVersion(entry: VersionEntry): Promise<void> {
  await db.insert(memoryVersions).values({
    memoryId: entry.memoryId,
    previousStatement: entry.previousStatement,
    newStatement: entry.newStatement,
    previousConfidence: entry.previousConfidence,
    newConfidence: entry.newConfidence,
    previousStatus: entry.previousStatus as never,
    newStatus: entry.newStatus as never,
    changeReason: entry.changeReason,
    actor: entry.actor,
    sourceId: entry.sourceId,
  });
}
