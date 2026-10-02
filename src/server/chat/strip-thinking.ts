const OPEN = "<think>";
const CLOSE = "</think>";

// Length of the longest suffix of `text` that is a prefix of `tag`, i.e. how
// much to hold back in case the tag is split across two chunks.
function partialTagLength(text: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
    if (text.endsWith(tag.slice(0, n))) return n;
  }
  return 0;
}

/**
 * Removes <think>…</think> reasoning blocks from a streamed reply. Some local
 * models (qwen3, deepseek-r1) emit their chain of thought inline in the
 * content; the chat should only show and store the answer.
 */
export async function* stripThinking(chunks: AsyncIterable<string>): AsyncIterable<string> {
  let buffer = "";
  let inThink = false;
  let started = false;

  const emit = (text: string) => {
    // Drop the whitespace a model leaves between the think block and the answer.
    const out = started ? text : text.trimStart();
    if (out) started = true;
    return out;
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
      } else {
        const start = buffer.indexOf(OPEN);
        if (start === -1) {
          const hold = partialTagLength(buffer, OPEN);
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
  }

  if (!inThink && buffer) {
    const out = emit(buffer);
    if (out) yield out;
  }
}
