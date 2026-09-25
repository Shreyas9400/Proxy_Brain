import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireUserId } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { sources } from "@/server/db/schema";
import { ensureImportersRegistered, getImporterForFile } from "@/server/ingestion";
import { chunkText } from "@/server/ingestion/chunk";
import { embedSourceChunks } from "@/server/memory/embedding";
import { enqueueMemoryFormation } from "@/server/memory/formation";
import { recordAudit } from "@/server/audit/log";
import { checkRateLimit } from "@/server/security/rate-limit";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(sources).where(eq(sources.userId, userId)).orderBy(desc(sources.createdAt));
  return NextResponse.json({ sources: rows });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = checkRateLimit(`import:${userId}`, { windowMs: 60_000, max: 10 });
  if (!rate.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  ensureImportersRegistered();

  const contentType = request.headers.get("content-type") ?? "";
  let title: string;
  let text: string;
  let metadata: Record<string, unknown> = {};
  let type: "document" | "manual" = "manual";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const importer = getImporterForFile(file.name);
    if (!importer) {
      return NextResponse.json({ error: `Unsupported file type: ${file.name}` }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await importer.parse(file.name, buffer);
    title = parsed.title;
    text = parsed.text;
    metadata = parsed.metadata;
    type = "document";
  } else {
    const body = await request.json().catch(() => undefined);
    if (!body || typeof body.text !== "string" || body.text.length === 0) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }
    title = typeof body.title === "string" && body.title.length > 0 ? body.title : "Manual note";
    text = body.text;
  }

  const [source] = await db.insert(sources).values({ userId, type, title, rawContent: text, metadata }).returning();

  await embedSourceChunks(source.id, chunkText(text));

  await recordAudit({ userId, actor: "user", action: "source.imported", entityType: "source", entityId: source.id, details: { type, title } });

  // Imports run through the exact same formation pipeline + risk policy as
  // chat — an injected instruction inside a document can at most produce a
  // low-trust PENDING_REVIEW candidate a human must approve.
  enqueueMemoryFormation({ userId, sourceId: source.id, text, materialLabel: "EXTERNAL DOCUMENT" });

  return NextResponse.json({ source });
}
