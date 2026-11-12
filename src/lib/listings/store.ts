import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import type { AuthSession } from "@/lib/auth/types";
import type { CurrencyCode } from "@/lib/format/currency";
import {
  canViewerAccessListing,
  createListingSlug,
  sanitizeFounderMediaUrl,
  sanitizeListingForViewer,
  validateListingReviewTransition,
  type AdminReviewDecision,
  type ListingAuditEntry,
  type ListingQuestionRecord,
  type ListingStatusValue,
  type ListingViewerContext,
  type MetricKeyValue,
  type MetricUnitValue,
  type RawBusinessMetricRecord,
  type RawBusinessRecord,
  type SanitizedListingView,
} from "@/lib/domain/listings";
import {
  buildDefaultFinancialSeries,
  calculateGuidedValuation,
  detectConfidentialLeak,
  type FinancialSeriesPoint,
} from "@/lib/domain/valuation";
import { createSampleSeedListings } from "@/lib/listings/sample-data";
import { evaluateAndSendThesisAlertsForListing } from "@/lib/matching/alerts";
import { evaluateVerification } from "@/lib/domain/verification";
import {
  hasActiveLocalUserVerification,
  resetLocalVerificationsStoreForTest,
} from "@/lib/verification/local-store";
import {
  hasLocalBuyerSignedNdaForBusiness,
  resetLocalDealRoomsStoreForTest,
} from "@/lib/deal-rooms/local-store";
import {
  CurrencyCode as PrismaCurrencyCode,
  ListingStatus as PrismaListingStatus,
  MetricKey as PrismaMetricKey,
  MetricSource as PrismaMetricSource,
  MetricUnit as PrismaMetricUnit,
  Prisma,
} from "@prisma/client";

export interface UpsertSellerListingInput {
  teaserTitle: string;
  teaserSummary: string;
  redactedName: string;
  redactedDomain: string;
  redactedCustomers?: string | null;
  sector: string;
  geography: string;
  askingPrice: number;
  currency: CurrencyCode;
  ownerHoursPerWeek: number;
  reasonForSelling: string;
  founderStory: string;
  founderMediaUrl?: string | null;
  founderMediaType?: "audio" | "video" | null;
  financialNarrative: string;
  financialSeries?: FinancialSeriesPoint[];
  risksSummary: string;
  techStack: string[];
  assetsIncluded: string[];
  annualRevenue: number;
  annualProfit: number;
  growthPercent: number;
  churnPercent: number;
  monthlyTraffic: number;
  customerCount: number;
  submitForReview: boolean;
}

const globalForListingsStore = globalThis as unknown as {
  __trustMarketplaceLocalListings?: RawBusinessRecord[];
};

function isLocalDevModeAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.AUTH_PROVIDER === "local-dev"
  );
}

function getLocalListingsStore(): RawBusinessRecord[] {
  if (!isLocalDevModeAllowed()) {
    throw new Error("DATABASE_URL is required in production.");
  }
  if (!globalForListingsStore.__trustMarketplaceLocalListings) {
    globalForListingsStore.__trustMarketplaceLocalListings =
      createSampleSeedListings();
  }
  return globalForListingsStore.__trustMarketplaceLocalListings;
}

export function getLocalListingsStoreForVerification(): RawBusinessRecord[] {
  return getLocalListingsStore();
}

export function resetLocalListingsStoreForTest(): void {
  globalForListingsStore.__trustMarketplaceLocalListings =
    createSampleSeedListings();
  resetLocalVerificationsStoreForTest();
  resetLocalDealRoomsStoreForTest();
}

function buildSellerReportedMetrics(
  input: UpsertSellerListingInput,
  idPrefix: string
): RawBusinessMetricRecord[] {
  const defs: Array<{
    key: MetricKeyValue;
    label: string;
    value: number;
    unit: MetricUnitValue;
    currency: CurrencyCode | null;
  }> = [
    {
      key: "REVENUE",
      label: "Trailing 12m Revenue",
      value: input.annualRevenue,
      unit: "CURRENCY",
      currency: input.currency,
    },
    {
      key: "PROFIT",
      label: "Trailing 12m Net Profit",
      value: input.annualProfit,
      unit: "CURRENCY",
      currency: input.currency,
    },
    {
      key: "GROWTH",
      label: "Annual Growth Rate",
      value: input.growthPercent,
      unit: "PERCENT",
      currency: null,
    },
    {
      key: "CHURN",
      label: "Monthly Churn",
      value: input.churnPercent,
      unit: "PERCENT",
      currency: null,
    },
    {
      key: "TRAFFIC",
      label: "Monthly Visitors",
      value: input.monthlyTraffic,
      unit: "COUNT",
      currency: null,
    },
    {
      key: "CUSTOMERS",
      label: "Active Customers",
      value: input.customerCount,
      unit: "COUNT",
      currency: null,
    },
  ];

  return defs.map((d) => ({
    id: `${idPrefix}-${d.key.toLowerCase()}`,
    key: d.key,
    label: d.label,
    value: d.value,
    unit: d.unit,
    currency: d.currency,
    source: "SELLER_REPORTED",
    verification: null,
    isSampleData: false,
  }));
}

