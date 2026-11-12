import type { RoleName } from "@/lib/auth/types";
import type { CurrencyCode } from "@/lib/format/currency";
import { formatRelativeVerifiedTime } from "@/lib/format/currency";

export type VerificationTypeValue =
  | "IDENTITY"
  | "PROOF_OF_FUNDS"
  | "PAYMENT_CONNECTOR"
  | "ANALYTICS_CONNECTOR";

export type VerificationStatusValue =
  | "PENDING"
  | "VERIFIED"
  | "EXPIRED"
  | "FAILED"
  | "REVOKED";

export type IdentityProvider = "Persona" | "Digio KYC";
export type ProofOfFundsProvider = "Setu AA" | "Plaid Assets";
export type PaymentConnectorProvider = "Stripe" | "Razorpay";
export type AnalyticsConnectorProvider = "GA4" | "Plausible";

export interface VerificationRecord {
  id: string;
  provider: string;
  status: VerificationStatusValue;
  verifiedAt: Date | string | null;
  expiresAt: Date | string | null;
  failureReason?: string | null;
}

export interface VerificationMetadata {
  roleContext?: "BUYER" | "SELLER";
  legalName?: string;
  country?: string;
  documentType?: string;
  maskedReference?: string;
  declaredAmount?: number;
  currency?: CurrencyCode;
  institutionLabel?: string;
  attestationRef?: string;
  connectorKind?: "PAYMENT" | "ANALYTICS";
  accountIdentifier?: string;
  accountHint?: string;
  readOnlyScope?: boolean;
  syncIntervalMinutes?: number;
  lastSyncAttemptAt?: string;
  nextSyncAt?: string;
  adapterMode?: "live" | "sandbox";
  sandboxTokenBehavior?: "valid" | "fail" | "expired";
  syncedMetricKeys?: string[];
  reviewerNote?: string;
  reviewedById?: string;
  reviewedAt?: string;
}

export interface FullVerificationRecord extends VerificationRecord {
  userId: string | null;
  userName?: string | null;
  userEmail?: string | null;
  businessId: string | null;
  businessTitle?: string | null;
  businessSlug?: string | null;
  type: VerificationTypeValue;
  metadata: VerificationMetadata;
  isSampleData: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EffectiveMetricTrustState =
  | "verified"
  | "seller-reported"
  | "pending"
  | "expired"
  | "failed";

export interface EvaluatedVerification {
  isVerified: boolean;
  effectiveState: EffectiveMetricTrustState;
  label: string;
  detail: string;
  lastVerifiedLabel: string | null;
}

export type AdminVerificationDecision = "APPROVE" | "FAIL" | "EXPIRE" | "REVOKE";

const ADMIN_DECISION_TO_STATUS: Record<
  AdminVerificationDecision,
  VerificationStatusValue
> = {
  APPROVE: "VERIFIED",
  FAIL: "FAILED",
  EXPIRE: "EXPIRED",
  REVOKE: "REVOKED",
};

const ADMIN_DECISION_TO_ACTION: Record<AdminVerificationDecision, string> = {
  APPROVE: "VERIFICATION_APPROVED",
  FAIL: "VERIFICATION_FAILED",
  EXPIRE: "VERIFICATION_EXPIRED",
  REVOKE: "VERIFICATION_REVOKED",
};

export const ALLOWED_VERIFICATION_REVIEW_TRANSITIONS: Record<
  VerificationStatusValue,
  readonly VerificationStatusValue[]
> = {
  PENDING: ["VERIFIED", "FAILED", "REVOKED"],
  VERIFIED: ["FAILED", "EXPIRED", "REVOKED"],
  EXPIRED: ["VERIFIED", "FAILED", "REVOKED"],
  FAILED: ["VERIFIED", "REVOKED"],
  REVOKED: ["VERIFIED"],
};

export function validateVerificationReviewTransition(params: {
  actorRoles: RoleName[];
  fromStatus: VerificationStatusValue;
  decision: AdminVerificationDecision;
  reviewerNote: string;
}):
  | {
      ok: true;
      nextStatus: VerificationStatusValue;
      auditAction: string;
      reviewerNote: string;
    }
  | {
      ok: false;
      code: "FORBIDDEN" | "INVALID_TRANSITION" | "NOTE_REQUIRED";
      reason: string;
    } {
  const isStaff =
    params.actorRoles.includes("ADMIN") || params.actorRoles.includes("REVIEWER");
  if (!isStaff) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Admin or Reviewer role is required to review verifications.",
    };
  }

  const trimmedNote = params.reviewerNote.trim();
  if (trimmedNote.length < 5) {
    return {
      ok: false,
      code: "NOTE_REQUIRED",
      reason:
        "Enter a reviewer note (at least 5 characters) explaining this verification decision.",
    };
  }

  const nextStatus = ADMIN_DECISION_TO_STATUS[params.decision];
  const allowed = ALLOWED_VERIFICATION_REVIEW_TRANSITIONS[params.fromStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      reason: `Cannot transition verification from ${params.fromStatus} to ${nextStatus}.`,
    };
  }

  return {
    ok: true,
    nextStatus,
    auditAction: ADMIN_DECISION_TO_ACTION[params.decision],
    reviewerNote: trimmedNote,
  };
}

