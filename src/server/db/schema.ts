import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const sourceTypeEnum = pgEnum("source_type", ["conversation", "document", "manual"]);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const entityTypeEnum = pgEnum("entity_type", [
  "PERSON",
  "COMPANY",
  "PROJECT",
  "PRODUCT",
  "TECHNOLOGY",
  "CONCEPT",
  "DOCUMENT",
  "GOAL",
  "OTHER",
]);

export const entityStatusEnum = pgEnum("entity_status", ["ACTIVE", "ARCHIVED", "MERGED"]);

export const memoryTypeEnum = pgEnum("memory_type", [
  "FACT",
  "PREFERENCE",
  "INFERENCE",
  "TEMPORARY_STATE",
  "GOAL",
  "CONSTRAINT",
  "DECISION",
  "UNCERTAIN",
  "USER_BELIEF",
]);

export const memoryDomainEnum = pgEnum("memory_domain", [
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
]);

export const memoryOriginEnum = pgEnum("memory_origin", [
  "USER_EXPLICIT",
  "USER_STATED",
  "LLM_EXTRACTED",
  "LLM_INFERRED",
  "SYSTEM_DERIVED",
  "IMPORTED",
]);

export const memoryImportanceEnum = pgEnum("memory_importance", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const memoryStatusEnum = pgEnum("memory_status", [
  "ACTIVE",
  "PENDING_REVIEW",
  "STALE",
  "SUPERSEDED",
  "CONTRADICTED",
  "UNCERTAIN",
  "ARCHIVED",
]);

export const temporalTypeEnum = pgEnum("temporal_type", [
  "CURRENT",
  "HISTORICAL",
  "FUTURE_INTENTION",
  "TEMPORARY",
  "RECURRING",
  "SUPERSEDED",
]);

export const memoryRelationshipTypeEnum = pgEnum("memory_relationship_type", [
  "SUPPORTS",
  "CONTRADICTS",
  "SUPERSEDES",
  "DERIVED_FROM",
  "RELATED_TO",
]);

export const reviewStatusEnum = pgEnum("review_status", ["PENDING", "APPROVED", "REJECTED", "EDITED"]);

export const contradictionStatusEnum = pgEnum("contradiction_status", [
  "OPEN",
  "RESOLVED_A",
  "RESOLVED_B",
  "RESOLVED_BOTH_VALID",
  "DISMISSED",
]);

export const actorEnum = pgEnum("actor", ["user", "system", "llm"]);

export const embeddingOwnerTypeEnum = pgEnum("embedding_owner_type", ["memory", "source"]);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Raw, immutable sources
// ---------------------------------------------------------------------------

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: sourceTypeEnum("type").notNull(),
    title: text("title").notNull(),
    rawContent: text("raw_content").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sources_user_id_idx").on(t.userId)],
);

// Written only when a source's underlying content changes (e.g. re-import).
// sources.rawContent (the original, v1 content) is never overwritten.
export const sourceVersions = pgTable(
  "source_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    rawContent: text("raw_content").notNull(),
    versionNumber: integer("version_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("source_versions_source_id_idx").on(t.sourceId)],
);

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_user_id_idx").on(t.userId)],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversation_messages_conversation_id_idx").on(t.conversationId)],
);

// ---------------------------------------------------------------------------
// Entities (basic knowledge graph nodes, Phase 1)
// ---------------------------------------------------------------------------

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: entityTypeEnum("entity_type").notNull(),
    name: text("name").notNull(),
    canonicalName: text("canonical_name").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").notNull().default({}),
    status: entityStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("entities_user_id_idx").on(t.userId),
    index("entities_canonical_name_idx").on(t.userId, t.canonicalName),
  ],
);

export const entityAliases = pgTable(
  "entity_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (t) => [index("entity_aliases_entity_id_idx").on(t.entityId)],
);

// ---------------------------------------------------------------------------
// Memories (semantic memory / structured knowledge)
// ---------------------------------------------------------------------------

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    memoryType: memoryTypeEnum("memory_type").notNull(),
    domain: memoryDomainEnum("domain").notNull().default("OTHER"),
    origin: memoryOriginEnum("origin").notNull(),
    confidence: real("confidence").notNull(),
    importance: memoryImportanceEnum("importance").notNull().default("MEDIUM"),
    status: memoryStatusEnum("status").notNull().default("PENDING_REVIEW"),
    temporalType: temporalTypeEnum("temporal_type").notNull().default("CURRENT"),
    reviewRequired: boolean("review_required").notNull().default(false),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memories_user_id_idx").on(t.userId),
    index("memories_status_idx").on(t.userId, t.status),
    index("memories_statement_fts_idx").using(
      "gin",
      sql`to_tsvector('english', ${t.statement})`,
    ),
  ],
);

// Append-only history. Never overwrite — every meaningful change gets a row.
export const memoryVersions = pgTable(
  "memory_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    previousStatement: text("previous_statement"),
    newStatement: text("new_statement").notNull(),
    previousConfidence: real("previous_confidence"),
    newConfidence: real("new_confidence").notNull(),
    previousStatus: memoryStatusEnum("previous_status"),
    newStatus: memoryStatusEnum("new_status").notNull(),
    changeReason: text("change_reason").notNull(),
    actor: actorEnum("actor").notNull(),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memory_versions_memory_id_idx").on(t.memoryId)],
);

