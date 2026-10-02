import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getConversation, getMessages, listConversations } from "@/server/chat/conversations";
import { ChatApp } from "@/components/chat/chat-app";

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const { c } = await searchParams;
  const conversation = typeof c === "string" ? await getConversation(userId, c) : undefined;
  const [conversations, messages] = await Promise.all([
    listConversations(userId),
    conversation ? getMessages(conversation.id) : Promise.resolve([]),
  ]);

  return (
    <ChatApp
      userName={session.user?.name ?? session.user?.email ?? "You"}
      conversations={conversations.map((x) => ({ id: x.id, title: x.title }))}
      conversationId={conversation?.id ?? null}
      initialMessages={messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))}
    />
  );
}
