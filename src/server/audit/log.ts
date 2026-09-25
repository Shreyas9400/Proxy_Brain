import { db } from "../db/client";
import { auditLog } from "../db/schema";

export type AuditActor = "user" | "system" | "llm";

export interface AuditEntry {
  userId?: string;
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    userId: entry.userId,
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    details: entry.details ?? {},
  });
}