export function hasActiveBuyerDataAccessVerification(params: {
  identity: VerificationRecord | null | undefined;
  proofOfFunds: VerificationRecord | null | undefined;
  now?: Date;
}): {
  allowed: boolean;
  identityEvaluated: EvaluatedVerification;
  proofOfFundsEvaluated: EvaluatedVerification;
  reason: string;
} {
  const now = params.now ?? new Date();
  const identityEvaluated = evaluateVerification(params.identity, now);
  const proofOfFundsEvaluated = evaluateVerification(params.proofOfFunds, now);

  if (!identityEvaluated.isVerified && !proofOfFundsEvaluated.isVerified) {
    return {
      allowed: false,
      identityEvaluated,
      proofOfFundsEvaluated,
      reason:
        "Buyer identity check (KYC) and proof of funds must both be verified before entering Data access.",
    };
  }
  if (!identityEvaluated.isVerified) {
    return {
      allowed: false,
      identityEvaluated,
      proofOfFundsEvaluated,
      reason:
        "Buyer identity check (KYC) is required or has expired before entering Data access.",
    };
  }
  if (!proofOfFundsEvaluated.isVerified) {
    return {
      allowed: false,
      identityEvaluated,
      proofOfFundsEvaluated,
      reason:
        "Active Proof of Funds verification is required or has expired before entering Data access.",
    };
  }

  return {
    allowed: true,
    identityEvaluated,
    proofOfFundsEvaluated,
    reason: "Identity and Proof of Funds checks are active and verified.",
  };
}

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Rule (Section 2 & 6):
 * - A 'Verified' mark renders ONLY from a real verification record.
 * - Verification records require provider, verifiedAt, and expiresAt.
 * - Expired, failed, pending, or revoked records NEVER render as Verified.
 */
export function evaluateVerification(
  record: VerificationRecord | null | undefined,
  now: Date = new Date()
): EvaluatedVerification {
  if (!record || !record.provider || record.provider.trim().length === 0) {
    return {
      isVerified: false,
      effectiveState: "seller-reported",
      label: "Seller-reported",
      detail: "Not connected to a third-party data source",
      lastVerifiedLabel: null,
    };
  }

  if (record.status === "FAILED" || record.status === "REVOKED") {
    return {
      isVerified: false,
      effectiveState: "failed",
      label: record.status === "REVOKED" ? "Connection revoked" : "Connection failed",
      detail: record.failureReason ?? `${record.provider} verification failed`,
      lastVerifiedLabel: null,
    };
  }

  if (record.status === "PENDING") {
    return {
      isVerified: false,
      effectiveState: "pending",
      label: "Verification pending",
      detail: `Awaiting ${record.provider} confirmation`,
      lastVerifiedLabel: null,
    };
  }

  const verifiedAt = toValidDate(record.verifiedAt);
  const expiresAt = toValidDate(record.expiresAt);

  if (
    record.status === "EXPIRED" ||
    !verifiedAt ||
    !expiresAt ||
    expiresAt.getTime() <= now.getTime()
  ) {
    return {
      isVerified: false,
      effectiveState: "expired",
      label: "Verification expired",
      detail: `${record.provider} verification expired — re-verification required`,
      lastVerifiedLabel: verifiedAt ? formatRelativeVerifiedTime(verifiedAt, now) : null,
    };
  }

  if (record.status === "VERIFIED") {
    return {
      isVerified: true,
      effectiveState: "verified",
      label: "Verified",
      detail: `Read-only via ${record.provider}`,
      lastVerifiedLabel: formatRelativeVerifiedTime(verifiedAt, now),
    };
  }

  return {
    isVerified: false,
    effectiveState: "seller-reported",
    label: "Seller-reported",
    detail: "Unverified metric",
    lastVerifiedLabel: null,
  };
}