// Provenance: which raw sources support a memory.
export const memorySources = pgTable(
  "memory_sources",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.memoryId, t.sourceId] })],
);

// Which entities a memory references.
export const memoryEntities = pgTable(
  "memory_entities",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.memoryId, t.entityId] })],
);

// Explicit relationships between memories (graph edges over memory nodes).
export const memoryRelationships = pgTable(
  "memory_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromMemoryId: uuid("from_memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    toMemoryId: uuid("to_memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    relationshipType: memoryRelationshipTypeEnum("relationship_type").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memory_relationships_from_idx").on(t.fromMemoryId),
    index("memory_relationships_to_idx").on(t.toMemoryId),
  ],
);

// The approval inbox — only created for candidates the risk policy flags.
export const memoryReviews = pgTable(
  "memory_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    status: reviewStatusEnum("status").notNull().default("PENDING"),
    originalStatement: text("original_statement").notNull(),
    editedStatement: text("edited_statement"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memory_reviews_status_idx").on(t.status)],
);

// Flagged conflicts between two memories. Never auto-resolved.
export const contradictions = pgTable(
  "contradictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memoryIdA: uuid("memory_id_a")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    memoryIdB: uuid("memory_id_b")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    explanation: text("explanation").notNull(),
    status: contradictionStatusEnum("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: actorEnum("resolved_by"),
  },
  (t) => [index("contradictions_status_idx").on(t.status)],
);

// ---------------------------------------------------------------------------
// Embeddings (polymorphic — memories and sources share one vector index)
// ---------------------------------------------------------------------------

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: embeddingOwnerTypeEnum("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("embeddings_owner_idx").on(t.ownerType, t.ownerId),
    index("embeddings_vector_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    actor: actorEnum("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_user_id_idx").on(t.userId), index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);

// ---------------------------------------------------------------------------
// Relations (for ergonomic relational queries)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  sources: many(sources),
  conversations: many(conversations),
  memories: many(memories),
  entities: many(entities),
}));

export const sourcesRelations = relations(sources, ({ many, one }) => ({
  user: one(users, { fields: [sources.userId], references: [users.id] }),
  versions: many(sourceVersions),
  memorySources: many(memorySources),
}));

export const sourceVersionsRelations = relations(sourceVersions, ({ one }) => ({
  source: one(sources, { fields: [sourceVersions.sourceId], references: [sources.id] }),
}));

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  source: one(sources, { fields: [conversations.sourceId], references: [sources.id] }),
  messages: many(conversationMessages),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMessages.conversationId],
    references: [conversations.id],
  }),
}));

export const entitiesRelations = relations(entities, ({ many }) => ({
  aliases: many(entityAliases),
  memoryEntities: many(memoryEntities),
}));

export const entityAliasesRelations = relations(entityAliases, ({ one }) => ({
  entity: one(entities, { fields: [entityAliases.entityId], references: [entities.id] }),
}));

export const memoriesRelations = relations(memories, ({ many, one }) => ({
  user: one(users, { fields: [memories.userId], references: [users.id] }),
  versions: many(memoryVersions),
  memorySources: many(memorySources),
  memoryEntities: many(memoryEntities),
  reviews: many(memoryReviews),
  outgoingRelationships: many(memoryRelationships, { relationName: "fromMemory" }),
  incomingRelationships: many(memoryRelationships, { relationName: "toMemory" }),
}));

export const memoryVersionsRelations = relations(memoryVersions, ({ one }) => ({
  memory: one(memories, { fields: [memoryVersions.memoryId], references: [memories.id] }),
  source: one(sources, { fields: [memoryVersions.sourceId], references: [sources.id] }),
}));

export const memorySourcesRelations = relations(memorySources, ({ one }) => ({
  memory: one(memories, { fields: [memorySources.memoryId], references: [memories.id] }),
  source: one(sources, { fields: [memorySources.sourceId], references: [sources.id] }),
}));

export const memoryEntitiesRelations = relations(memoryEntities, ({ one }) => ({
  memory: one(memories, { fields: [memoryEntities.memoryId], references: [memories.id] }),
  entity: one(entities, { fields: [memoryEntities.entityId], references: [entities.id] }),
}));

export const memoryRelationshipsRelations = relations(memoryRelationships, ({ one }) => ({
  fromMemory: one(memories, {
    fields: [memoryRelationships.fromMemoryId],
    references: [memories.id],
    relationName: "fromMemory",
  }),
  toMemory: one(memories, {
    fields: [memoryRelationships.toMemoryId],
    references: [memories.id],
    relationName: "toMemory",
  }),
}));

export const memoryReviewsRelations = relations(memoryReviews, ({ one }) => ({
  memory: one(memories, { fields: [memoryReviews.memoryId], references: [memories.id] }),
}));

export const contradictionsRelations = relations(contradictions, ({ one }) => ({
  memoryA: one(memories, { fields: [contradictions.memoryIdA], references: [memories.id], relationName: "memoryA" }),
  memoryB: one(memories, { fields: [contradictions.memoryIdB], references: [memories.id], relationName: "memoryB" }),
}));
