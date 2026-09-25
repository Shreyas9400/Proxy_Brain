import type { CandidateMemory } from "../validation/schemas";

export interface PolicyContext {
  hasContradiction: boolean;
}

export interface PolicyDecision {
  status: "ACTIVE" | "PENDING_REVIEW";
  reviewRequired: boolean;
  reviewReason?: string;
}

// Centralized, named thresholds — see plan section "Risk-based review policy"
// for the reasoning behind each number. Change these, not the branches below,
// when tuning how conservative the system is.
export const POLICY_THRESHOLDS = {
  CONFIDENCE_REVIEW_FLOOR: 0.6,
  USER_STATED_AUTO_CONFIDENCE: 0.8,
  EXTRACTED_AUTO_CONFIDENCE: 0.85,
  INFERRED_AUTO_CONFIDENCE: 0.9,
} as const;

/**
 * Pure risk-based classifier: decides whether a freshly extracted candidate
 * memory can become ACTIVE immediately or must wait in the review inbox.
 * Never called for origin=USER_EXPLICIT — that path (commands.ts) always
 * auto-activates and skips this function entirely.
 */
export function classify(candidate: CandidateMemory, context: PolicyContext): PolicyDecision {
  if (context.hasContradiction) {
    return {
      status: "PENDING_REVIEW",
      reviewRequired: true,
      reviewReason: "Conflicts with an existing active memory",
    };
  }

  if (candidate.confidence < POLICY_THRESHOLDS.CONFIDENCE_REVIEW_FLOOR) {
    return {
      status: "PENDING_REVIEW",
      reviewRequired: true,
      reviewReason: "Confidence below the review floor",
    };
  }

  if (candidate.memory_type === "DECISION") {
    return {
      status: "PENDING_REVIEW",
      reviewRequired: true,
      reviewReason: "Decisions always require confirmation",
    };
  }

  const highImportance = candidate.importance === "HIGH" || candidate.importance === "CRITICAL";

  switch (candidate.origin) {
    case "USER_STATED": {
      if (highImportance) {
        return {
          status: "PENDING_REVIEW",
          reviewRequired: true,
          reviewReason: "High-importance user-stated information",
        };
      }
      if (candidate.confidence >= POLICY_THRESHOLDS.USER_STATED_AUTO_CONFIDENCE) {
        return { status: "ACTIVE", reviewRequired: false };
      }
      return {
        status: "PENDING_REVIEW",
        reviewRequired: true,
        reviewReason: "Confidence below auto-activation threshold",
      };
    }

    case "LLM_EXTRACTED":
    case "IMPORTED": {
      if (highImportance) {
        return {
          status: "PENDING_REVIEW",
          reviewRequired: true,
          reviewReason: "High-importance extracted or imported information",
        };
      }
      if (candidate.confidence >= POLICY_THRESHOLDS.EXTRACTED_AUTO_CONFIDENCE) {
        return { status: "ACTIVE", reviewRequired: false };
      }
      return {
        status: "PENDING_REVIEW",
        reviewRequired: true,
        reviewReason: "Confidence below auto-activation threshold",
      };
    }

    case "LLM_INFERRED": {
      if (candidate.confidence >= POLICY_THRESHOLDS.INFERRED_AUTO_CONFIDENCE && candidate.importance === "LOW") {
        return { status: "ACTIVE", reviewRequired: false };
      }
      return {
        status: "PENDING_REVIEW",
        reviewRequired: true,
        reviewReason: "Inferred information requires review by default",
      };
    }

    case "SYSTEM_DERIVED": {
      if (candidate.importance === "CRITICAL") {
        return {
          status: "PENDING_REVIEW",
          reviewRequired: true,
          reviewReason: "Critical system-derived information requires review",
        };
      }
      return { status: "ACTIVE", reviewRequired: false };
    }
  }
}
