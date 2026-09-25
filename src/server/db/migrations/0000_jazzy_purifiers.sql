CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."actor" AS ENUM('user', 'system', 'llm');--> statement-breakpoint
CREATE TYPE "public"."contradiction_status" AS ENUM('OPEN', 'RESOLVED_A', 'RESOLVED_B', 'RESOLVED_BOTH_VALID', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."embedding_owner_type" AS ENUM('memory', 'source');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('ACTIVE', 'ARCHIVED', 'MERGED');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('PERSON', 'COMPANY', 'PROJECT', 'PRODUCT', 'TECHNOLOGY', 'CONCEPT', 'DOCUMENT', 'GOAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."memory_domain" AS ENUM('PERSONAL', 'CAREER', 'FINANCE', 'BUSINESS', 'PROJECT', 'TECHNOLOGY', 'RELATIONSHIP', 'KNOWLEDGE', 'HEALTH', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."memory_importance" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."memory_origin" AS ENUM('USER_EXPLICIT', 'USER_STATED', 'LLM_EXTRACTED', 'LLM_INFERRED', 'SYSTEM_DERIVED', 'IMPORTED');--> statement-breakpoint
CREATE TYPE "public"."memory_relationship_type" AS ENUM('SUPPORTS', 'CONTRADICTS', 'SUPERSEDES', 'DERIVED_FROM', 'RELATED_TO');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('ACTIVE', 'PENDING_REVIEW', 'STALE', 'SUPERSEDED', 'CONTRADICTED', 'UNCERTAIN', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('FACT', 'PREFERENCE', 'INFERENCE', 'TEMPORARY_STATE', 'GOAL', 'CONSTRAINT', 'DECISION', 'UNCERTAIN', 'USER_BELIEF');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EDITED');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('conversation', 'document', 'manual');--> statement-breakpoint
CREATE TYPE "public"."temporal_type" AS ENUM('CURRENT', 'HISTORICAL', 'FUTURE_INTENTION', 'TEMPORARY', 'RECURRING', 'SUPERSEDED');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor" "actor" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contradictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id_a" uuid NOT NULL,
	"memory_id_b" uuid NOT NULL,
	"explanation" text NOT NULL,
	"status" "contradiction_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" "actor"
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "embedding_owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"canonical_name" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "entity_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"memory_type" "memory_type" NOT NULL,
	"domain" "memory_domain" DEFAULT 'OTHER' NOT NULL,
	"origin" "memory_origin" NOT NULL,
	"confidence" real NOT NULL,
	"importance" "memory_importance" DEFAULT 'MEDIUM' NOT NULL,
	"status" "memory_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"temporal_type" "temporal_type" DEFAULT 'CURRENT' NOT NULL,
	"review_required" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entities" (
	"memory_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	CONSTRAINT "memory_entities_memory_id_entity_id_pk" PRIMARY KEY("memory_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "memory_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_memory_id" uuid NOT NULL,
	"to_memory_id" uuid NOT NULL,
	"relationship_type" "memory_relationship_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"status" "review_status" DEFAULT 'PENDING' NOT NULL,
	"original_statement" text NOT NULL,
	"edited_statement" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_sources" (
	"memory_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "memory_sources_memory_id_source_id_pk" PRIMARY KEY("memory_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "memory_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"previous_statement" text,
	"new_statement" text NOT NULL,
	"previous_confidence" real,
	"new_confidence" real NOT NULL,
	"previous_status" "memory_status",
	"new_status" "memory_status" NOT NULL,
	"change_reason" text NOT NULL,
	"actor" "actor" NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"raw_content" text NOT NULL,
	"version_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "source_type" NOT NULL,
	"title" text NOT NULL,
	"raw_content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contradictions" ADD CONSTRAINT "contradictions_memory_id_a_memories_id_fk" FOREIGN KEY ("memory_id_a") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contradictions" ADD CONSTRAINT "contradictions_memory_id_b_memories_id_fk" FOREIGN KEY ("memory_id_b") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_relationships" ADD CONSTRAINT "memory_relationships_from_memory_id_memories_id_fk" FOREIGN KEY ("from_memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_relationships" ADD CONSTRAINT "memory_relationships_to_memory_id_memories_id_fk" FOREIGN KEY ("to_memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_reviews" ADD CONSTRAINT "memory_reviews_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_sources" ADD CONSTRAINT "memory_sources_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_sources" ADD CONSTRAINT "memory_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_versions" ADD CONSTRAINT "memory_versions_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_versions" ADD CONSTRAINT "memory_versions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_versions" ADD CONSTRAINT "source_versions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "contradictions_status_idx" ON "contradictions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_id_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "embeddings_owner_idx" ON "embeddings" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "embeddings_vector_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "entities_user_id_idx" ON "entities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entities_canonical_name_idx" ON "entities" USING btree ("user_id","canonical_name");--> statement-breakpoint
CREATE INDEX "entity_aliases_entity_id_idx" ON "entity_aliases" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "memories_user_id_idx" ON "memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memories_status_idx" ON "memories" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "memories_statement_fts_idx" ON "memories" USING gin (to_tsvector('english', "statement"));--> statement-breakpoint
CREATE INDEX "memory_relationships_from_idx" ON "memory_relationships" USING btree ("from_memory_id");--> statement-breakpoint
CREATE INDEX "memory_relationships_to_idx" ON "memory_relationships" USING btree ("to_memory_id");--> statement-breakpoint
CREATE INDEX "memory_reviews_status_idx" ON "memory_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_versions_memory_id_idx" ON "memory_versions" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "source_versions_source_id_idx" ON "source_versions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sources_user_id_idx" ON "sources" USING btree ("user_id");