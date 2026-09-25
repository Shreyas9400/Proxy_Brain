import { describe, expect, it } from "vitest";
import {
  isHistoricalQuery,
  statusScore,
  recencyScore,
  scoreCandidate,
  RETRIEVAL_WEIGHTS,
  type Candidate,
} from "@/server/memory/retrieval";

describe("isHistoricalQuery", () => {
  it("detects historical-flavored phrasing", () => {
    expect(isHistoricalQuery("Where did I used to work?")).toBe(true);
    expect(isHistoricalQuery("What was the history of that decision?")).toBe(true);
    expect(isHistoricalQuery("Originally, what did we plan?")).toBe(true);
  });

  it("treats an ordinary present-tense query as non-historical", () => {
    expect(isHistoricalQuery("Where do I work?")).toBe(false);
    expect(isHistoricalQuery("What's my favorite coffee order?")).toBe(false);
  });
});

describe("statusScore", () => {
  it("weights ACTIVE highest and excludes PENDING_REVIEW/ARCHIVED from retrieval entirely", () => {
    expect(statusScore("ACTIVE", false)).toBe(1.0);
    expect(statusScore("PENDING_REVIEW", false)).toBeNull();
    expect(statusScore("ARCHIVED", false)).toBeNull();
  });

  it("excludes SUPERSEDED/CONTRADICTED for a non-historical query, includes them at low weight for a historical one", () => {
    expect(statusScore("SUPERSEDED", false)).toBeNull();
    expect(statusScore("CONTRADICTED", false)).toBeNull();
    expect(statusScore("SUPERSEDED", true)).toBe(0.2);
    expect(statusScore("CONTRADICTED", true)).toBe(0.2);
  });
});

describe("recencyScore", () => {
  it("scores a just-confirmed memory near 1.0", () => {
    expect(recencyScore(new Date())).toBeCloseTo(1.0, 2);
  });

  it("decays for older confirmations but never reaches zero", () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const score = recencyScore(oneYearAgo);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.1);
  });

  it("is monotonically decreasing with age", () => {
    const recent = recencyScore(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000));
    const older = recencyScore(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000));
    expect(recent).toBeGreaterThan(older);
  });
});

function baseCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "mem-1",
    statement: "The user works at Acme.",
    memoryType: "FACT",
    domain: "CAREER",
    origin: "USER_STATED",
    confidence: 0.9,
    importance: "MEDIUM",
    status: "ACTIVE",
    temporalType: "CURRENT",
    updatedAt: new Date(),
    lastConfirmedAt: new Date(),
    semanticSimilarity: 0,
    keywordMatch: false,
    entityMatch: false,
    ...overrides,
  };
}

describe("scoreCandidate", () => {
  it("scores a strong semantic + keyword + entity match higher than a weak one", () => {
    const strong = scoreCandidate(baseCandidate({ semanticSimilarity: 0.9, keywordMatch: true, entityMatch: true }), false);
    const weak = scoreCandidate(baseCandidate({ semanticSimilarity: 0.1, keywordMatch: false, entityMatch: false }), false);
    expect(strong).toBeGreaterThan(weak);
  });

  it("scores higher importance above lower importance, all else equal", () => {
    const critical = scoreCandidate(baseCandidate({ importance: "CRITICAL" }), false);
    const low = scoreCandidate(baseCandidate({ importance: "LOW" }), false);
    expect(critical).toBeGreaterThan(low);
  });

  it("combines signals using the centralized RETRIEVAL_WEIGHTS, which sum to 1", () => {
    const total = Object.values(RETRIEVAL_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});
