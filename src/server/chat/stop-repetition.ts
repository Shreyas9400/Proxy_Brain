// An empty list item ("* ", "- ", "3.") — never meaningful in markdown, and
// the usual shape of a small model stuck in a loop.
const EMPTY_ITEM = /^\s*([*+-]|\d+[.)])\s*$/;
// A line that may still become an empty item once more text arrives.
const MAYBE_EMPTY_ITEM = /^\s*([*+-]|\d+[.)])?\s*$/;

const MAX_EMPTY_ITEMS = 3;
const MAX_SAME_LINE = 3;

/**
 * Cuts a streamed reply off when the model starts looping: a run of empty
 * list items, or the same non-empty line over and over. Small local models
 * (qwen3 4B) can otherwise repeat until the token limit. Empty items are
 * held back rather than streamed, so they never reach the UI or the
 * database; returning early also ends the generation upstream.
 */
export async function* stopRepetition(chunks: AsyncIterable<string>): AsyncIterable<string> {
  let line = ""; // full text of the current, unfinished line
  let sent = 0; // how much of `line` has already been yielded
  let held = ""; // empty list items (and blank lines between them) not yet shown
  let emptyCount = 0;
  let lastLine: string | null = null;
  let sameCount = 0;

  for await (const chunk of chunks) {
    let out = "";
    const parts = chunk.split("\n");
    for (let i = 0; i < parts.length; i++) {
      line += parts[i];
      if (i === parts.length - 1) break; // no newline after this part yet

      const trimmed = line.trim();
      if (EMPTY_ITEM.test(line)) {
        held += `${line}\n`;
        if (++emptyCount >= MAX_EMPTY_ITEMS) {
          if (out) yield out;
          return;
        }
      } else if (!trimmed && held) {
        held += "\n";
      } else {
        if (trimmed) {
          sameCount = trimmed === lastLine ? sameCount + 1 : 1;
          lastLine = trimmed;
          out += held;
          held = "";
          emptyCount = 0;
        }
        out += `${line.slice(sent)}\n`;
        if (sameCount >= MAX_SAME_LINE) {
          yield out;
          return;
        }
      }
      line = "";
      sent = 0;
    }

    // Stream the unfinished line as it grows, unless it could still turn
    // out to be an empty list item.
    if (!MAYBE_EMPTY_ITEM.test(line)) {
      out += held + line.slice(sent);
      held = "";
      emptyCount = 0;
      sent = line.length;
    }
    if (out) yield out;
  }

  // Trailing empty items are dropped; a final unfinished line is kept.
  if (line.trim() && !EMPTY_ITEM.test(line)) yield held + line.slice(sent);
}