function parseFinancialSeries(rawJson: unknown): FinancialSeriesPoint[] {
  if (!Array.isArray(rawJson)) return [];
  const points: FinancialSeriesPoint[] = [];
  for (const item of rawJson) {
    if (
      item &&
      typeof item === "object" &&
      "period" in item &&
      "revenue" in item &&
      "profit" in item
    ) {
      const obj = item as Record<string, unknown>;
      points.push({
        period: String(obj.period ?? ""),
        revenue: Number(obj.revenue ?? 0),
        profit: Number(obj.profit ?? 0),
        source: obj.source === "VERIFIED" ? "VERIFIED" : "SELLER_REPORTED",
      });
    }
  }
  return points;
}

const PRISMA_BUSINESS_INCLUDE = {
  sellerProfile: {
    include: {
      user: { select: { id: true, name: true } },
    },
  },
  metrics: {
    include: {
      verification: true,
    },
    orderBy: { key: "asc" as const },
  },
  questions: {
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.BusinessInclude;

type PrismaBusinessWithRelations = Prisma.BusinessGetPayload<{
  include: typeof PRISMA_BUSINESS_INCLUDE;
}>;

function mapPrismaBusinessToRaw(
  biz: PrismaBusinessWithRelations,
  auditLogs: ListingAuditEntry[]
): RawBusinessRecord {
  return {
    id: biz.id,
    slug: biz.slug,
    sellerProfileId: biz.sellerProfileId,
    sellerUserId: biz.sellerProfile.userId,
    sellerDisplayLabel: biz.sellerProfile.user.name,
    teaserTitle: biz.teaserTitle,
    teaserSummary: biz.teaserSummary,
    redactedName: biz.redactedName,
    redactedDomain: biz.redactedDomain,
    redactedCustomers: biz.redactedCustomers,
    sector: biz.sector,
    geography: biz.geography,
    askingPrice: Number(biz.askingPrice),
    currency: biz.currency as CurrencyCode,
    ownerHoursPerWeek: biz.ownerHoursPerWeek,
    reasonForSelling: biz.reasonForSelling,
    founderStory: biz.founderStory,
    founderMediaUrl: biz.founderMediaUrl,
    founderMediaType:
      biz.founderMediaType === "audio" || biz.founderMediaType === "video"
        ? biz.founderMediaType
        : null,
    financialNarrative: biz.financialNarrative,
    financialSeries: parseFinancialSeries(biz.financialSeriesJson),
    risksSummary: biz.risksSummary,
    techStack: biz.techStack,
    assetsIncluded: biz.assetsIncluded,
    valuationLow: biz.valuationLow !== null ? Number(biz.valuationLow) : null,
    valuationHigh: biz.valuationHigh !== null ? Number(biz.valuationHigh) : null,
    valuationBasis: biz.valuationBasis,
    status: biz.status as ListingStatusValue,
    submittedAt: biz.submittedAt ? biz.submittedAt.toISOString() : null,
    reviewedAt: biz.reviewedAt ? biz.reviewedAt.toISOString() : null,
    reviewedById: biz.reviewedById,
    reviewerNote: biz.reviewerNote,
    isSampleData: biz.isSampleData,
    metrics: biz.metrics.map((m) => ({
      id: m.id,
      key: m.key as MetricKeyValue,
      label: m.label,
      value: Number(m.value),
      unit: m.unit as MetricUnitValue,
      currency: (m.currency as CurrencyCode | null) ?? null,
      source: m.source,
      isSampleData: m.isSampleData,
      verification: m.verification
        ? {
            id: m.verification.id,
            provider: m.verification.provider,
            status: m.verification.status,
            verifiedAt: m.verification.verifiedAt,
            expiresAt: m.verification.expiresAt,
            failureReason: m.verification.failureReason,
          }
        : null,
    })),
    questions: biz.questions.map((q) => ({
      id: q.id,
      businessId: q.businessId,
      askerId: q.askerId,
      askerLabel: q.askerLabel,
      question: q.question,
      answer: q.answer,
      answeredAt: q.answeredAt ? q.answeredAt.toISOString() : null,
      isSampleData: q.isSampleData,
      createdAt: q.createdAt.toISOString(),
    })),
    auditLogs,
    createdAt: biz.createdAt.toISOString(),
    updatedAt: biz.updatedAt.toISOString(),
  };
}

async function fetchAuditLogsForBusinesses(
  businessIds: string[]
): Promise<Map<string, ListingAuditEntry[]>> {
  const map = new Map<string, ListingAuditEntry[]>();
  if (businessIds.length === 0 || !isDatabaseConfigured()) {
    return map;
  }

  const prisma = getPrismaClient();
  const rows = await prisma.auditLog.findMany({
    where: {
      entityType: "Business",
      entityId: { in: businessIds },
    },
    include: {
      actor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  for (const row of rows) {
    const prev =
      row.previousState && typeof row.previousState === "object"
        ? ((row.previousState as Record<string, unknown>).status as ListingStatusValue | undefined) ?? null
        : null;
    const next =
      row.newState && typeof row.newState === "object"
        ? ((row.newState as Record<string, unknown>).status as ListingStatusValue | undefined) ?? null
        : null;
    const note =
      row.metadataJson && typeof row.metadataJson === "object"
        ? ((row.metadataJson as Record<string, unknown>).reviewerNote as string | undefined) ??
          ((row.metadataJson as Record<string, unknown>).note as string | undefined) ??
          null
        : null;

    const entry: ListingAuditEntry = {
      id: row.id,
      actorId: row.actorId,
      actorLabel: row.actor?.name ?? "Platform User",
      action: row.action,
      previousStatus: prev,
      newStatus: next,
      note,
      createdAt: row.createdAt.toISOString(),
    };
    const existing = map.get(row.entityId) ?? [];
    existing.push(entry);
    map.set(row.entityId, existing);
  }

  return map;
}

function viewerFromSession(session: AuthSession | null): ListingViewerContext {
  return {
    userId: session?.userId ?? null,
    roles: session?.roles ?? [],
    hasSignedNda: false,
  };
}

export async function listApprovedListings(filters?: {
  sector?: string;
  query?: string;
  verifiedOnly?: boolean;
}): Promise<SanitizedListingView[]> {
  const now = new Date();
  const publicViewer: ListingViewerContext = {
    userId: null,
    roles: [],
    hasSignedNda: false,
  };

  let rawList: RawBusinessRecord[];
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.business.findMany({
      where: { status: PrismaListingStatus.APPROVED },
      include: PRISMA_BUSINESS_INCLUDE,
      orderBy: [{ isSampleData: "asc" }, { createdAt: "desc" }],
    });
    rawList = rows.map((r) => mapPrismaBusinessToRaw(r, []));
  } else {
    rawList = getLocalListingsStore()
      .filter((b) => b.status === "APPROVED")
      .sort((a, b) => Number(a.isSampleData) - Number(b.isSampleData) || b.createdAt.localeCompare(a.createdAt));
  }

  let sanitized = rawList.map((r) => sanitizeListingForViewer(r, publicViewer, now));

  if (filters?.sector && filters.sector !== "ALL") {
    sanitized = sanitized.filter((item) => item.sector === filters.sector);
  }
  if (filters?.verifiedOnly) {
    sanitized = sanitized.filter((item) => item.trustSummary.verifiedCount > 0);
  }
  if (filters?.query && filters.query.trim().length > 0) {
    const q = filters.query.trim().toLowerCase();
    sanitized = sanitized.filter(
      (item) =>
        item.teaserTitle.toLowerCase().includes(q) ||
        item.teaserSummary.toLowerCase().includes(q) ||
        item.sector.toLowerCase().includes(q) ||
        item.geography.toLowerCase().includes(q)
    );
  }

  return sanitized;
}

export async function listListingsForSeller(
  session: AuthSession
): Promise<SanitizedListingView[]> {
  const now = new Date();
  const viewer = viewerFromSession(session);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.business.findMany({
      where: { sellerProfile: { userId: session.userId } },
      include: PRISMA_BUSINESS_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    const auditMap = await fetchAuditLogsForBusinesses(rows.map((r) => r.id));
    return rows.map((r) =>
      sanitizeListingForViewer(mapPrismaBusinessToRaw(r, auditMap.get(r.id) ?? []), viewer, now)
    );
  }

  return getLocalListingsStore()
    .filter((b) => b.sellerUserId === session.userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((r) => sanitizeListingForViewer(r, viewer, now));
}

export async function listListingsForAdminReview(
  session: AuthSession,
  statuses?: ListingStatusValue[]
): Promise<SanitizedListingView[]> {
  const now = new Date();
  const viewer = viewerFromSession(session);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.business.findMany({
      where: statuses && statuses.length > 0
        ? { status: { in: statuses as PrismaListingStatus[] } }
        : undefined,
      include: PRISMA_BUSINESS_INCLUDE,
      orderBy: [
        { submittedAt: { sort: "desc", nulls: "last" } },
        { updatedAt: "desc" },
      ],
    });
    const auditMap = await fetchAuditLogsForBusinesses(rows.map((r) => r.id));
    return rows.map((r) =>
      sanitizeListingForViewer(mapPrismaBusinessToRaw(r, auditMap.get(r.id) ?? []), viewer, now)
    );
  }

  return getLocalListingsStore()
    .filter((b) => (!statuses || statuses.length === 0 ? true : statuses.includes(b.status)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((r) => sanitizeListingForViewer(r, viewer, now));
}

export async function getListingBySlugForViewer(
  slug: string,
  session: AuthSession | null
): Promise<SanitizedListingView | null> {
  const now = new Date();
  const viewer = viewerFromSession(session);

  let raw: RawBusinessRecord | null = null;
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.business.findUnique({
      where: { slug },
      include: PRISMA_BUSINESS_INCLUDE,
    });
    if (row) {
      const auditMap = await fetchAuditLogsForBusinesses([row.id]);
      raw = mapPrismaBusinessToRaw(row, auditMap.get(row.id) ?? []);
    }
  } else {
    raw = getLocalListingsStore().find((b) => b.slug === slug) ?? null;
  }

  if (!raw || !canViewerAccessListing(raw, viewer)) {
    return null;
  }

  if (session?.userId) {
    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      const signed = await prisma.dealRoom.findFirst({
        where: {
          businessId: raw.id,
          buyerProfile: { userId: session.userId },
          ndaSignedAt: { not: null },
        },
        select: { id: true },
      });
      viewer.hasSignedNda = Boolean(signed);
    } else {
      viewer.hasSignedNda = hasLocalBuyerSignedNdaForBusiness(
        raw.id,
        session.userId
      );
    }
  }

  return sanitizeListingForViewer(raw, viewer, now);
}

export async function getListingByIdForViewer(
  id: string,
  session: AuthSession | null
): Promise<SanitizedListingView | null> {
  const now = new Date();
  const viewer = viewerFromSession(session);

  let raw: RawBusinessRecord | null = null;
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.business.findUnique({
      where: { id },
      include: PRISMA_BUSINESS_INCLUDE,
    });
    if (row) {
      const auditMap = await fetchAuditLogsForBusinesses([row.id]);
      raw = mapPrismaBusinessToRaw(row, auditMap.get(row.id) ?? []);
    }
  } else {
    raw = getLocalListingsStore().find((b) => b.id === id) ?? null;
  }

  if (!raw || !canViewerAccessListing(raw, viewer)) {
    return null;
  }

  if (session?.userId) {
    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      const signed = await prisma.dealRoom.findFirst({
        where: {
          businessId: raw.id,
          buyerProfile: { userId: session.userId },
          ndaSignedAt: { not: null },
        },
        select: { id: true },
      });
      viewer.hasSignedNda = Boolean(signed);
    } else {
      viewer.hasSignedNda = hasLocalBuyerSignedNdaForBusiness(
        raw.id,
        session.userId
      );
    }
  }

  return sanitizeListingForViewer(raw, viewer, now);
}

export async function createSellerListing(
  input: UpsertSellerListingInput,
  actor: AuthSession
): Promise<SanitizedListingView> {
  const now = new Date();
  const nowIso = now.toISOString();
  const valuation = calculateGuidedValuation({
    sector: input.sector,
    annualRevenue: input.annualRevenue,
    annualProfit: input.annualProfit,
    ownerHoursPerWeek: input.ownerHoursPerWeek,
    growthPercent: input.growthPercent,
    currency: input.currency,
  });

  const series =
    input.financialSeries && input.financialSeries.length > 0
      ? input.financialSeries.map((pt) => ({
          ...pt,
          source: "SELLER_REPORTED" as const,
        }))
      : buildDefaultFinancialSeries(
          input.annualRevenue,
          input.annualProfit,
          input.growthPercent
        );

  const initialStatus: ListingStatusValue = input.submitForReview
    ? "PENDING_REVIEW"
    : "DRAFT";
  const slug = createListingSlug(input.teaserTitle);
  const safeMediaUrl = sanitizeFounderMediaUrl(input.founderMediaUrl);
  const viewer = viewerFromSession(actor);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const created = await prisma.$transaction(async (tx) => {
      const sellerProfile = await tx.sellerProfile.upsert({
        where: { userId: actor.userId },
        update: {},
        create: {
          userId: actor.userId,
          payoutCountry: "IN",
        },
      });

      const biz = await tx.business.create({
        data: {
          sellerProfileId: sellerProfile.id,
          slug,
          teaserTitle: input.teaserTitle.trim(),
          teaserSummary: input.teaserSummary.trim(),
          redactedName: input.redactedName.trim(),
          redactedDomain: input.redactedDomain.trim(),
          redactedCustomers: input.redactedCustomers?.trim() || null,
          sector: input.sector.trim(),
          geography: input.geography.trim(),
          askingPrice: input.askingPrice,
          currency: input.currency as PrismaCurrencyCode,
          ownerHoursPerWeek: input.ownerHoursPerWeek,
          reasonForSelling: input.reasonForSelling.trim(),
          founderStory: input.founderStory.trim(),
          founderMediaUrl: safeMediaUrl,
          founderMediaType: safeMediaUrl ? (input.founderMediaType ?? "audio") : null,
          financialNarrative: input.financialNarrative.trim(),
          financialSeriesJson: series as unknown as Prisma.InputJsonValue,
          risksSummary: input.risksSummary.trim(),
          techStack: input.techStack,
          assetsIncluded: input.assetsIncluded,
          valuationLow: valuation.low > 0 ? valuation.low : null,
          valuationHigh: valuation.high > 0 ? valuation.high : null,
          valuationBasis: valuation.basis,
          status: initialStatus as PrismaListingStatus,
          submittedAt: input.submitForReview ? now : null,
          isSampleData: false,
          metrics: {
            create: buildSellerReportedMetrics(input, "m").map((m) => ({
              key: m.key as PrismaMetricKey,
              label: m.label,
              value: m.value,
              unit: m.unit as PrismaMetricUnit,
              currency: m.currency ? (m.currency as PrismaCurrencyCode) : null,
              source: PrismaMetricSource.SELLER_REPORTED,
              verificationId: null,
              verifiedAt: null,
              isSampleData: false,
            })),
          },
        },
        include: PRISMA_BUSINESS_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Business",
          entityId: biz.id,
          action: input.submitForReview ? "LISTING_SUBMITTED" : "LISTING_CREATED",
          previousState: Prisma.JsonNull,
          newState: { status: initialStatus },
          metadataJson: {
            note: input.submitForReview
              ? "Seller created listing and submitted for Admin review."
              : "Seller saved listing draft.",
          },
        },
      });

      return biz;
    });

    const auditMap = await fetchAuditLogsForBusinesses([created.id]);
    return sanitizeListingForViewer(
      mapPrismaBusinessToRaw(created, auditMap.get(created.id) ?? []),
      viewer,
      now
    );
  }

  const store = getLocalListingsStore();
  const id = `biz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const auditEntry: ListingAuditEntry = {
    id: `audit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    actorLabel: actor.name,
    action: input.submitForReview ? "LISTING_SUBMITTED" : "LISTING_CREATED",
    previousStatus: null,
    newStatus: initialStatus,
    note: input.submitForReview
      ? "Seller created listing and submitted for Admin review."
      : "Seller saved listing draft.",
    createdAt: nowIso,
  };

  const raw: RawBusinessRecord = {
    id,
    slug,
    sellerProfileId: `seller-profile-${actor.userId}`,
    sellerUserId: actor.userId,
    sellerDisplayLabel: actor.name,
    teaserTitle: input.teaserTitle.trim(),
    teaserSummary: input.teaserSummary.trim(),
    redactedName: input.redactedName.trim(),
    redactedDomain: input.redactedDomain.trim(),
    redactedCustomers: input.redactedCustomers?.trim() || null,
    sector: input.sector.trim(),
    geography: input.geography.trim(),
    askingPrice: input.askingPrice,
    currency: input.currency,
    ownerHoursPerWeek: input.ownerHoursPerWeek,
    reasonForSelling: input.reasonForSelling.trim(),
    founderStory: input.founderStory.trim(),
    founderMediaUrl: safeMediaUrl,
    founderMediaType: safeMediaUrl ? (input.founderMediaType ?? "audio") : null,
    financialNarrative: input.financialNarrative.trim(),
    financialSeries: series,
    risksSummary: input.risksSummary.trim(),
    techStack: input.techStack,
    assetsIncluded: input.assetsIncluded,
    valuationLow: valuation.low > 0 ? valuation.low : null,
    valuationHigh: valuation.high > 0 ? valuation.high : null,
    valuationBasis: valuation.basis,
    status: initialStatus,
    submittedAt: input.submitForReview ? nowIso : null,
    reviewedAt: null,
    reviewedById: null,
    reviewerNote: null,
    isSampleData: false,
    metrics: buildSellerReportedMetrics(input, `${id}-m`),
    questions: [],
    auditLogs: [auditEntry],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.unshift(raw);
  return sanitizeListingForViewer(raw, viewer, now);
}

export async function updateSellerListing(
  id: string,
  input: UpsertSellerListingInput,
  actor: AuthSession
): Promise<
  | { ok: true; listing: SanitizedListingView }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE"; reason: string }
> {
  const now = new Date();
  const nowIso = now.toISOString();
  const viewer = viewerFromSession(actor);
  const safeMediaUrl = sanitizeFounderMediaUrl(input.founderMediaUrl);
  const valuation = calculateGuidedValuation({
    sector: input.sector,
    annualRevenue: input.annualRevenue,
    annualProfit: input.annualProfit,
    ownerHoursPerWeek: input.ownerHoursPerWeek,
    growthPercent: input.growthPercent,
    currency: input.currency,
  });

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const existing = await prisma.business.findUnique({
      where: { id },
      include: PRISMA_BUSINESS_INCLUDE,
    });
    if (!existing) {
      return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
    }
    if (
      existing.sellerProfile.userId !== actor.userId &&
      !actor.roles.includes("ADMIN")
    ) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the owning seller can edit this listing.",
      };
    }
    if (existing.status === "ARCHIVED") {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Archived listings cannot be edited.",
      };
    }

    const existingSeries = parseFinancialSeries(existing.financialSeriesJson);
    const hasVerifiedSeries = existingSeries.some((pt) => pt.source === "VERIFIED");
    const series =
      input.financialSeries && input.financialSeries.length > 0
        ? input.financialSeries.map((pt) => ({
            ...pt,
            source: "SELLER_REPORTED" as const,
          }))
        : hasVerifiedSeries
          ? existingSeries
          : buildDefaultFinancialSeries(
              input.annualRevenue,
              input.annualProfit,
              input.growthPercent
            );

    const nextStatus: ListingStatusValue = input.submitForReview
      ? "PENDING_REVIEW"
      : existing.status === "APPROVED" || existing.status === "PENDING_REVIEW"
        ? "DRAFT"
        : (existing.status as ListingStatusValue);

    const activeVerifiedKeys = new Set(
      existing.metrics
        .filter(
          (m) =>
            m.source !== PrismaMetricSource.SELLER_REPORTED &&
            m.verification !== null &&
            evaluateVerification(m.verification, now).isVerified
        )
        .map((m) => m.key)
    );

    const updated = await prisma.$transaction(async (tx) => {
      await tx.businessMetric.deleteMany({
        where: {
          businessId: existing.id,
          key: { notIn: Array.from(activeVerifiedKeys) },
        },
      });

      const newMetrics = buildSellerReportedMetrics(input, "m").filter(
        (m) => !activeVerifiedKeys.has(m.key as PrismaMetricKey)
      );

      const biz = await tx.business.update({
        where: { id: existing.id },
        data: {
          teaserTitle: input.teaserTitle.trim(),
          teaserSummary: input.teaserSummary.trim(),
          redactedName: input.redactedName.trim(),
          redactedDomain: input.redactedDomain.trim(),
          redactedCustomers: input.redactedCustomers?.trim() || null,
          sector: input.sector.trim(),
          geography: input.geography.trim(),
          askingPrice: input.askingPrice,
          currency: input.currency as PrismaCurrencyCode,
          ownerHoursPerWeek: input.ownerHoursPerWeek,
          reasonForSelling: input.reasonForSelling.trim(),
          founderStory: input.founderStory.trim(),
          founderMediaUrl: safeMediaUrl,
          founderMediaType: safeMediaUrl ? (input.founderMediaType ?? "audio") : null,
          financialNarrative: input.financialNarrative.trim(),
          financialSeriesJson: series as unknown as Prisma.InputJsonValue,
          risksSummary: input.risksSummary.trim(),
          techStack: input.techStack,
          assetsIncluded: input.assetsIncluded,
          valuationLow: valuation.low > 0 ? valuation.low : null,
          valuationHigh: valuation.high > 0 ? valuation.high : null,
          valuationBasis: valuation.basis,
          status: nextStatus as PrismaListingStatus,
          submittedAt: input.submitForReview ? now : existing.submittedAt,
          metrics: {
            create: newMetrics.map((m) => ({
              key: m.key as PrismaMetricKey,
              label: m.label,
              value: m.value,
              unit: m.unit as PrismaMetricUnit,
              currency: m.currency ? (m.currency as PrismaCurrencyCode) : null,
              source: PrismaMetricSource.SELLER_REPORTED,
              verificationId: null,
              verifiedAt: null,
              isSampleData: false,
            })),
          },
        },
        include: PRISMA_BUSINESS_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Business",
          entityId: biz.id,
          action: input.submitForReview ? "LISTING_SUBMITTED" : "LISTING_UPDATED",
          previousState: { status: existing.status },
          newState: { status: nextStatus },
          metadataJson: {
            note: input.submitForReview
              ? "Seller updated and submitted listing for Admin review."
              : "Seller updated listing details.",
          },
        },
      });

      return biz;
    });

    const auditMap = await fetchAuditLogsForBusinesses([updated.id]);
    return {
      ok: true,
      listing: sanitizeListingForViewer(
        mapPrismaBusinessToRaw(updated, auditMap.get(updated.id) ?? []),
        viewer,
        now
      ),
    };
  }

  const store = getLocalListingsStore();
  const idx = store.findIndex((b) => b.id === id);
  if (idx === -1) {
    return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
  }
  const existing = store[idx]!;
  if (existing.sellerUserId !== actor.userId && !actor.roles.includes("ADMIN")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the owning seller can edit this listing.",
    };
  }
  if (existing.status === "ARCHIVED") {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Archived listings cannot be edited.",
    };
  }

  const prevStatus = existing.status;
  const hasVerifiedSeries = existing.financialSeries.some(
    (pt) => pt.source === "VERIFIED"
  );
  const series =
    input.financialSeries && input.financialSeries.length > 0
      ? input.financialSeries.map((pt) => ({
          ...pt,
          source: "SELLER_REPORTED" as const,
        }))
      : hasVerifiedSeries
        ? existing.financialSeries
        : buildDefaultFinancialSeries(
            input.annualRevenue,
            input.annualProfit,
            input.growthPercent
          );

  const nextStatus: ListingStatusValue = input.submitForReview
    ? "PENDING_REVIEW"
    : existing.status === "APPROVED" || existing.status === "PENDING_REVIEW"
      ? "DRAFT"
      : existing.status;

  const preservedVerified = existing.metrics.filter(
    (m) =>
      m.source !== "SELLER_REPORTED" &&
      m.verification !== null &&
      evaluateVerification(m.verification, now).isVerified
  );
  const verifiedKeys = new Set(preservedVerified.map((m) => m.key));
  const freshSellerMetrics = buildSellerReportedMetrics(
    input,
    `${existing.id}-m-${Date.now().toString(36)}`
  ).filter((m) => !verifiedKeys.has(m.key));

  const updatedRaw: RawBusinessRecord = {
    ...existing,
    teaserTitle: input.teaserTitle.trim(),
    teaserSummary: input.teaserSummary.trim(),
    redactedName: input.redactedName.trim(),
    redactedDomain: input.redactedDomain.trim(),
    redactedCustomers: input.redactedCustomers?.trim() || null,
    sector: input.sector.trim(),
    geography: input.geography.trim(),
    askingPrice: input.askingPrice,
    currency: input.currency,
    ownerHoursPerWeek: input.ownerHoursPerWeek,
    reasonForSelling: input.reasonForSelling.trim(),
    founderStory: input.founderStory.trim(),
    founderMediaUrl: safeMediaUrl,
    founderMediaType: safeMediaUrl ? (input.founderMediaType ?? "audio") : null,
    financialNarrative: input.financialNarrative.trim(),
    financialSeries: series,
    risksSummary: input.risksSummary.trim(),
    techStack: input.techStack,
    assetsIncluded: input.assetsIncluded,
    valuationLow: valuation.low > 0 ? valuation.low : null,
    valuationHigh: valuation.high > 0 ? valuation.high : null,
    valuationBasis: valuation.basis,
    status: nextStatus,
    submittedAt: input.submitForReview ? nowIso : existing.submittedAt,
    metrics: [...preservedVerified, ...freshSellerMetrics],
    auditLogs: [
      {
        id: `audit-${Date.now().toString(36)}`,
        actorId: actor.userId,
        actorLabel: actor.name,
        action: input.submitForReview ? "LISTING_SUBMITTED" : "LISTING_UPDATED",
        previousStatus: prevStatus,
        newStatus: nextStatus,
        note: input.submitForReview
          ? "Seller updated and submitted listing for Admin review."
          : "Seller updated listing details.",
        createdAt: nowIso,
      },
      ...existing.auditLogs,
    ],
    updatedAt: nowIso,
  };

  store[idx] = updatedRaw;
  return {
    ok: true,
    listing: sanitizeListingForViewer(updatedRaw, viewer, now),
  };
}

