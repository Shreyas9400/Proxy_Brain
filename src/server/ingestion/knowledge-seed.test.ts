import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findMentionedEntities, flattenKnowledgeSeed, parseKnowledgeSeed } from "./knowledge-seed";

const seed = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    source: { title: "Test" },
    entities: [
      { name: "Credit risk", entityType: "CONCEPT" },
      { name: "Dr Sayali's Clinic", entityType: "COMPANY", aliases: ["Smile Care"] },
      { name: "OTF", entityType: "COMPANY" },
    ],
    sections: [
      {
        title: "Work",
        domain: "CAREER",
        temporalType: "HISTORICAL",
        items: [
          { statement: "Did credit-risk work.", temporalType: "CURRENT" },
          { statement: "Mentioned Smile Care.", entities: ["otf"], review: true },
        ],
      },
    ],
    ...overrides,
  });

describe("knowledge seed", () => {
  it("applies item > section > file defaults", () => {
    const [first, second] = flattenKnowledgeSeed(parseKnowledgeSeed(seed({ defaults: { importance: "HIGH" } })));
    expect(first).toMatchObject({ domain: "CAREER", temporalType: "CURRENT", importance: "HIGH", memoryType: "FACT" });
    expect(second).toMatchObject({ temporalType: "HISTORICAL", review: true, confidence: 0.75 });
  });

  it("links entities by name, alias or explicit reference", () => {
    const [first, second] = flattenKnowledgeSeed(parseKnowledgeSeed(seed()));
    expect(first.entityNames).toEqual(["Credit risk"]);
    expect(second.entityNames).toEqual(["Dr Sayali's Clinic", "OTF"]);
  });

  it("matches whole words only and normalizes curly apostrophes", () => {
    const entities = parseKnowledgeSeed(seed()).entities;
    expect(findMentionedEntities("A HOTFIX for credit risks", entities)).toEqual([]);
    expect(findMentionedEntities("Visited Dr Sayali’s Clinic", entities)).toEqual(["Dr Sayali's Clinic"]);
  });

  it("rejects unknown entity references and invalid enums", () => {
    const badRef = seed({ sections: [{ title: "x", items: [{ statement: "s", entities: ["Nope"] }] }] });
    expect(() => flattenKnowledgeSeed(parseKnowledgeSeed(badRef))).toThrow(/unknown entity "Nope"/);
    const badEnum = seed({ sections: [{ title: "x", domain: "SPORTS", items: [{ statement: "s" }] }] });
    expect(() => parseKnowledgeSeed(badEnum)).toThrow(/validation/);
  });

  it("parses the bundled example file", () => {
    const raw = readFileSync("data/examples/knowledge-seed.example.json", "utf-8");
    expect(flattenKnowledgeSeed(parseKnowledgeSeed(raw))).toHaveLength(4);
  });
});
