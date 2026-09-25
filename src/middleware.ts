import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
