import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { flattenKnowledgeSeed, parseKnowledgeSeed } from "../src/server/ingestion/knowledge-seed";

const USAGE = `Usage: npm run kb:import -- <file.json> [--email you@example.com] [--no-embed] [--dry-run]

  --email     User to import into (defaults to ADMIN_EMAIL from .env.local)
  --no-embed  Skip embeddings (keyword search still works; re-run later to backfill)
  --dry-run   Validate the file and print what would be imported, without touching the database`;

function parseArgs(argv: string[]) {
  const args = { file: undefined as string | undefined, email: undefined as string | undefined, embed: true, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") args.email = argv[++i];
    else if (arg === "--no-embed") args.embed = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (!arg.startsWith("--") && !args.file) args.file = arg;
    else throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }
  if (!args.file) throw new Error(USAGE);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(args.file!, "utf-8");
  const seed = parseKnowledgeSeed(raw);
  const items = flattenKnowledgeSeed(seed);

  if (args.dryRun) {
    for (const item of items) {
      console.log(`[${item.section}] ${item.memoryType}/${item.domain}/${item.temporalType} ${item.statement}`);
      if (item.entityNames.length > 0) console.log(`    entities: ${item.entityNames.join(", ")}`);
    }
    console.log(`\n${items.length} memories, ${seed.entities.length} entities. Dry run: nothing written.`);
    process.exit(0);
  }

  // Dynamic import: static imports are hoisted above the loadEnv() call
  // above, which would make DATABASE_URL undefined when client.ts runs.
  const { db } = await import("../src/server/db/client");
  const schema = await import("../src/server/db/schema");
  const { resolveEntity } = await import("../src/server/memory/entities");
  const { writeMemoryVersion } = await import("../src/server/memory/versioning");
  const { embedMemory } = await import("../src/server/memory/embedding");
  const { recordAudit } = await import("../src/server/audit/log");
  const { users, sources, memories, memorySources, memoryEntities, entities, entityAliases, embeddings } = schema;

  const email = args.email ?? process.env.ADMIN_EMAIL;
  if (!email) throw new Error("Pass --email or set ADMIN_EMAIL in .env.local");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`No user ${email}. Run "npm run db:seed" first.`);

  // One source per distinct file content, so re-running the same file reuses
  // it while an edited file becomes a new source (sources are immutable).
  const contentHash = createHash("sha256").update(raw).digest("hex");
  let [source] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.userId, user.id), sql`${sources.metadata}->>'contentHash' = ${contentHash}`))
    .limit(1);
  if (!source) {
    [source] = await db
      .insert(sources)
      .values({
        userId: user.id,
        type: "document",
        title: seed.source.title,
        rawContent: raw,
        metadata: {
          format: "knowledge-seed",
          fileName: basename(args.file!),
          contentHash,
          origin: seed.source.origin,
          note: seed.source.note,
        },
      })
      .returning({ id: sources.id });
  }

  const entityIds = new Map<string, string>();
  for (const e of seed.entities) {
    const id = await resolveEntity(user.id, { name: e.name, entity_type: e.entityType });
    entityIds.set(e.name, id);
    if (e.description) {
      await db.update(entities).set({ description: e.description }).where(and(eq(entities.id, id), isNull(entities.description)));
    }
    const existingAliases = new Set(
      (await db.select({ alias: entityAliases.alias }).from(entityAliases).where(eq(entityAliases.entityId, id))).map((a) => a.alias),
    );
    for (const alias of e.aliases) {
      const canonical = alias.trim().toLowerCase().replace(/\s+/g, " ");
      if (existingAliases.has(canonical)) continue;
      await db.insert(entityAliases).values({ entityId: id, alias: canonical });
      existingAliases.add(canonical);
    }
  }

  let created = 0;
  let existing = 0;
  let embedded = 0;
  const embedFailures: string[] = [];

  for (const item of items) {
    let [memory] = await db
      .select({ id: memories.id, status: memories.status })
      .from(memories)
      .where(and(eq(memories.userId, user.id), eq(memories.statement, item.statement)))
      .limit(1);

    if (memory) {
      existing++;
    } else {
      const status = item.review ? "PENDING_REVIEW" : "ACTIVE";
      [memory] = await db
        .insert(memories)
        .values({
          userId: user.id,
          statement: item.statement,
          memoryType: item.memoryType,
          domain: item.domain,
          origin: "IMPORTED",
          confidence: item.confidence,
          importance: item.importance,
          status,
          temporalType: item.temporalType,
          reviewRequired: item.review,
          reviewReason: item.review ? "Flagged for review in import file" : null,
        })
        .returning({ id: memories.id, status: memories.status });
      await writeMemoryVersion({
        memoryId: memory.id,
        newStatement: item.statement,
        newConfidence: item.confidence,
        newStatus: status,
        changeReason: `Imported from "${seed.source.title}" (${item.section}${item.label ? ` / ${item.label}` : ""})`,
        actor: "user",
        sourceId: source.id,
      });
      created++;
    }

    // Links are (re)ensured for existing memories too, so a re-run repairs a
    // previously interrupted import and links unchanged items to a new source.
    await db.insert(memorySources).values({ memoryId: memory.id, sourceId: source.id }).onConflictDoNothing();
    for (const name of item.entityNames) {
      await db.insert(memoryEntities).values({ memoryId: memory.id, entityId: entityIds.get(name)! }).onConflictDoNothing();
    }

    // Only ACTIVE memories are searchable; see embedMemory.
    if (args.embed && memory.status === "ACTIVE") {
      const [hasEmbedding] = await db
        .select({ id: embeddings.id })
        .from(embeddings)
        .where(and(eq(embeddings.ownerType, "memory"), eq(embeddings.ownerId, memory.id)))
        .limit(1);
      if (!hasEmbedding) {
        try {
          await embedMemory(memory.id, item.statement);
          embedded++;
        } catch (err) {
          embedFailures.push(`${item.statement.slice(0, 60)}…: ${(err as Error).message}`);
        }
      }
    }
  }

  await recordAudit({
    userId: user.id,
    actor: "user",
    action: "knowledge.imported",
    entityType: "source",
    entityId: source.id,
    details: { file: basename(args.file!), created, existing, embedded, entities: seed.entities.length },
  });

  console.log(`Source: ${seed.source.title} (${source.id})`);
  console.log(`Memories: ${created} created, ${existing} already present`);
  console.log(`Entities: ${seed.entities.length} resolved`);
  console.log(args.embed ? `Embeddings: ${embedded} created` : "Embeddings: skipped (--no-embed)");
  if (embedFailures.length > 0) {
    console.warn(`\n${embedFailures.length} embeddings failed (re-run to retry). First error:\n  ${embedFailures[0]}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
