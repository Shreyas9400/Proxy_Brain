import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireUserId } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { memories, memoryDomainEnum, memoryStatusEnum } from "@/server/db/schema";

function isValidStatus(value: string): value is (typeof memoryStatusEnum.enumValues)[number] {
  return (memoryStatusEnum.enumValues as readonly string[]).includes(value);
}

function isValidDomain(value: string): value is (typeof memoryDomainEnum.enumValues)[number] {
  return (memoryDomainEnum.enumValues as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const domain = url.searchParams.get("domain");

  const conditions = [eq(memories.userId, userId)];
  if (status && isValidStatus(status)) conditions.push(eq(memories.status, status));
  if (domain && isValidDomain(domain)) conditions.push(eq(memories.domain, domain));

  const rows = await db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.updatedAt))
    .limit(200);

  return NextResponse.json({ memories: rows });
}
