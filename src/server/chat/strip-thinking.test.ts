import { describe, expect, it } from "vitest";
import { stripThinking } from "./strip-thinking";

// Applies the chunks the way the chat UI does: text appends, reset clears.
async function run(chunks: string[]): Promise<string> {
  async function* source() {
    yield* chunks;
  }
  let out = "";
  for await (const chunk of stripThinking(source())) {
    out = chunk.kind === "reset" ? "" : out + chunk.text;
  }
  return out;
}

describe("stripThinking", () => {
  it("passes plain text through unchanged", async () => {
    expect(await run(["Hello ", "world", " <b>x</b>"])).toBe("Hello world <b>x</b>");
  });

  it("removes a think block and the whitespace after it", async () => {
    expect(await run(["<think>\nplanning\n</think>\n\nAnswer."])).toBe("Answer.");
  });

  it("handles tags split across chunks", async () => {
    expect(await run(["<th", "ink>secret</thi", "nk>\nAns", "wer <", "thin", "k>more</think> end"])).toBe("Answer  end");
  });

  it("drops an unterminated think block", async () => {
    expect(await run(["Hi <think>never closed"])).toBe("Hi ");
  });

  it("keeps a trailing partial tag that never completes", async () => {
    expect(await run(["a < b and x <th"])).toBe("a < b and x <th");
  });

  it("discards reasoning that ends in a bare closing tag", async () => {
    expect(await run(["Okay, the user said hello. ", "Let me check.</th", "ink>\n\nHello! Here is ", "what I know."])).toBe(
      "Hello! Here is what I know.",
    );
  });

  it("signals a reset only when reasoning text was already emitted", async () => {
    async function* source() {
      yield "reasoning</think>answer";
    }
    const chunks = [];
    for await (const c of stripThinking(source())) chunks.push(c);
    expect(chunks).toEqual([{ kind: "text", text: "answer" }]);
  });
});
