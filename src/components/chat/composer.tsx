"use client";

import { useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  pending: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ pending, onSend, onStop }: Props) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="border-t bg-background px-4 py-3">
      <form
        className="mx-auto flex max-w-3xl items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything… (Shift+Enter for a new line)"
          rows={1}
          className="max-h-48 min-h-10 resize-none"
          aria-label="Message"
          autoFocus
        />
        {pending ? (
          <Button type="button" size="icon-lg" variant="outline" onClick={onStop} aria-label="Stop generating">
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon-lg" disabled={!text.trim()} aria-label="Send">
            <ArrowUp />
          </Button>
        )}
      </form>
    </div>
  );
}
