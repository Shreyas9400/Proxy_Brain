import { describe, expect, it } from "vitest";
import { candidateMemorySchema, formationOutputSchema, commandIntentSchema } from "@/server/validation/schemas";

function validCandidate(overrides: Record<string, unknown> = {}) {
  return {
    statement: "User believes their current employer may go bankrupt.",
    memory_type: "USER_BELIEF",
    domain: "CAREER",
    origin: "USER_STATED",
    confidence: 0.7,
    importance: "MEDIUM",
    entities: [{ name: "Acme Corp", entity_type: "COMPANY" }],
    contradicts_memory_ids: [],
    ...overrides,
  };
}

describe("candidateMemorySchema", () => {
  it("accepts a well-formed candidate, defaulting optional arrays", () => {
    const result = candidateMemorySchema.safeParse({
      statement: "User prefers tea over coffee.",
      memory_type: "PREFERENCE",
      domain: "PERSONAL",
      origin: "USER_STATED",
      confidence: 0.8,
      importance: "LOW",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entities).toEqual([]);
      expect(result.data.contradicts_memory_ids).toEqual([]);
    }
  });

  it("accepts USER_BELIEF phrased from the user's perspective", () => {
    expect(candidateMemorySchema.safeParse(validCandidate()).success).toBe(true);
  });

  it("rejects an origin the formation LLM is not allowed to assign (USER_EXPLICIT)", () => {
    const result = candidateMemorySchema.safeParse(validCandidate({ origin: "USER_EXPLICIT" }));
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(candidateMemorySchema.safeParse(validCandidate({ confidence: 1.5 })).success).toBe(false);
    expect(candidateMemorySchema.safeParse(validCandidate({ confidence: -0.1 })).success).toBe(false);
  });

  it("rejects an unknown memory_type or domain", () => {
    expect(candidateMemorySchema.safeParse(validCandidate({ memory_type: "SPECULATION" })).success).toBe(false);
    expect(candidateMemorySchema.safeParse(validCandidate({ domain: "ASTROLOGY" })).success).toBe(false);
  });

  it("rejects a missing statement", () => {
    const rest = validCandidate();
    delete (rest as Record<string, unknown>).statement;
    expect(candidateMemorySchema.safeParse(rest).success).toBe(false);
  });
});

describe("formationOutputSchema", () => {
  it("accepts an empty formation result (nothing worth remembering)", () => {
    const result = formationOutputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.new_memories).toEqual([]);
      expect(result.data.updated_memories).toEqual([]);
      expect(result.data.discarded_information).toEqual([]);
    }
  });

  it("accepts a mix of new and updated memories", () => {
    const result = formationOutputSchema.safeParse({
      new_memories: [validCandidate()],
      updated_memories: [
        { memory_id: "mem-1", new_statement: "User now works at a different company.", new_confidence: 0.85, change_reason: "Job change mentioned in chat" },
      ],
      discarded_information: ["Small talk about the weather"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a new_memories entry that fails candidateMemorySchema", () => {
    const result = formationOutputSchema.safeParse({ new_memories: [{ statement: "" }] });
    expect(result.success).toBe(false);
  });
});

describe("commandIntentSchema", () => {
  it("accepts a REMEMBER intent", () => {
    const result = commandIntentSchema.safeParse({ type: "REMEMBER", statement: "User's birthday is in March." });
    expect(result.success).toBe(true);
  });

  it("accepts a NONE intent with no other fields", () => {
    expect(commandIntentSchema.safeParse({ type: "NONE" }).success).toBe(true);
  });

  it("rejects an unrecognized intent type", () => {
    expect(commandIntentSchema.safeParse({ type: "DELETE_EVERYTHING" }).success).toBe(false);
  });
});