export async function reviewListingAsAdmin(
  id: string,
  decision: AdminReviewDecision,
  reviewerNote: string,
  actor: AuthSession
): Promise<
  | { ok: true; listing: SanitizedListingView }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_TRANSITION" | "NOTE_REQUIRED";
      reason: string;
    }
> {
  const now = new Date();
  const nowIso = now.toISOString();
  const viewer = viewerFromSession(actor);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const existing = await prisma.business.findUnique({
      where: { id },
      include: PRISMA_BUSINESS_INCLUDE,
    });
    if (!existing) {
      return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
    }

    const validation = validateListingReviewTransition({
      listingId: existing.id,
      actorId: actor.userId,
      actorRoles: actor.roles,
      fromStatus: existing.status as ListingStatusValue,
      decision,
      reviewerNote,
    });
    if (!validation.ok) {
      return validation;
    }

    if (decision === "APPROVE") {
      const leaks = detectConfidentialLeak(
        {
          teaserTitle: existing.teaserTitle,
          teaserSummary: existing.teaserSummary,
          reasonForSelling: existing.reasonForSelling,
          financialNarrative: existing.financialNarrative,
          risksSummary: existing.risksSummary,
          founderStory: existing.founderStory,
        },
        {
          redactedName: existing.redactedName,
          redactedDomain: existing.redactedDomain,
        }
      );
      if (leaks.length > 0) {
        const first = leaks[0]!;
        return {
          ok: false,
          code: "INVALID_TRANSITION",
          reason: `Cannot approve listing while confidential term ("${first.matchedTerm}") appears in "${first.field}". Flag for edits instead.`,
        };
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const biz = await tx.business.update({
        where: { id: existing.id },
        data: {
          status: validation.nextStatus as PrismaListingStatus,
          reviewedAt: now,
          reviewedById: actor.userId,
          reviewerNote: validation.reviewerNote,
        },
        include: PRISMA_BUSINESS_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Business",
          entityId: biz.id,
          action: validation.auditAction,
          previousState: { status: existing.status },
          newState: { status: validation.nextStatus },
          metadataJson: {
            reviewerNote: validation.reviewerNote,
            actorRoles: actor.roles,
          },
        },
      });

      return biz;
    });

    const auditMap = await fetchAuditLogsForBusinesses([updated.id]);
    const rawUpdated = mapPrismaBusinessToRaw(updated, auditMap.get(updated.id) ?? []);
    if (validation.nextStatus === "APPROVED") {
      await evaluateAndSendThesisAlertsForListing(rawUpdated, actor.userId);
    }
    return {
      ok: true,
      listing: sanitizeListingForViewer(rawUpdated, viewer, now),
    };
  }

  const store = getLocalListingsStore();
  const idx = store.findIndex((b) => b.id === id);
  if (idx === -1) {
    return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
  }
  const existing = store[idx]!;

  const validation = validateListingReviewTransition({
    listingId: existing.id,
    actorId: actor.userId,
    actorRoles: actor.roles,
    fromStatus: existing.status,
    decision,
    reviewerNote,
  });
  if (!validation.ok) {
    return validation;
  }

  if (decision === "APPROVE") {
    const leaks = detectConfidentialLeak(
      {
        teaserTitle: existing.teaserTitle,
        teaserSummary: existing.teaserSummary,
        reasonForSelling: existing.reasonForSelling,
        financialNarrative: existing.financialNarrative,
        risksSummary: existing.risksSummary,
        founderStory: existing.founderStory,
      },
      {
        redactedName: existing.redactedName,
        redactedDomain: existing.redactedDomain,
      }
    );
    if (leaks.length > 0) {
      const first = leaks[0]!;
      return {
        ok: false,
        code: "INVALID_TRANSITION",
        reason: `Cannot approve listing while confidential term ("${first.matchedTerm}") appears in "${first.field}". Flag for edits instead.`,
      };
    }
  }

  const updatedRaw: RawBusinessRecord = {
    ...existing,
    status: validation.nextStatus,
    reviewedAt: nowIso,
    reviewedById: actor.userId,
    reviewerNote: validation.reviewerNote,
    auditLogs: [
      {
        id: `audit-${Date.now().toString(36)}`,
        actorId: actor.userId,
        actorLabel: actor.name,
        action: validation.auditAction,
        previousStatus: existing.status,
        newStatus: validation.nextStatus,
        note: validation.reviewerNote,
        createdAt: nowIso,
      },
      ...existing.auditLogs,
    ],
    updatedAt: nowIso,
  };

  store[idx] = updatedRaw;
  if (validation.nextStatus === "APPROVED") {
    await evaluateAndSendThesisAlertsForListing(updatedRaw, actor.userId);
  }
  return {
    ok: true,
    listing: sanitizeListingForViewer(updatedRaw, viewer, now),
  };
}

