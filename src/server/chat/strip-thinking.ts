const OPEN = "<think>";
const CLOSE = "</think>";

export type ReplyChunk =
  | { kind: "text"; text: string }
  // Everything emitted so far was reasoning, not answer: discard it.
  | { kind: "reset" };

// Length of the longest suffix of `text` that is a prefix of `tag`, i.e. how
// much to hold back in case the tag is split across two chunks.
function partialTagLength(text: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
    if (text.endsWith(tag.slice(0, n))) return n;
  }
  return 0;
}

/**
 * Removes reasoning from a streamed reply. Some local models (qwen3,
 * deepseek-r1) emit their chain of thought inline in the content, as
 * <think>…</think> or — when the template already opened the block — as
 * reasoning followed by a bare </think>. The first form is filtered out as
 * it streams; the second can only be recognized once </think> arrives, so a
 * `reset` tells the caller to throw away what it has shown so far.
 */
export async function* stripThinking(chunks: AsyncIterable<string>): AsyncIterable<ReplyChunk> {
  let buffer = "";
  let inThink = false;
  let started = false;

  // Drop the whitespace a model leaves between the think block and the answer.
  const emit = (text: string): ReplyChunk | null => {
    const out = started ? text : text.trimStart();
    if (!out) return null;
    started = true;
    return { kind: "text", text: out };
  };

  for await (const chunk of chunks) {
    buffer += chunk;
    while (buffer) {
      if (inThink) {
        const end = buffer.indexOf(CLOSE);
        if (end === -1) {
          buffer = buffer.slice(buffer.length - partialTagLength(buffer, CLOSE));
          break;
        }
        buffer = buffer.slice(end + CLOSE.length);
        inThink = false;
        continue;
      }

      const start = buffer.indexOf(OPEN);
      const orphanEnd = buffer.indexOf(CLOSE);
      if (orphanEnd !== -1 && (start === -1 || orphanEnd < start)) {
        buffer = buffer.slice(orphanEnd + CLOSE.length);
        if (started) yield { kind: "reset" };
        started = false;
        continue;
      }
      if (start === -1) {
        const hold = Math.max(partialTagLength(buffer, OPEN), partialTagLength(buffer, CLOSE));
        const out = emit(buffer.slice(0, buffer.length - hold));
        if (out) yield out;
        buffer = buffer.slice(buffer.length - hold);
        break;
      }
      const out = emit(buffer.slice(0, start));
      if (out) yield out;
      buffer = buffer.slice(start + OPEN.length);
      inThink = true;
    }
  }

  if (!inThink && buffer) {
    const out = emit(buffer);
    if (out) yield out;
  }
}
