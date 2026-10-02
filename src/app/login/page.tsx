import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Proxy Brain" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Proxy Brain</h1>
          <p className="text-sm text-muted-foreground">Sign in to your personal memory.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
