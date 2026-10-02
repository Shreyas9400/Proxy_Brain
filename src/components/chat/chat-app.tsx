"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrainCircuit, LogOut, Menu, MessageSquarePlus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout, removeConversation } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { ChatEvent, UsedMemory } from "@/server/chat/events";
import { Composer } from "./composer";
import { MessageView, type UiMessage } from "./message";

interface Props {
  userName: string;
  conversations: Array<{ id: string; title: string }>;
  conversationId: string | null;
  initialMessages: UiMessage[];
}

export function ChatApp({ userName, conversations, conversationId: serverConversationId, initialMessages }: Props) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(serverConversationId);
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Opening a different conversation from the sidebar re-renders the server
  // page with new props; reset local state to match. A refresh of the
  // conversation we are already in (after sending) keeps local state, which
  // also holds the "memories used" details the server doesn't store.
  const [prevServerId, setPrevServerId] = useState(serverConversationId);
  if (serverConversationId !== prevServerId) {
    setPrevServerId(serverConversationId);
    if (serverConversationId !== conversationId) {
      setConversationId(serverConversationId);
      setMessages(initialMessages);
      setError(null);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function startNewChat() {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    // A real navigation (not pushState) so the server-side conversation id
    // prop goes back to null and reopening the same conversation reloads it.
    router.push("/");
  }

  async function send(text: string) {
    setError(null);
    setPending(true);
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    const update = (patch: Partial<UiMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

    const controller = new AbortController();
    abortRef.current = controller;
    let content = "";
    let memories: UsedMemory[] = [];
    let createdId: string | null = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: text }),
        signal: controller.signal,
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "meta") {
            memories = event.memories;
            update({ memories, warning: event.warning });
            if (!conversationId) {
              createdId = event.conversationId;
              setConversationId(event.conversationId);
              window.history.replaceState(null, "", `/?c=${event.conversationId}`);
            }
          } else if (event.type === "delta") {
            content += event.text;
            update({ content });
          } else if (event.type === "reset") {
            content = "";
            update({ content });
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      update({ streaming: false });
      setPending(false);
      abortRef.current = null;
      // New conversations should appear in the sidebar.
      if (createdId) router.refresh();
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {sidebarOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r bg-background transition-transform md:static md:translate-x-0 md:bg-muted/30",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <BrainCircuit className="size-5" />
          <span className="font-semibold">Proxy Brain</span>
          <Button variant="ghost" size="icon-sm" className="ml-auto md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X />
          </Button>
        </div>
        <div className="px-3">
          <Button variant="outline" className="w-full justify-start" onClick={startNewChat}>
            <MessageSquarePlus /> New chat
          </Button>
        </div>
        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Conversations</p>
          {conversations.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">None yet</p>}
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id} className="group relative">
                <Link
                  href={`/?c=${c.id}`}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "block truncate rounded-md py-1.5 pr-8 pl-2 text-sm hover:bg-muted",
                    c.id === conversationId && "bg-muted font-medium",
                  )}
                >
                  {c.title}
                </Link>
                <button
                  aria-label={`Delete "${c.title}"`}
                  className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-destructive md:hidden md:group-hover:block md:focus-visible:block"
                  onClick={async () => {
                    if (!confirm(`Delete "${c.title}"?`)) return;
                    if (c.id === conversationId) startNewChat();
                    await removeConversation(c.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2 border-t px-4 py-3">
          <span className="truncate text-sm">{userName}</span>
          <form action={logout} className="ml-auto">
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <span className="font-semibold">Proxy Brain</span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-2 pt-[20vh] text-center">
                <BrainCircuit className="size-10 text-muted-foreground" />
                <h1 className="text-xl font-semibold">What do you want to know?</h1>
                <p className="max-w-md text-sm text-muted-foreground">
                  Answers use your stored memories. Expand &ldquo;memories used&rdquo; under a reply to see which ones.
                </p>
              </div>
            ) : (
              messages.map((m) => <MessageView key={m.id} message={m} />)
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <Composer pending={pending} onSend={send} onStop={() => abortRef.current?.abort()} />
      </main>
    </div>
  );
}
