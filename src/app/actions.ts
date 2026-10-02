"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { auth, signIn, signOut } from "@/server/auth";
import { deleteConversation } from "@/server/chat/conversations";

export interface LoginState {
  error?: string;
  // Echoed back because React resets the form after the action runs.
  email?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    // signIn redirects on success by throwing; only swallow auth failures.
    if (err instanceof AuthError) {
      const email = formData.get("email");
      // Anything other than bad credentials is a server problem (e.g. the
      // database is down) and shouldn't look like a wrong password.
      const error =
        err.type === "CredentialsSignin"
          ? "Incorrect email or password."
          : "Sign-in failed on the server. Is the database running? Check the terminal running npm run dev.";
      return { error, email: typeof email === "string" ? email : undefined };
    }
    throw err;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

export async function removeConversation(conversationId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await deleteConversation(session.user.id, conversationId);
  revalidatePath("/");
}
