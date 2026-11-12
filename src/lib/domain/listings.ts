import type { RoleName } from "@/lib/auth/types";
import type { CurrencyCode } from "@/lib/format/currency";
import type { FinancialSeriesPoint } from "@/lib/domain/valuation";
import {
  evaluateVerification,
  type EvaluatedVerification,
  type VerificationRecord,
} from "@/lib/domain/verification";

export type ListingStatusValue =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "FLAGGED"
  | "REJECTED"
  | "ARCHIVED";

export type MetricKeyValue =
  | "REVENUE"
  | "PROFIT"
  | "GROWTH"
  | "CHURN"
  | "TRAFFIC"
  | "CUSTOMERS";

export type MetricUnitValue = "CURRENCY" | "PERCENT" | "COUNT";

export type MetricSourceValue =
  | "SELLER_REPORTED"
  | "STRIPE"
  | "RAZORPAY"
  | "GA4"
  | "PLAUSIBLE";

export interface RawBusinessMetricRecord {
  id: string;
  key: MetricKeyValue;
  label: string;
  value: number;
  unit: MetricUnitValue;
  currency: CurrencyCode | null;
  source: MetricSourceValue;
  verification: VerificationRecord | null;
  isSampleData: boolean;
}

export interface ListingQuestionRecord {
  id: string;
  businessId: string;
  askerId: string | null;
  askerLabel: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  isSampleData: boolean;
  createdAt: string;
}

export interface ListingAuditEntry {
  id: string;
  actorId: string | null;
  actorLabel: string;
  action: string;
  previousStatus: ListingStatusValue | null;
  newStatus: ListingStatusValue | null;
  note: string | null;
  createdAt: string;
}