export async function addListingQuestion(
  listingId: string,
  questionText: string,
  actor: AuthSession
): Promise<
  | { ok: true; question: ListingQuestionRecord }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; reason: string }
> {
  const now = new Date();
  const nowIso = now.toISOString();
  const trimmed = questionText.trim();
  const defaultAskerLabel = actor.roles.includes("BUYER")
    ? "Prospective Buyer"
    : actor.roles.includes("ADMIN") || actor.roles.includes("REVIEWER")
      ? "Platform Reviewer"
      : "Marketplace Member";

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const biz = await prisma.business.findUnique({
      where: { id: listingId },
      include: { sellerProfile: { select: { userId: true } } },
    });
    if (!biz || biz.status !== PrismaListingStatus.APPROVED) {
      return {
        ok: false,
        code: "NOT_FOUND",
        reason: "Questions can only be posted on approved listings.",
      };
    }
    if (biz.sellerProfile.userId === actor.userId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Listing owners cannot submit buyer questions on their own listing.",
      };
    }

    const latestIdentity = actor.roles.includes("BUYER")
      ? await prisma.verification.findFirst({
          where: { userId: actor.userId, type: "IDENTITY" },
          orderBy: { updatedAt: "desc" },
        })
      : null;
    const isIdentityVerified = latestIdentity
      ? evaluateVerification(latestIdentity, now).isVerified
      : false;
    const askerLabel = isIdentityVerified
      ? "Identity-verified Buyer"
      : defaultAskerLabel;

    const q = await prisma.$transaction(async (tx) => {
      const created = await tx.listingQuestion.create({
        data: {
          businessId: listingId,
          askerId: actor.userId,
          askerLabel,
          question: trimmed,
          isSampleData: false,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Business",
          entityId: listingId,
          action: "LISTING_QUESTION_POSTED",
          newState: { questionId: created.id },
        },
      });
      return created;
    });

    return {
      ok: true,
      question: {
        id: q.id,
        businessId: q.businessId,
        askerId: q.askerId,
        askerLabel: q.askerLabel,
        question: q.question,
        answer: q.answer,
        answeredAt: q.answeredAt ? q.answeredAt.toISOString() : null,
        isSampleData: q.isSampleData,
        createdAt: q.createdAt.toISOString(),
      },
    };
  }

  const store = getLocalListingsStore();
  const biz = store.find((b) => b.id === listingId);
  if (!biz || biz.status !== "APPROVED") {
    return {
      ok: false,
      code: "NOT_FOUND",
      reason: "Questions can only be posted on approved listings.",
    };
  }
  if (biz.sellerUserId === actor.userId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Listing owners cannot submit buyer questions on their own listing.",
    };
  }

  const isIdentityVerified = actor.roles.includes("BUYER")
    ? hasActiveLocalUserVerification(actor.userId, "IDENTITY", now)
    : false;
  const askerLabel = isIdentityVerified
    ? "Identity-verified Buyer"
    : defaultAskerLabel;

  const record: ListingQuestionRecord = {
    id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    businessId: listingId,
    askerId: actor.userId,
    askerLabel,
    question: trimmed,
    answer: null,
    answeredAt: null,
    isSampleData: false,
    createdAt: nowIso,
  };

  biz.questions.unshift(record);
  biz.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    actorLabel: actor.name,
    action: "LISTING_QUESTION_POSTED",
    previousStatus: biz.status,
    newStatus: biz.status,
    note: "Buyer posted a public Q&A question.",
    createdAt: nowIso,
  });

  return { ok: true, question: record };
}

