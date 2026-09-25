import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { entities, entityAliases } from "../db/schema";
import type { EntityMention } from "./types";

function canonicalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolves an entity mention to an existing entity row, or creates one.
 * Phase 1 dedup is deliberately simple (case-insensitive canonical name +
 * alias lookup) — fuzzy/semantic entity resolution is a later-phase upgrade.
 */
export async function resolveEntity(userId: string, mention: EntityMention): Promise<string> {
  const canonicalName = canonicalize(mention.name);

  const [byName] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.canonicalName, canonicalName)))
    .limit(1);
  if (byName) return byName.id;

  const [byAlias] = await db
    .select({ entityId: entityAliases.entityId })
    .from(entityAliases)
    .innerJoin(entities, eq(entities.id, entityAliases.entityId))
    .where(and(eq(entities.userId, userId), eq(entityAliases.alias, canonicalName)))
    .limit(1);
  if (byAlias) return byAlias.entityId;

  const [created] = await db
    .insert(entities)
    .values({
      userId,
      entityType: mention.entity_type,
      name: mention.name,
      canonicalName,
      status: "ACTIVE",
    })
    .returning({ id: entities.id });

  return created.id;
}

export async function resolveEntities(userId: string, mentions: EntityMention[]): Promise<string[]> {
  const ids: string[] = [];
  for (const mention of mentions) {
    ids.push(await resolveEntity(userId, mention));
  }
  return ids;
}