export interface RawBusinessRecord {
  id: string;
  slug: string;
  sellerProfileId: string;
  sellerUserId: string;
  sellerDisplayLabel: string;
  teaserTitle: string;
  teaserSummary: string;
  redactedName: string;
  redactedDomain: string;
  redactedCustomers: string | null;
  sector: string;
  geography: string;
  askingPrice: number;
  currency: CurrencyCode;
  ownerHoursPerWeek: number;
  reasonForSelling: string;
  founderStory: string;
  founderMediaUrl: string | null;
  founderMediaType: "audio" | "video" | null;
  financialNarrative: string;
  financialSeries: FinancialSeriesPoint[];
  risksSummary: string;
  techStack: string[];
  assetsIncluded: string[];
  valuationLow: number | null;
  valuationHigh: number | null;
  valuationBasis: string | null;
  status: ListingStatusValue;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewerNote: string | null;
  isSampleData: boolean;
  metrics: RawBusinessMetricRecord[];
  questions: ListingQuestionRecord[];
  auditLogs: ListingAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface EvaluatedMetricView {
  id: string;
  key: MetricKeyValue;
  label: string;
  value: number;
  unit: MetricUnitValue;
  currency: CurrencyCode | null;
  source: MetricSourceValue;
  sourceLabel: string;
  verification: VerificationRecord | null;
  trust: EvaluatedVerification;
  isSampleData: boolean;
}

export interface MetricTrustSummary {
  verifiedCount: number;
  sellerReportedCount: number;
  expiredOrFailedCount: number;
  totalCount: number;
}

export interface SanitizedListingView {
  id: string;
  slug: string;
  teaserTitle: string;
  teaserSummary: string;
  sector: string;
  geography: string;
  askingPrice: number;
  currency: CurrencyCode;
  ownerHoursPerWeek: number;
  reasonForSelling: string;
  founderStory: string;
  founderMediaUrl: string | null;
  founderMediaType: "audio" | "video" | null;
  financialNarrative: string;
  financialSeries: FinancialSeriesPoint[];
  risksSummary: string;
  techStack: string[];
  assetsIncluded: string[];
  valuationLow: number | null;
  valuationHigh: number | null;
  valuationBasis: string | null;
  status: ListingStatusValue;
  submittedAt: string | null;
  reviewedAt: string | null;
  isSampleData: boolean;
  sellerDisplayLabel: string;
  /**
   * Sensitive identity fields are strictly null unless viewer is owning Seller,
   * Admin/Reviewer, or a Buyer with a signed NDA in a DealRoom.
   */
  sensitiveDetailsUnlocked: boolean;
  redactedPlaceholder: string;
  redactedName: string | null;
  redactedDomain: string | null;
  redactedCustomers: string | null;
  /** Internal reviewer note is visible ONLY to owning seller and admin/reviewer */
  reviewerNote: string | null;
  canEdit: boolean;
  canAnswerQuestions: boolean;
  canReview: boolean;
  metrics: EvaluatedMetricView[];
  trustSummary: MetricTrustSummary;
  questions: ListingQuestionRecord[];
  auditLogs: ListingAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ListingViewerContext {
  userId: string | null;
  roles: RoleName[];
  hasSignedNda?: boolean;
}

const SOURCE_LABELS: Record<MetricSourceValue, string> = {
  SELLER_REPORTED: "Seller-reported",
  STRIPE: "Stripe",
  RAZORPAY: "Razorpay",
  GA4: "GA4",
  PLAUSIBLE: "Plausible",
};

export function sanitizeFounderMediaUrl(
  input: string | null | undefined
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/api/media/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function createListingSlug(title: string, suffix?: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  const cleanBase = base.length > 0 ? base : "business-listing";
  const cleanSuffix =
    suffix ?? Math.random().toString(36).slice(2, 7);
  return `${cleanBase}-${cleanSuffix}`;
}

export const ALLOWED_LISTING_REVIEW_TRANSITIONS: Record<
  ListingStatusValue,
  readonly ListingStatusValue[]
> = {
  DRAFT: ["PENDING_REVIEW", "ARCHIVED"],
  PENDING_REVIEW: ["APPROVED", "FLAGGED", "REJECTED"],
  APPROVED: ["FLAGGED", "ARCHIVED"],
  FLAGGED: ["APPROVED", "REJECTED", "PENDING_REVIEW"],
  REJECTED: ["PENDING_REVIEW", "ARCHIVED"],
  ARCHIVED: [],
};

export type AdminReviewDecision = "APPROVE" | "FLAG" | "REJECT";

const DECISION_TO_STATUS: Record<AdminReviewDecision, ListingStatusValue> = {
  APPROVE: "APPROVED",
  FLAG: "FLAGGED",
  REJECT: "REJECTED",
};

const DECISION_TO_ACTION: Record<AdminReviewDecision, string> = {
  APPROVE: "LISTING_APPROVED",
  FLAG: "LISTING_FLAGGED",
  REJECT: "LISTING_REJECTED",
};

export function validateListingReviewTransition(params: {
  listingId: string;
  actorId: string;
  actorRoles: RoleName[];
  fromStatus: ListingStatusValue;
  decision: AdminReviewDecision;
  reviewerNote: string;
}):
  | {
      ok: true;
      nextStatus: ListingStatusValue;
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
      reason: "Admin or Reviewer role is required to review listings.",
    };
  }

  const trimmedNote = params.reviewerNote.trim();
  if (trimmedNote.length < 5) {
    return {
      ok: false,
      code: "NOTE_REQUIRED",
      reason:
        "Enter a reviewer note (at least 5 characters) explaining your decision.",
    };
  }

  const nextStatus = DECISION_TO_STATUS[params.decision];
  const allowed = ALLOWED_LISTING_REVIEW_TRANSITIONS[params.fromStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      reason: `Cannot transition listing from ${params.fromStatus} to ${nextStatus}.`,
    };
  }

  return {
    ok: true,
    nextStatus,
    auditAction: DECISION_TO_ACTION[params.decision],
    reviewerNote: trimmedNote,
  };
}

