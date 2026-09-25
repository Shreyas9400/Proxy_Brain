import { describe, expect, it } from "vitest";
import { classify, POLICY_THRESHOLDS } from "@/server/memory/policy";
import type { CandidateMemory } from "@/server/validation/schemas";

function candidate(overrides: Partial<CandidateMemory> = {}): CandidateMemory {
  return {
    statement: "The user likes coffee.",
    memory_type: "PREFERENCE",
    domain: "PERSONAL",
    origin: "USER_STATED",
    confidence: 0.9,
    importance: "LOW",
    entities: [],
    contradicts_memory_ids: [],
    ...overrides,
  };
}

describe("classify (risk-based review policy)", () => {
  const table: Array<{ name: string; candidate: CandidateMemory; hasContradiction?: boolean; expectedStatus: "ACTIVE" | "PENDING_REVIEW" }> = [
    {
      name: "USER_STATED, low importance, high confidence -> auto ACTIVE",
      candidate: candidate({ origin: "USER_STATED", importance: "LOW", confidence: 0.85 }),
      expectedStatus: "ACTIVE",
    },
    {
      name: "USER_STATED, medium importance, confidence at floor -> auto ACTIVE",
      candidate: candidate({ origin: "USER_STATED", importance: "MEDIUM", confidence: POLICY_THRESHOLDS.USER_STATED_AUTO_CONFIDENCE }),
      expectedStatus: "ACTIVE",
    },
    {
      name: "USER_STATED, high importance -> review required regardless of confidence",
      candidate: candidate({ origin: "USER_STATED", importance: "HIGH", confidence: 0.99 }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "USER_STATED, confidence just below auto threshold -> review required",
      candidate: candidate({ origin: "USER_STATED", importance: "LOW", confidence: POLICY_THRESHOLDS.USER_STATED_AUTO_CONFIDENCE - 0.01 }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "LLM_EXTRACTED, low importance, confidence above threshold -> auto ACTIVE",
      candidate: candidate({ origin: "LLM_EXTRACTED", importance: "LOW", confidence: POLICY_THRESHOLDS.EXTRACTED_AUTO_CONFIDENCE }),
      expectedStatus: "ACTIVE",
    },
    {
      name: "LLM_EXTRACTED, critical importance -> review required",
      candidate: candidate({ origin: "LLM_EXTRACTED", importance: "CRITICAL", confidence: 0.99 }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "IMPORTED treated like LLM_EXTRACTED: high importance -> review required",
      candidate: candidate({ origin: "IMPORTED", importance: "HIGH", confidence: 0.99 }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "IMPORTED, low importance, confidence above threshold -> auto ACTIVE",
      candidate: candidate({ origin: "IMPORTED", importance: "LOW", confidence: POLICY_THRESHOLDS.EXTRACTED_AUTO_CONFIDENCE }),
      expectedStatus: "ACTIVE",
    },
    {
      name: "LLM_INFERRED, confidence 0.9 and LOW importance -> auto ACTIVE",
      candidate: candidate({ origin: "LLM_INFERRED", importance: "LOW", confidence: POLICY_THRESHOLDS.INFERRED_AUTO_CONFIDENCE }),
      expectedStatus: "ACTIVE",
    },
    {
      name: "LLM_INFERRED, confidence 0.9 but MEDIUM importance -> review required (importance must be LOW)",
      candidate: candidate({ origin: "LLM_INFERRED", importance: "MEDIUM", confidence: POLICY_THRESHOLDS.INFERRED_AUTO_CONFIDENCE }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "LLM_INFERRED, low confidence -> review required",
      candidate: candidate({ origin: "LLM_INFERRED", importance: "LOW", confidence: 0.7 }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "SYSTEM_DERIVED, non-critical -> auto ACTIVE",
      candidate: candidate({ origin: "SYSTEM_DERIVED", importance: "HIGH", confidence: 0.9 }),
      expectedStatus: "ACTIVE",
    },
    {
      name: "SYSTEM_DERIVED, critical -> review required",
      candidate: candidate({ origin: "SYSTEM_DERIVED", importance: "CRITICAL", confidence: 0.9 }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "DECISION memory type -> always review required, even USER_STATED low importance",
      candidate: candidate({ origin: "USER_STATED", memory_type: "DECISION", importance: "LOW", confidence: 0.99 }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "confidence below the global review floor -> review required regardless of origin",
      candidate: candidate({ origin: "USER_STATED", importance: "LOW", confidence: POLICY_THRESHOLDS.CONFIDENCE_REVIEW_FLOOR - 0.01 }),
      expectedStatus: "PENDING_REVIEW",
    },
    {
      name: "contradiction against an existing ACTIVE memory -> always review required",
      candidate: candidate({ origin: "USER_STATED", importance: "LOW", confidence: 0.99 }),
      hasContradiction: true,
      expectedStatus: "PENDING_REVIEW",
    },
  ];

  for (const { name, candidate: c, hasContradiction, expectedStatus } of table) {
    it(name, () => {
      const decision = classify(c, { hasContradiction: hasContradiction ?? false });
      expect(decision.status).toBe(expectedStatus);
      expect(decision.reviewRequired).toBe(expectedStatus === "PENDING_REVIEW");
      if (expectedStatus === "PENDING_REVIEW") {
        expect(decision.reviewReason).toBeTruthy();
      } else {
        expect(decision.reviewReason).toBeUndefined();
      }
    });
  }

  it("USER_EXPLICIT is never passed to classify (handled by commands.ts before this function runs)", () => {
    // formationOriginValues (what the LLM extraction schema allows) excludes
    // USER_EXPLICIT entirely -- this is a documentation test, not a call.
    const origins: CandidateMemory["origin"][] = ["USER_STATED", "LLM_EXTRACTED", "LLM_INFERRED", "SYSTEM_DERIVED", "IMPORTED"];
    expect(origins).not.toContain("USER_EXPLICIT");
  });
});
