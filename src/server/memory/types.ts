import type { z } from "zod";
import type { entityMentionSchema } from "../validation/schemas";

export type EntityMention = z.infer<typeof entityMentionSchema>;

export interface RankedMemory {
  id: string;
  statement: string;
  memoryType: string;
  domain: string;
  origin: string;
  confidence: number;
  importance: string;
  status: string;
  temporalType: string;
  score: number;
}

export interface ContextPackage {
  memories: RankedMemory[];
  entities: Array<{ id: string; name: string; entityType: string }>;
  openContradictions: Array<{ id: string; explanation: string; memoryIdA: string; memoryIdB: string }>;
  historicalQuery: boolean;
}
