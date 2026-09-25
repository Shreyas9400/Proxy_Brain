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
});
