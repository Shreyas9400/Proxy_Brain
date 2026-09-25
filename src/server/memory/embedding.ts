import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { embeddings } from "../db/schema";
import { getEmbeddingProvider } from "../llm";

/**
 * Embeds a memory's statement and upserts it into the shared embeddings
 * table. Only ACTIVE memories should be embedded — PENDING_REVIEW candidates
 * are not searchable until approved, so an incorrect inference never
 * surfaces in retrieval before a human confirms it.
 */
export async function embedMemory(memoryId: string, statement: string): Promise<void> {
  const provider = getEmbeddingProvider();
  const [vector] = await provider.embed([statement]);

  await db.delete(embeddings).where(and(eq(embeddings.ownerType, "memory"), eq(embeddings.ownerId, memoryId)));
  await db.insert(embeddings).values({
    ownerType: "memory",
    ownerId: memoryId,
    chunkIndex: 0,
    chunkText: statement,
    embedding: vector,
  });
}

export async function removeMemoryEmbedding(memoryId: string): Promise<void> {
  await db.delete(embeddings).where(and(eq(embeddings.ownerType, "memory"), eq(embeddings.ownerId, memoryId)));
}

export async function embedSourceChunks(sourceId: string, chunks: string[]): Promise<void> {
  if (chunks.length === 0) return;
  const provider = getEmbeddingProvider();
  const vectors = await provider.embed(chunks);

  await db.delete(embeddings).where(and(eq(embeddings.ownerType, "source"), eq(embeddings.ownerId, sourceId)));
  await db.insert(embeddings).values(
    chunks.map((chunkText, i) => ({
      ownerType: "source" as const,
      ownerId: sourceId,
      chunkIndex: i,
      chunkText,
      embedding: vectors[i],
    })),
  );
}
