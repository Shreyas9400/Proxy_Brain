import { z } from "zod";

// ---------------------------------------------------------------------------
// Enum mirrors (kept in sync with src/server/db/schema.ts by hand — Phase 1
// scope is small enough that a codegen step isn't worth the complexity yet)
// ---------------------------------------------------------------------------

export const memoryTypeValues = [
  "FACT",
  "PREFERENCE",
  "INFERENCE",
  "TEMPORARY_STATE",
  "GOAL",
  "CONSTRAINT",
  "DECISION",
  "UNCERTAIN",
  "USER_BELIEF",
] as const;

export const memoryDomainValues = [
  "PERSONAL",
  "CAREER",
  "FINANCE",
  "BUSINESS",
  "PROJECT",
  "TECHNOLOGY",
  "RELATIONSHIP",
  "KNOWLEDGE",
  "HEALTH",
  "OTHER",
] as const;

// Origins the *formation* LLM call is allowed to assign. USER_EXPLICIT is
// reserved for the explicit-command path (commands.ts) and is never chosen
// by the general extraction prompt.
export const formationOriginValues = [
  "USER_STATED",
  "LLM_EXTRACTED",
  "LLM_INFERRED",
  "SYSTEM_DERIVED",
  "IMPORTED",
] as const;

export const memoryImportanceValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const entityTypeValues = [
  "PERSON",
  "COMPANY",
  "PROJECT",
  "PRODUCT",
  "TECHNOLOGY",
  "CONCEPT",
  "DOCUMENT",
  "GOAL",
  "OTHER",
] as const;

// ---------------------------------------------------------------------------
// Memory formation structured output (src/server/memory/formation.ts)
// ---------------------------------------------------------------------------

export const entityMentionSchema = z.object({
  name: z.string().min(1).max(200),
  entity_type: z.enum(entityTypeValues),
});

export const candidateMemorySchema = z.object({
  statement: z.string().min(1).max(2000),
  memory_type: z.enum(memoryTypeValues),
  domain: z.enum(memoryDomainValues),
  origin: z.enum(formationOriginValues),
  confidence: z.number().min(0).max(1),
  importance: z.enum(memoryImportanceValues),
  entities: z.array(entityMentionSchema).max(10).default([]),
  contradicts_memory_ids: z.array(z.string()).max(5).default([]),
  contradiction_explanation: z.string().max(1000).optional(),
});
export type CandidateMemory = z.infer<typeof candidateMemorySchema>;

export const updatedMemorySchema = z.object({
  memory_id: z.string(),
  new_statement: z.string().min(1).max(2000),
  new_confidence: z.number().min(0).max(1),
  change_reason: z.string().min(1).max(500),
});
export type UpdatedMemory = z.infer<typeof updatedMemorySchema>;

export const formationOutputSchema = z.object({
  new_memories: z.array(candidateMemorySchema).max(20).default([]),
  updated_memories: z.array(updatedMemorySchema).max(10).default([]),
  discarded_information: z.array(z.string().max(500)).max(20).default([]),
});
export type FormationOutput = z.infer<typeof formationOutputSchema>;

// ---------------------------------------------------------------------------
// Explicit memory command classification (src/server/memory/commands.ts)
// ---------------------------------------------------------------------------

export const commandIntentSchema = z.object({
  type: z.enum(["REMEMBER", "FORGET", "CORRECT", "WHY", "NONE"]),
  statement: z.string().max(2000).optional(),
  target_description: z.string().max(500).optional(),
  new_statement: z.string().max(2000).optional(),
});
export type CommandIntent = z.infer<typeof commandIntentSchema>;

// ---------------------------------------------------------------------------
// API boundary schemas
// ---------------------------------------------------------------------------

export const chatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().min(1).max(8000),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const memoryReviewActionSchema = z.object({
  action: z.enum(["approve", "edit", "reject"]),
  editedStatement: z.string().min(1).max(2000).optional(),
});
export type MemoryReviewAction = z.infer<typeof memoryReviewActionSchema>;

export const contradictionResolutionSchema = z.object({
  resolution: z.enum(["RESOLVED_A", "RESOLVED_B", "RESOLVED_BOTH_VALID", "DISMISSED"]),
});
export type ContradictionResolution = z.infer<typeof contradictionResolutionSchema>;

export const memoryUpdateSchema = z.object({
  statement: z.string().min(1).max(2000).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED", "UNCERTAIN"]).optional(),
});
export type MemoryUpdate = z.infer<typeof memoryUpdateSchema>;
