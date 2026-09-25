import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireUserId } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { sourceVersions, sources } from "@/server/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [source] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.id, id), eq(sources.userId, userId)))
    .limit(1);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await db.select().from(sourceVersions).where(eq(sourceVersions.sourceId, id)).orderBy(asc(sourceVersions.versionNumber));

  return NextResponse.json({ source, versions });
}
