import { formatRelativeVerifiedTime } from "@/lib/format/currency";

export type VerificationStatusValue =
  | "PENDING"
  | "VERIFIED"
  | "EXPIRED"
  | "FAILED"
  | "REVOKED";

export interface VerificationRecord {
  id: string;
  provider: string;
  status: VerificationStatusValue;
  verifiedAt: Date | string | null;
  expiresAt: Date | string | null;
  failureReason?: string | null;
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
  if (!record) {
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
      label: "Connection failed",
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
