import { describe, expect, it } from "vitest";
import { txtImporter } from "@/server/ingestion/importers/txt";
import { csvImporter } from "@/server/ingestion/importers/csv";
import { jsonImporter } from "@/server/ingestion/importers/json";

describe("txtImporter", () => {
  it("parses raw text and records size metadata", async () => {
    const buffer = Buffer.from("The user prefers dark mode.", "utf-8");
    const doc = await txtImporter.parse("notes.txt", buffer);
    expect(doc.title).toBe("notes.txt");
    expect(doc.text).toBe("The user prefers dark mode.");
    expect(doc.metadata.sizeBytes).toBe(buffer.byteLength);
  });
});

describe("csvImporter", () => {
  it("turns rows into labeled, human-readable text", async () => {
    const buffer = Buffer.from("name,role\nAlice,Engineer\nBob,Designer\n", "utf-8");
    const doc = await csvImporter.parse("team.csv", buffer);
    expect(doc.text).toContain("Columns: name, role");
    expect(doc.text).toContain("name: Alice, role: Engineer");
    expect(doc.text).toContain("name: Bob, role: Designer");
    expect(doc.metadata.rowCount).toBe(2);
  });

  it("handles an empty CSV without throwing", async () => {
    const doc = await csvImporter.parse("empty.csv", Buffer.from(""));
    expect(doc.text).toBe("");
    expect(doc.metadata.rowCount).toBe(0);
  });

  it("skips a single-cell preamble (e.g. LinkedIn's Connections.csv 'Notes:' header) to find the real column header", async () => {
    const buffer = Buffer.from(
      [
        "Notes:",
        '"When exporting your connection data you may notice some names missing..."',
        "",
        "First Name,Last Name,Company,Position,Connected On",
        "Ada,Lovelace,Analytical Engines Ltd,Mathematician,01 Jan 2024",
      ].join("\n"),
      "utf-8",
    );
    const doc = await csvImporter.parse("Connections.csv", buffer);
    expect(doc.text).toContain("Columns: First Name, Last Name, Company, Position, Connected On");
    expect(doc.text).toContain("First Name: Ada, Last Name: Lovelace, Company: Analytical Engines Ltd, Position: Mathematician, Connected On: 01 Jan 2024");
    expect(doc.metadata.rowCount).toBe(1);
    // csv-parse's skip_empty_lines drops the blank line before indexing, so
    // only the two single-cell preamble lines ("Notes:" + the sentence) count.
    expect(doc.metadata.skippedPreambleRows).toBe(2);
  });

  it("does not skip anything for a CSV that already starts with a proper header", async () => {
    const buffer = Buffer.from("name,role\nAlice,Engineer\n", "utf-8");
    const doc = await csvImporter.parse("team.csv", buffer);
    expect(doc.metadata.skippedPreambleRows).toBe(0);
  });
});

describe("jsonImporter", () => {
  it("pretty-prints valid JSON and records its top-level type", async () => {
    const doc = await jsonImporter.parse("data.json", Buffer.from('{"a":1}'));
    expect(doc.text).toBe('{\n  "a": 1\n}');
    expect(doc.metadata.topLevelType).toBe("object");
  });

  it("rejects invalid JSON with a clear error rather than importing garbage", async () => {
    await expect(jsonImporter.parse("bad.json", Buffer.from("{not valid"))).rejects.toThrow(/Invalid JSON/);
  });

  it("detects a ChatGPT conversations.json export and extracts a clean transcript", async () => {
    const conversations = [
      {
        title: "Planning a trip",
        create_time: 1700000000,
        mapping: {
          n1: {
            message: {
              author: { role: "system" },
              content: { content_type: "text", parts: ["You are a helpful assistant."] },
              create_time: 1700000000,
            },
          },
          n2: {
            message: {
              author: { role: "user" },
              content: { content_type: "text", parts: ["Where should I go in Japan?"] },
              create_time: 1700000001,
            },
          },
          n3: {
            message: {
              author: { role: "assistant" },
              content: { content_type: "text", parts: ["Kyoto is a great choice."] },
              create_time: 1700000002,
            },
          },
          n4: { message: null },
        },
      },
    ];

    const doc = await jsonImporter.parse("conversations.json", Buffer.from(JSON.stringify(conversations)));
    expect(doc.metadata.source).toBe("chatgpt-export");
    expect(doc.metadata.conversationCount).toBe(1);
    expect(doc.metadata.extractedCount).toBe(1);
    expect(doc.text).toContain("Planning a trip");
    expect(doc.text).toContain("User: Where should I go in Japan?");
    expect(doc.text).toContain("Assistant: Kyoto is a great choice.");
    // The system prompt and the null message must not leak into the transcript.
    expect(doc.text).not.toContain("You are a helpful assistant.");
  });

  it("falls back to plain pretty-printing for an ordinary JSON array (not a ChatGPT export)", async () => {
    const doc = await jsonImporter.parse("data.json", Buffer.from(JSON.stringify([{ a: 1 }, { a: 2 }])));
    expect(doc.metadata.source).toBeUndefined();
    expect(doc.metadata.topLevelType).toBe("array");
  });
});
