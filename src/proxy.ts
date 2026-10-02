import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/config";

// Next.js 16 renamed middleware.ts to proxy.ts. Optimistic auth check only;
// pages and route handlers still verify the session themselves.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
