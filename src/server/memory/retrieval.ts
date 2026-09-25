import { and, cosineDistance, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { embeddings, entities, memories, memoryEntities } from "../db/schema";
import { getEmbeddingProvider } from "../llm";
import type { ContextPackage, RankedMemory } from "./types";
import { contradictions as contradictionsTable } from "../db/schema";

// Centralized, tunable retrieval weights. All signals are normalized to
// [0, 1] before being combined, so these weights are directly comparable.
export const RETRIEVAL_WEIGHTS = {
  semantic: 0.35,
  keyword: 0.15,
  recency: 0.15,
  importance: 0.15,
  confidence: 0.1,
  status: 0.1,
} as const;

const IMPORTANCE_SCORE: Record<string, number> = { LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, CRITICAL: 1.0 };

const HISTORICAL_QUERY_PATTERN = /\b(originally|used to|previously|before|used to be|history of|in the past|historically|old(?:er)? (?:pricing|decision|plan))\b/i;

export function isHistoricalQuery(query: string): boolean {
  return HISTORICAL_QUERY_PATTERN.test(query);
}

function statusScore(status: string, historical: boolean): number | null {
  if (status === "ACTIVE") return 1.0;
  if (status === "UNCERTAIN") return 0.5;
  if (status === "STALE") return 0.6;
  if (historical && (status === "SUPERSEDED" || status === "CONTRADICTED")) return 0.2;
  // PENDING_REVIEW, ARCHIVED, and SUPERSEDED/CONTRADICTED on a non-historical
  // query are excluded from retrieval entirely.
  return null;
}

function recencyScore(lastConfirmedAt: Date): number {
  const ageDays = (Date.now() - lastConfirmedAt.getTime()) / (1000 * 60 * 60 * 24);
  // Half-life of ~30 days: recent confirmations dominate, old ones fade but
  // never hit zero (a fact confirmed a year ago is still worth surfacing).
  return Math.exp(-ageDays / 30);
}

interface Candidate {
  id: string;
  statement: string;
  memoryType: string;
  domain: string;
  origin: string;
  confidence: number;
  importance: string;
  status: string;
  temporalType: string;
  updatedAt: Date;
  lastConfirmedAt: Date;
  semanticSimilarity: number;
  keywordMatch: boolean;
  entityMatch: boolean;
}

/**
 * Low-level candidate search used by both hybrid retrieval (buildContextPackage)
 * and memory formation's contradiction check (formation.ts needs "existing
 * memories that might relate to this new statement").
 */
export async function findCandidateMemories(
  userId: string,
  queryText: string,
  opts: { limit?: number; historical?: boolean } = {},
): Promise<Candidate[]> {
  const limit = opts.limit ?? 30;
  const historical = opts.historical ?? isHistoricalQuery(queryText);

  const embeddingProvider = getEmbeddingProvider();
  const [queryVector] = await embeddingProvider.embed([queryText]);
  const similarity = sql<number>`1 - (${cosineDistance(embeddings.embedding, queryVector)})`;

  const semanticRows = await db
    .select({
      id: memories.id,
      statement: memories.statement,
      memoryType: memories.memoryType,
      domain: memories.domain,
      origin: memories.origin,
      confidence: memories.confidence,
      importance: memories.importance,
      status: memories.status,
      temporalType: memories.temporalType,
      updatedAt: memories.updatedAt,
      lastConfirmedAt: memories.lastConfirmedAt,
      similarity,
    })
    .from(embeddings)
    .innerJoin(memories, eq(memories.id, embeddings.ownerId))
    .where(and(eq(embeddings.ownerType, "memory"), eq(memories.userId, userId), gt(similarity, 0.15)))
    .orderBy(sql`${similarity} desc`)
    .limit(limit);

  const keywordRows = await db
    .select({
      id: memories.id,
      statement: memories.statement,
      memoryType: memories.memoryType,
      domain: memories.domain,
      origin: memories.origin,
      confidence: memories.confidence,
      importance: memories.importance,
      status: memories.status,
      temporalType: memories.temporalType,
      updatedAt: memories.updatedAt,
      lastConfirmedAt: memories.lastConfirmedAt,
    })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        sql`to_tsvector('english', ${memories.statement}) @@ plainto_tsquery('english', ${queryText})`,
      ),
    )
    .limit(limit);

  // Naive entity mention detection: does the query text contain an entity's
  // name? Good enough for Phase 1; a proper NER pass is a later upgrade.
  const userEntities = await db.select().from(entities).where(eq(entities.userId, userId));
  const mentionedEntityIds = userEntities
    .filter((e) => queryText.toLowerCase().includes(e.canonicalName))
    .map((e) => e.id);

  let entityMemoryIds = new Set<string>();
  if (mentionedEntityIds.length > 0) {
    const rows = await db
      .select({ memoryId: memoryEntities.memoryId })
      .from(memoryEntities)
      .where(inArray(memoryEntities.entityId, mentionedEntityIds));
    entityMemoryIds = new Set(rows.map((r) => r.memoryId));
  }

  const merged = new Map<string, Candidate>();
  for (const row of semanticRows) {
    merged.set(row.id, {
      ...row,
      semanticSimilarity: row.similarity,
      keywordMatch: false,
      entityMatch: entityMemoryIds.has(row.id),
    });
  }
  for (const row of keywordRows) {
    const existing = merged.get(row.id);
    if (existing) {
      existing.keywordMatch = true;
    } else {
      merged.set(row.id, {
        ...row,
        semanticSimilarity: 0,
        keywordMatch: true,
        entityMatch: entityMemoryIds.has(row.id),
      });
    }
  }

  return Array.from(merged.values()).filter((c) => statusScore(c.status, historical) !== null);
}

