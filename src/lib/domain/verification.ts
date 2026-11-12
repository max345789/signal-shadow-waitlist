import type { RoleName } from "@/lib/auth/types";
import type { CurrencyCode } from "@/lib/format/currency";
import { formatRelativeVerifiedTime } from "@/lib/format/currency";

/**
 * Baton Light Verification Types (Change C3)
 * Light automatic badges, each naming exactly what it checks.
 */
export type VerificationTypeValue =
  | "EMAIL"
  | "PHONE"
  | "DOMAIN"
  | "REVENUE"
  | "TRAFFIC"
  // Legacy aliases for backward-compatibility with older tests
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

export interface VerificationBadgeSpec {
  type: VerificationTypeValue;
  title: string;
  checksDescription: string;
  defaultBadgeText: string;
  tooltipText: string;
}

export const BADGE_SPECIFICATIONS: Record<string, VerificationBadgeSpec> = {
  EMAIL: {
    type: "EMAIL",
    title: "Email verified",
    checksDescription: "Address confirmed by link",
    defaultBadgeText: "Email address confirmed",
    tooltipText:
      "This badge confirms only: address confirmed by link. It is not a guarantee of the business or its financials.",
  },
  PHONE: {
    type: "PHONE",
    title: "Phone verified",
    checksDescription: "Number confirmed by code",
    defaultBadgeText: "Phone number confirmed",
    tooltipText:
      "This badge confirms only: number confirmed by code. It is not a guarantee of the business or its financials.",
  },
  DOMAIN: {
    type: "DOMAIN",
    title: "Domain verified",
    checksDescription: "Seller controls the domain",
    defaultBadgeText: "Seller controls this domain",
    tooltipText:
      "This badge confirms only: seller controls this domain. It is not a guarantee of the business or its financials.",
  },
  REVENUE: {
    type: "REVENUE",
    title: "Revenue connected",
    checksDescription: "Read-only link to payment data",
    defaultBadgeText: "Revenue read directly from payment source",
    tooltipText:
      "This badge confirms only: read-only link to payment data. It is not a guarantee of the business or its financials.",
  },
  TRAFFIC: {
    type: "TRAFFIC",
    title: "Traffic connected",
    checksDescription: "Read-only link to analytics",
    defaultBadgeText: "Traffic read directly from analytics source",
    tooltipText:
      "This badge confirms only: read-only link to analytics. It is not a guarantee of the business or its financials.",
  },
};