export async function answerListingQuestion(
  listingId: string,
  questionId: string,
  answerText: string,
  actor: AuthSession
): Promise<
  | { ok: true; question: ListingQuestionRecord }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; reason: string }
> {
  const now = new Date();
  const nowIso = now.toISOString();
  const trimmed = answerText.trim();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const biz = await prisma.business.findUnique({
      where: { id: listingId },
      include: { sellerProfile: true },
    });
    if (!biz) {
      return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
    }
    if (
      biz.sellerProfile.userId !== actor.userId &&
      !actor.roles.includes("ADMIN")
    ) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the listing owner can answer buyer questions.",
      };
    }

    const q = await prisma.listingQuestion.findFirst({
      where: { id: questionId, businessId: listingId },
    });
    if (!q) {
      return { ok: false, code: "NOT_FOUND", reason: "Question not found." };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.listingQuestion.update({
        where: { id: q.id },
        data: { answer: trimmed, answeredAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Business",
          entityId: listingId,
          action: "LISTING_QUESTION_ANSWERED",
          newState: { questionId: q.id },
        },
      });
      return res;
    });

    return {
      ok: true,
      question: {
        id: updated.id,
        businessId: updated.businessId,
        askerId: updated.askerId,
        askerLabel: updated.askerLabel,
        question: updated.question,
        answer: updated.answer,
        answeredAt: updated.answeredAt ? updated.answeredAt.toISOString() : null,
        isSampleData: updated.isSampleData,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  }

  const store = getLocalListingsStore();
  const biz = store.find((b) => b.id === listingId);
  if (!biz) {
    return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
  }
  if (biz.sellerUserId !== actor.userId && !actor.roles.includes("ADMIN")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the listing owner can answer buyer questions.",
    };
  }
  const q = biz.questions.find((item) => item.id === questionId);
  if (!q) {
    return { ok: false, code: "NOT_FOUND", reason: "Question not found." };
  }

  q.answer = trimmed;
  q.answeredAt = nowIso;
  biz.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    actorLabel: actor.name,
    action: "LISTING_QUESTION_ANSWERED",
    previousStatus: biz.status,
    newStatus: biz.status,
    note: "Seller answered a public Q&A question.",
    createdAt: nowIso,
  });

  return { ok: true, question: q };
}
