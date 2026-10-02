import { z } from "zod";
import {
  entityTypeValues,
  memoryDomainValues,
  memoryImportanceValues,
  memoryTypeValues,
} from "../validation/schemas";

/**
 * "Knowledge seed" files: hand-curated (or exported-and-cleaned) lists of
 * statements that go straight into memories, bypassing LLM formation. Used
 * for bulk-loading an existing knowledge base such as a ChatGPT memory dump.
 * See scripts/import-knowledge.ts for the importer and
 * data/examples/knowledge-seed.example.json for the format.
 */

const temporalTypeValues = ["CURRENT", "HISTORICAL", "FUTURE_INTENTION", "TEMPORARY", "RECURRING"] as const;

// Fields that can be set on the file, on a section, or on an individual item;
// the most specific level wins.
const memoryFieldsSchema = z.object({
  memoryType: z.enum(memoryTypeValues).optional(),
  domain: z.enum(memoryDomainValues).optional(),
  temporalType: z.enum(temporalTypeValues).optional(),
  importance: z.enum(memoryImportanceValues).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const seedItemSchema = memoryFieldsSchema.extend({
  label: z.string().min(1).max(200).optional(),
  statement: z.string().min(1).max(2000),
  // Entity names (or aliases) to link in addition to those found in the text.
  entities: z.array(z.string().min(1)).default([]),
  // Import into the review inbox instead of straight to ACTIVE.
  review: z.boolean().default(false),
});

const seedSectionSchema = memoryFieldsSchema.extend({
  title: z.string().min(1).max(200),
  items: z.array(seedItemSchema),
});

const seedEntitySchema = z.object({
  name: z.string().min(1).max(200),
  entityType: z.enum(entityTypeValues),
  aliases: z.array(z.string().min(1).max(200)).default([]),
  description: z.string().max(2000).optional(),
});

export const knowledgeSeedSchema = z.object({
  source: z.object({
    title: z.string().min(1).max(200),
    origin: z.string().max(100).optional(),
    note: z.string().max(5000).optional(),
  }),
  defaults: memoryFieldsSchema.default({}),
  entities: z.array(seedEntitySchema).default([]),
  sections: z.array(seedSectionSchema).min(1),
});

export type KnowledgeSeed = z.infer<typeof knowledgeSeedSchema>;
export type SeedEntity = z.infer<typeof seedEntitySchema>;

export interface SeedMemory {
  section: string;
  label?: string;
  statement: string;
  memoryType: (typeof memoryTypeValues)[number];
  domain: (typeof memoryDomainValues)[number];
  temporalType: (typeof temporalTypeValues)[number];
  importance: (typeof memoryImportanceValues)[number];
  confidence: number;
  review: boolean;
  entityNames: string[];
}

export function parseKnowledgeSeed(raw: string): KnowledgeSeed {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Knowledge seed is not valid JSON: ${(err as Error).message}`);
  }
  const result = knowledgeSeedSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Knowledge seed failed validation:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function normalizeText(text: string): string {
  return text.replace(/[’‘]/g, "'");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word, case-insensitive match where spaces and hyphens are
// interchangeable ("credit risk" matches "credit-risk").
function namePattern(name: string): RegExp {
  const body = normalizeText(name).trim().split(/[\s-]+/).map(escapeRegex).join("[\\s-]+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu");
}

/** Returns the canonical names of seed entities mentioned in `text`. */
export function findMentionedEntities(text: string, entities: SeedEntity[]): string[] {
  const normalized = normalizeText(text);
  return entities
    .filter((e) => [e.name, ...e.aliases].some((n) => namePattern(n).test(normalized)))
    .map((e) => e.name);
}

/** Flattens sections into fully-resolved memories, applying defaults and entity matching. */
export function flattenKnowledgeSeed(seed: KnowledgeSeed): SeedMemory[] {
  const byName = new Map<string, string>();
  for (const e of seed.entities) {
    for (const n of [e.name, ...e.aliases]) byName.set(normalizeText(n).toLowerCase(), e.name);
  }

  return seed.sections.flatMap((section) =>
    section.items.map((item) => {
      const explicit = item.entities.map((n) => {
        const resolved = byName.get(normalizeText(n).toLowerCase());
        if (!resolved) throw new Error(`Item "${item.label ?? item.statement}" references unknown entity "${n}"`);
        return resolved;
      });
      const entityNames = Array.from(new Set([...findMentionedEntities(item.statement, seed.entities), ...explicit]));

      return {
        section: section.title,
        label: item.label,
        statement: item.statement.trim(),
        memoryType: item.memoryType ?? section.memoryType ?? seed.defaults.memoryType ?? "FACT",
        domain: item.domain ?? section.domain ?? seed.defaults.domain ?? "OTHER",
        temporalType: item.temporalType ?? section.temporalType ?? seed.defaults.temporalType ?? "CURRENT",
        importance: item.importance ?? section.importance ?? seed.defaults.importance ?? "MEDIUM",
        confidence: item.confidence ?? section.confidence ?? seed.defaults.confidence ?? 0.75,
        review: item.review,
        entityNames,
      };
    }),
  );
}
