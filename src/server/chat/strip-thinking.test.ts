import { describe, expect, it } from "vitest";
import { stripThinking } from "./strip-thinking";

async function run(chunks: string[]): Promise<string> {
  async function* source() {
    yield* chunks;
  }
  let out = "";
  for await (const text of stripThinking(source())) out += text;
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
});
