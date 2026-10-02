import { describe, expect, it } from "vitest";
import { stopRepetition } from "./stop-repetition";

async function run(chunks: string[]): Promise<{ text: string; consumed: number }> {
  let consumed = 0;
  async function* source() {
    for (const c of chunks) {
      consumed++;
      yield c;
    }
  }
  let text = "";
  for await (const t of stopRepetition(source())) text += t;
  return { text, consumed };
}

describe("stopRepetition", () => {
  it("passes normal markdown through unchanged", async () => {
    const md = "Hi!\n\n* one\n* two\n\n1. a\n2. b\n\nDone.";
    expect((await run([md])).text).toBe(md);
    expect((await run(md.split(""))).text).toBe(md);
  });

  it("stops at a run of empty list items and hides them", async () => {
    const chunks = ["Let me know!\n\n", "* ", "\n", "* \n", "* \n", "* \n", "* \n", "never reached"];
    const { text, consumed } = await run(chunks);
    expect(text).toBe("Let me know!\n\n");
    expect(consumed).toBeLessThan(chunks.length);
  });

  it("keeps a single empty item that is followed by content", async () => {
    expect((await run(["* \n", "* real item\n"])).text).toBe("* \n* real item\n");
  });

  it("drops trailing empty items at the end of the reply", async () => {
    expect((await run(["Answer.\n* \n* "])).text).toBe("Answer.\n");
  });

  it("stops when the same line repeats", async () => {
    const chunks = ["Intro\n", "I am stuck.\n", "I am ", "stuck.\n", "I am stuck.\n", "I am stuck.\n", "more"];
    const { text, consumed } = await run(chunks);
    expect(text).toBe("Intro\nI am stuck.\nI am stuck.\nI am stuck.\n");
    expect(consumed).toBe(5);
  });
});