export interface VerificationRecord {
  id: string;
  provider: string;
  type?: VerificationTypeValue;
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
  connectorKind?: "PAYMENT" | "ANALYTICS" | "DOMAIN";
  accountIdentifier?: string;
  accountHint?: string;
  domainName?: string;
  txtRecordExpected?: string;
  txtRecordFound?: string;
  phoneNumber?: string;
  emailAddress?: string;
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
  badgeText?: string;
  detail: string;
  tooltipText?: string;
  lastVerifiedLabel: string | null;
  isConnectionLost?: boolean;
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

/**
 * Change C3 rule: A buyer needs verified email and phone before sending a details request or a message.
 */
export function hasBuyerContactVerification(buyer: {
  emailVerified?: boolean | null;
  phoneVerified?: boolean | null;
}): { allowed: boolean; reason: string } {
  if (!buyer.emailVerified && !buyer.phoneVerified) {
    return {
      allowed: false,
      reason: "Both email and phone number must be verified before requesting full details or messaging.",
    };
  }
  if (!buyer.emailVerified) {
    return {
      allowed: false,
      reason: "Email verification is required before requesting full details or messaging.",
    };
  }
  if (!buyer.phoneVerified) {
    return {
      allowed: false,
      reason: "Phone number verification is required before requesting full details or messaging.",
    };
  }
  return {
    allowed: true,
    reason: "Email and phone verified.",
  };
}

export function hasActiveBuyerDataAccessVerification(params: {
  identity?: VerificationRecord | null;
  proofOfFunds?: VerificationRecord | null;
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
 * Baton Light Verification Evaluation (Change C3):
 * Tooltip on every badge: "This badge confirms only: [check]. It is not a guarantee of the business or its financials."
 * When a connection fails: show an amber chip "Connection lost. Figures are now seller-reported" and remove the green mark immediately.
 */
export function evaluateVerification(
  record: VerificationRecord | null | undefined,
  now: Date = new Date(),
  badgeTypeKey?: string
): EvaluatedVerification {
  const typeKey = (record?.type ?? badgeTypeKey ?? "REVENUE").toUpperCase();
  const spec = BADGE_SPECIFICATIONS[typeKey] ?? {
    type: "REVENUE",
    title: "Verification",
    checksDescription: "Automated check",
    defaultBadgeText: "Verified check",
    tooltipText:
      "This badge confirms only: automated check. It is not a guarantee of the business or its financials.",
  };

  const genericTooltip = `This badge confirms only: ${spec.checksDescription.toLowerCase()}. It is not a guarantee of the business or its financials.`;

  if (!record || !record.provider || record.provider.trim().length === 0) {
    return {
      isVerified: false,
      effectiveState: "seller-reported",
      label: "Seller-reported",
      badgeText: "Seller-reported",
      detail: "Not connected to a third-party data source",
      tooltipText: genericTooltip,
      lastVerifiedLabel: null,
      isConnectionLost: false,
    };
  }

  // When a connection fails or is revoked: show an amber chip "Connection lost. Figures are now seller-reported"
  if (record.status === "FAILED" || record.status === "REVOKED") {
    return {
      isVerified: false,
      effectiveState: "failed",
      label: record.status === "REVOKED" ? "Connection revoked" : "Connection failed",
      badgeText: "Connection lost. Figures are now seller-reported",
      detail: record.failureReason ?? `${record.provider} verification failed`,
      tooltipText: genericTooltip,
      lastVerifiedLabel: null,
      isConnectionLost: true,
    };
  }

  if (record.status === "PENDING") {
    return {
      isVerified: false,
      effectiveState: "pending",
      label: "Verification pending",
      badgeText: `Awaiting ${record.provider} confirmation`,
      detail: `Awaiting ${record.provider} confirmation`,
      tooltipText: genericTooltip,
      lastVerifiedLabel: null,
      isConnectionLost: false,
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
      badgeText: "Connection lost. Figures are now seller-reported",
      detail: `${record.provider} check expired — figures are now seller-reported`,
      tooltipText: genericTooltip,
      lastVerifiedLabel: verifiedAt ? formatRelativeVerifiedTime(verifiedAt, now) : null,
      isConnectionLost: true,
    };
  }

  if (record.status === "VERIFIED") {
    const timeLabel = formatRelativeVerifiedTime(verifiedAt, now);
    let badgeText = spec.defaultBadgeText;

    if (typeKey === "REVENUE") {
      badgeText = `Revenue read directly from ${record.provider}. Last verified ${timeLabel}`;
    } else if (typeKey === "TRAFFIC") {
      badgeText = `Traffic read directly from ${record.provider}. Last verified ${timeLabel}`;
    } else if (typeKey === "DOMAIN") {
      badgeText = "Seller controls this domain";
    } else if (typeKey === "EMAIL") {
      badgeText = "Email address confirmed";
    } else if (typeKey === "PHONE") {
      badgeText = "Phone number confirmed";
    }

    return {
      isVerified: true,
      effectiveState: "verified",
      label: "Verified",
      badgeText,
      detail: `${spec.checksDescription} via ${record.provider}`,
      tooltipText: genericTooltip,
      lastVerifiedLabel: timeLabel,
      isConnectionLost: false,
    };
  }

  return {
    isVerified: false,
    effectiveState: "seller-reported",
    label: "Seller-reported",
    badgeText: "Seller-reported",
    detail: "Unverified metric",
    tooltipText: genericTooltip,
    lastVerifiedLabel: null,
    isConnectionLost: false,
  };
}
