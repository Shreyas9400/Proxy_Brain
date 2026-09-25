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
      const isOnLogin = request.nextUrl.pathname.startsWith("/login");
      if (isOnLogin) return true;
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
