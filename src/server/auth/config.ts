import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base config (no providers, no db/bcrypt imports) so it can be
 * used by middleware, which runs in the Edge runtime. The full config with
 * the Credentials provider lives in ./index.ts and is only used by the
 * route handler and server components (Node runtime).
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/login")) {
        return isLoggedIn ? Response.redirect(new URL("/", request.nextUrl)) : true;
      }
      // API callers get a 401 instead of a redirect to the login page.
      if (!isLoggedIn && pathname.startsWith("/api/")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