function scoreCandidate(c: Candidate, historical: boolean): number {
  const status = statusScore(c.status, historical) ?? 0;
  const importance = IMPORTANCE_SCORE[c.importance] ?? 0.5;
  const recency = recencyScore(c.lastConfirmedAt);
  const entityBoost = c.entityMatch ? 0.1 : 0;

  return (
    RETRIEVAL_WEIGHTS.semantic * c.semanticSimilarity +
    RETRIEVAL_WEIGHTS.keyword * (c.keywordMatch ? 1 : 0) +
    RETRIEVAL_WEIGHTS.recency * recency +
    RETRIEVAL_WEIGHTS.importance * importance +
    RETRIEVAL_WEIGHTS.confidence * c.confidence +
    RETRIEVAL_WEIGHTS.status * status +
    entityBoost
  );
}

/**
 * The main entry point for chat: turns a user query into a compact,
 * ranked, labeled context package — never raw database rows.
 */
export async function buildContextPackage(userId: string, queryText: string, limit = 8): Promise<ContextPackage> {
  const historical = isHistoricalQuery(queryText);
  const candidates = await findCandidateMemories(userId, queryText, { historical });

  const ranked: RankedMemory[] = candidates
    .map((c) => ({
      id: c.id,
      statement: c.statement,
      memoryType: c.memoryType,
      domain: c.domain,
      origin: c.origin,
      confidence: c.confidence,
      importance: c.importance,
      status: c.status,
      temporalType: c.temporalType,
      score: scoreCandidate(c, historical),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const rankedIds = ranked.map((r) => r.id);
  const entityRows =
    rankedIds.length > 0
      ? await db
          .select({ id: entities.id, name: entities.name, entityType: entities.entityType })
          .from(memoryEntities)
          .innerJoin(entities, eq(entities.id, memoryEntities.entityId))
          .where(inArray(memoryEntities.memoryId, rankedIds))
      : [];

  const uniqueEntities = Array.from(new Map(entityRows.map((e) => [e.id, e])).values());

  const openContradictionRows =
    rankedIds.length > 0
      ? await db
          .select()
          .from(contradictionsTable)
          .where(
            and(
              eq(contradictionsTable.status, "OPEN"),
              or(inArray(contradictionsTable.memoryIdA, rankedIds), inArray(contradictionsTable.memoryIdB, rankedIds)),
            ),
          )
      : [];

  return {
    memories: ranked,
    entities: uniqueEntities,
    openContradictions: openContradictionRows.map((c) => ({
      id: c.id,
      explanation: c.explanation,
      memoryIdA: c.memoryIdA,
      memoryIdB: c.memoryIdB,
    })),
    historicalQuery: historical,
  };
}
