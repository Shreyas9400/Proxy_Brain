import { auth } from "./index";

/** Returns the current user's id, or undefined if unauthenticated. Every API route uses this — never trust a client-supplied user id. */
export async function requireUserId(): Promise<string | undefined> {
  const session = await auth();
  return session?.user?.id;
}
