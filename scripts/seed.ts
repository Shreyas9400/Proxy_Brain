import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function main() {
  // Dynamic import: static imports are hoisted above the loadEnv() call
  // above, which would make DATABASE_URL undefined when client.ts runs.
  const { db } = await import("../src/server/db/client");
  const { users } = await import("../src/server/db/schema");

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "You";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local");
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    await db.update(users).set({ passwordHash, name }).where(eq(users.id, existing.id));
    console.log(`Updated existing user ${email}`);
  } else {
    await db.insert(users).values({ email, passwordHash, name });
    console.log(`Created user ${email}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
