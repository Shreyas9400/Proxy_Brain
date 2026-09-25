"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Something went wrong." }));
        throw new Error(body.error ?? "Something went wrong.");
      }

      const data = (await res.json()) as { conversationId: string; responseText: string };
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: "assistant", content: data.responseText }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message.");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden p-4">
      <div className="flex-1 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            Say something, or try &quot;remember that...&quot;, &quot;forget that...&quot;, or &quot;why do you think...&quot;.
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted text-foreground",
              )}
            >
              {m.content}
            </div>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="mt-3 flex items-end gap-2 border-t border-border pt-3"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Message..."
          className="max-h-40 flex-1"
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