export function canViewerAccessListing(
  listing: Pick<RawBusinessRecord, "status" | "sellerUserId">,
  viewer: ListingViewerContext
): boolean {
  if (listing.status === "APPROVED") {
    return true;
  }
  if (!viewer.userId) {
    return false;
  }
  if (listing.sellerUserId === viewer.userId) {
    return true;
  }
  return viewer.roles.includes("ADMIN") || viewer.roles.includes("REVIEWER");
}

export function sanitizeListingForViewer(
  raw: RawBusinessRecord,
  viewer: ListingViewerContext,
  now: Date = new Date()
): SanitizedListingView {
  const isOwner = Boolean(viewer.userId && viewer.userId === raw.sellerUserId);
  const isStaff =
    viewer.roles.includes("ADMIN") || viewer.roles.includes("REVIEWER");
  const sensitiveDetailsUnlocked = Boolean(
    isOwner || isStaff || viewer.hasSignedNda
  );

  const metrics: EvaluatedMetricView[] = raw.metrics.map((m) => {
    const trust = evaluateVerification(m.verification, now);
    return {
      id: m.id,
      key: m.key,
      label: m.label,
      value: m.value,
      unit: m.unit,
      currency: m.currency,
      source: m.source,
      sourceLabel:
        trust.isVerified && m.verification
          ? m.verification.provider
          : SOURCE_LABELS[m.source] ?? "Seller-reported",
      verification: m.verification,
      trust,
      isSampleData: m.isSampleData,
    };
  });

  let verifiedCount = 0;
  let sellerReportedCount = 0;
  let expiredOrFailedCount = 0;

  for (const m of metrics) {
    if (m.trust.isVerified) {
      verifiedCount += 1;
    } else if (
      m.trust.effectiveState === "expired" ||
      m.trust.effectiveState === "failed"
    ) {
      expiredOrFailedCount += 1;
    } else {
      sellerReportedCount += 1;
    }
  }

  const canSeeInternalNotes = isOwner || isStaff;

  return {
    id: raw.id,
    slug: raw.slug,
    teaserTitle: raw.teaserTitle,
    teaserSummary: raw.teaserSummary,
    sector: raw.sector,
    geography: raw.geography,
    askingPrice: raw.askingPrice,
    currency: raw.currency,
    ownerHoursPerWeek: raw.ownerHoursPerWeek,
    reasonForSelling: raw.reasonForSelling,
    founderStory: raw.founderStory,
    founderMediaUrl: sanitizeFounderMediaUrl(raw.founderMediaUrl),
    founderMediaType: raw.founderMediaType,
    financialNarrative: raw.financialNarrative,
    financialSeries: raw.financialSeries,
    risksSummary: raw.risksSummary,
    techStack: raw.techStack,
    assetsIncluded: raw.assetsIncluded,
    valuationLow: raw.valuationLow,
    valuationHigh: raw.valuationHigh,
    valuationBasis: raw.valuationBasis,
    status: raw.status,
    submittedAt: raw.submittedAt,
    reviewedAt: raw.reviewedAt,
    isSampleData: raw.isSampleData,
    sellerDisplayLabel: raw.sellerDisplayLabel,
    sensitiveDetailsUnlocked,
    redactedPlaceholder: "Redacted until NDA is signed",
    redactedName: sensitiveDetailsUnlocked ? raw.redactedName : null,
    redactedDomain: sensitiveDetailsUnlocked ? raw.redactedDomain : null,
    redactedCustomers: sensitiveDetailsUnlocked ? raw.redactedCustomers : null,
    reviewerNote: canSeeInternalNotes ? raw.reviewerNote : null,
    canEdit: isOwner || viewer.roles.includes("ADMIN"),
    canAnswerQuestions: isOwner || viewer.roles.includes("ADMIN"),
    canReview: isStaff,
    metrics,
    trustSummary: {
      verifiedCount,
      sellerReportedCount,
      expiredOrFailedCount,
      totalCount: metrics.length,
    },
    questions: raw.questions,
    auditLogs: canSeeInternalNotes ? raw.auditLogs : [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
