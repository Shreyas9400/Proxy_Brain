"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UsedMemory } from "@/server/chat/events";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  memories?: UsedMemory[];
  warning?: string;
}

export function MessageView({ message }: { message: UiMessage }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap">
        {message.content}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message.warning && (
        <p className="rounded-md bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">{message.warning}</p>
      )}
      {message.content ? (
        <div className="markdown text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      ) : message.streaming ? (
        <p className="animate-pulse text-sm text-muted-foreground">Thinking…</p>
      ) : null}
      {message.memories && message.memories.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">
            {message.memories.length} {message.memories.length === 1 ? "memory" : "memories"} used
          </summary>
          <ul className="mt-2 space-y-1.5 border-l pl-3">
            {message.memories.map((m) => (
              <li key={m.id}>
                <span className="mr-1.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] uppercase">
                  {m.memoryType.toLowerCase()} · {m.temporalType.toLowerCase()}
                </span>
                {m.statement}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
