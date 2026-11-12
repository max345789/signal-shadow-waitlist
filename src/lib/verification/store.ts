import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import type { AuthSession } from "@/lib/auth/types";
import type {
  MetricKeyValue,
  RawBusinessMetricRecord,
  RawBusinessRecord,
} from "@/lib/domain/listings";
import {
  buildDefaultFinancialSeries,
  type FinancialSeriesPoint,
} from "@/lib/domain/valuation";
import {
  evaluateVerification,
  hasActiveBuyerDataAccessVerification,
  validateVerificationReviewTransition,
  type AdminVerificationDecision,
  type AnalyticsConnectorProvider,
  type EvaluatedVerification,
  type FullVerificationRecord,
  type IdentityProvider,
  type PaymentConnectorProvider,
  type ProofOfFundsProvider,
  type VerificationMetadata,
  type VerificationStatusValue,
  type VerificationTypeValue,
} from "@/lib/domain/verification";
import type { CurrencyCode } from "@/lib/format/currency";
import { getLocalListingsStoreForVerification } from "@/lib/listings/store";
import {
  CONNECTOR_PROVIDER_SPECS,
  fetchReadOnlyConnectorMetrics,
  maskSecretHint,
  type ConnectorSyncedMetric,
} from "@/lib/verification/connectors";
import { getLocalVerificationStore } from "@/lib/verification/local-store";
import {
  CurrencyCode as PrismaCurrencyCode,
  MetricKey as PrismaMetricKey,
  MetricSource as PrismaMetricSource,
  MetricUnit as PrismaMetricUnit,
  Prisma,
  VerificationStatus as PrismaVerificationStatus,
  VerificationType as PrismaVerificationType,
} from "@prisma/client";

export interface VerificationWithEvaluation {
  record: FullVerificationRecord;
  evaluated: EvaluatedVerification;
}

export interface SellerBusinessConnectorSummary {
  businessId: string;
  slug: string;
  teaserTitle: string;
  status: string;
  currency: CurrencyCode;
  isSampleData: boolean;
  verifiedMetricsCount: number;
  totalMetricsCount: number;
  paymentConnector: VerificationWithEvaluation | null;
  analyticsConnector: VerificationWithEvaluation | null;
}

export interface VerificationCentreState {
  identity: VerificationWithEvaluation | null;
  proofOfFunds: VerificationWithEvaluation | null;
  buyerDataAccess: ReturnType<typeof hasActiveBuyerDataAccessVerification>;
  sellerBusinesses: SellerBusinessConnectorSummary[];
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    createdAt: string;
  }>;
}

function parseMetadata(raw: unknown): VerificationMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as VerificationMetadata;
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

function mapPrismaVerificationRow(row: {
  id: string;
  userId: string | null;
  businessId: string | null;
  type: PrismaVerificationType;
  provider: string;
  status: PrismaVerificationStatus;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  failureReason: string | null;
  metadataJson: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { id: string; name: string; email: string } | null;
  business?: { id: string; teaserTitle: string; slug: string; isSampleData: boolean } | null;
}): FullVerificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null,
    businessId: row.businessId,
    businessTitle: row.business?.teaserTitle ?? null,
    businessSlug: row.business?.slug ?? null,
    type: row.type as VerificationTypeValue,
    provider: row.provider,
    status: row.status as VerificationStatusValue,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    failureReason: row.failureReason,
    metadata: parseMetadata(row.metadataJson),
    isSampleData: Boolean(row.business?.isSampleData),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function updateSeriesSourceForPaymentVerification(
  existingSeries: FinancialSeriesPoint[],
  verifiedRevenue: number | null,
  annualProfit: number,
  markVerified: boolean
): FinancialSeriesPoint[] {
  const baseSeries =
    existingSeries.length > 0
      ? existingSeries
      : buildDefaultFinancialSeries(verifiedRevenue ?? 0, annualProfit, 20);

  if (!markVerified) {
    return baseSeries.map((pt) => ({ ...pt, source: "SELLER_REPORTED" }));
  }

  const currentTotal = baseSeries.reduce((s, pt) => s + pt.revenue, 0);
  if (verifiedRevenue !== null && verifiedRevenue > 0 && currentTotal > 0) {
    const ratio = verifiedRevenue / currentTotal;
    return baseSeries.map((pt) => ({
      ...pt,
      revenue: Math.round(pt.revenue * ratio),
      source: "VERIFIED",
    }));
  }

  return baseSeries.map((pt) => ({ ...pt, source: "VERIFIED" }));
}

function syncLocalBusinessWithConnector(params: {
  business: RawBusinessRecord;
  verification: FullVerificationRecord;
  connectorKind: "PAYMENT" | "ANALYTICS";
  syncedMetrics?: ConnectorSyncedMetric[];
  auditAction: string;
  actorId: string | null;
  actorLabel: string;
  note: string;
  nowIso: string;
}) {
  const { business, verification, connectorKind, syncedMetrics, nowIso } = params;
  const targetKeys: MetricKeyValue[] =
    connectorKind === "PAYMENT" ? ["REVENUE", "CUSTOMERS"] : ["TRAFFIC"];

  const verSummary = {
    id: verification.id,
    provider: verification.provider,
    status: verification.status,
    verifiedAt: verification.verifiedAt,
    expiresAt: verification.expiresAt,
    failureReason: verification.failureReason ?? null,
  };

  const syncedMap = new Map((syncedMetrics ?? []).map((m) => [m.key, m]));
  const updatedKeys = new Set<MetricKeyValue>();

  const nextMetrics: RawBusinessMetricRecord[] = business.metrics.map((m) => {
    if (!targetKeys.includes(m.key)) {
      return m;
    }
    updatedKeys.add(m.key);
    const synced = syncedMap.get(m.key);
    if (synced) {
      return {
        ...m,
        value: synced.value,
        label: synced.label,
        unit: synced.unit,
        currency: synced.currency,
        source: synced.source,
        verification: verSummary,
      };
    }
    return {
      ...m,
      source:
        verification.provider === "Stripe"
          ? "STRIPE"
          : verification.provider === "Razorpay"
            ? "RAZORPAY"
            : verification.provider === "GA4"
              ? "GA4"
              : verification.provider === "Plausible"
                ? "PLAUSIBLE"
                : m.source,
      verification: verSummary,
    };
  });

  if (syncedMetrics) {
    for (const synced of syncedMetrics) {
      if (!updatedKeys.has(synced.key)) {
        nextMetrics.push({
          id: `${business.id}-m-${synced.key.toLowerCase()}`,
          key: synced.key,
          label: synced.label,
          value: synced.value,
          unit: synced.unit,
          currency: synced.currency,
          source: synced.source,
          verification: verSummary,
          isSampleData: business.isSampleData,
        });
      }
    }
  }

  business.metrics = nextMetrics;

  if (connectorKind === "PAYMENT") {
    const profitVal =
      business.metrics.find((m) => m.key === "PROFIT")?.value ?? 0;
    const revVal =
      syncedMap.get("REVENUE")?.value ??
      business.metrics.find((m) => m.key === "REVENUE")?.value ??
      0;
    const isVerifiedActive = evaluateVerification(verSummary).isVerified;
    business.financialSeries = updateSeriesSourceForPaymentVerification(
      business.financialSeries,
      isVerifiedActive ? revVal : null,
      profitVal,
      isVerifiedActive
    );
  }

  business.updatedAt = nowIso;
  business.auditLogs.unshift({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: params.actorId,
    actorLabel: params.actorLabel,
    action: params.auditAction,
    previousStatus: business.status,
    newStatus: business.status,
    note: params.note,
    createdAt: nowIso,
  });
}

function parseFinancialSeriesFromJson(rawJson: unknown): FinancialSeriesPoint[] {
  if (!Array.isArray(rawJson)) return [];
  const out: FinancialSeriesPoint[] = [];
  for (const item of rawJson) {
    if (
      item &&
      typeof item === "object" &&
      "period" in item &&
      "revenue" in item &&
      "profit" in item
    ) {
      const obj = item as Record<string, unknown>;
      out.push({
        period: String(obj.period ?? ""),
        revenue: Number(obj.revenue ?? 0),
        profit: Number(obj.profit ?? 0),
        source: obj.source === "VERIFIED" ? "VERIFIED" : "SELLER_REPORTED",
      });
    }
  }
  return out;
}

export async function reconcileExpiredVerifications(
  now: Date = new Date()
): Promise<{ expiredCount: number }> {
  const nowIso = now.toISOString();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const expiredRows = await prisma.verification.findMany({
      where: {
        status: PrismaVerificationStatus.VERIFIED,
        expiresAt: { lte: now },
      },
      include: {
        business: {
          select: {
            id: true,
            teaserTitle: true,
            financialSeriesJson: true,
            metrics: { where: { key: "PROFIT" }, select: { value: true } },
            sellerProfile: { select: { userId: true } },
          },
        },
      },
    });

    if (expiredRows.length === 0) {
      return { expiredCount: 0 };
    }

    for (const row of expiredRows) {
      const reason = `${row.provider} verification expired — re-verification required`;
      await prisma.$transaction(async (tx) => {
        await tx.verification.update({
          where: { id: row.id },
          data: {
            status: PrismaVerificationStatus.EXPIRED,
            failureReason: reason,
          },
        });

        if (row.type === PrismaVerificationType.IDENTITY && row.userId) {
          await tx.buyerProfile.updateMany({
            where: { userId: row.userId },
            data: { identityStatus: PrismaVerificationStatus.EXPIRED },
          });
          await tx.sellerProfile.updateMany({
            where: { userId: row.userId },
            data: { identityStatus: PrismaVerificationStatus.EXPIRED },
          });
        } else if (row.type === PrismaVerificationType.PROOF_OF_FUNDS && row.userId) {
          await tx.buyerProfile.updateMany({
            where: { userId: row.userId },
            data: { proofOfFundsStatus: PrismaVerificationStatus.EXPIRED },
          });
        } else if (
          row.type === PrismaVerificationType.PAYMENT_CONNECTOR &&
          row.business
        ) {
          await tx.businessMetric.updateMany({
            where: { verificationId: row.id },
            data: { verifiedAt: null },
          });

          const series = parseFinancialSeriesFromJson(row.business.financialSeriesJson);
          const profit = Number(row.business.metrics[0]?.value ?? 0);
          const reverted = updateSeriesSourceForPaymentVerification(
            series,
            null,
            profit,
            false
          );
          await tx.business.update({
            where: { id: row.business.id },
            data: {
              financialSeriesJson: reverted as unknown as Prisma.InputJsonValue,
            },
          });
        } else if (
          row.type === PrismaVerificationType.ANALYTICS_CONNECTOR &&
          row.business
        ) {
          await tx.businessMetric.updateMany({
            where: { verificationId: row.id },
            data: { verifiedAt: null },
          });
        }

        const recipientUserId =
          row.userId ?? row.business?.sellerProfile.userId ?? null;
        if (recipientUserId) {
          await tx.notification.create({
            data: {
              userId: recipientUserId,
              type: "VERIFICATION_EXPIRED",
              title: `${row.provider} verification expired`,
              body: `Your ${row.provider} verification expired and the Verified mark was removed automatically. Re-verify in the Verification Centre.`,
              actionUrl: "/verify",
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorId: null,
            entityType: "Verification",
            entityId: row.id,
            action: "VERIFICATION_EXPIRED",
            previousState: { status: "VERIFIED" },
            newState: { status: "EXPIRED" },
            metadataJson: { provider: row.provider, type: row.type },
          },
        });
      });
    }

    return { expiredCount: expiredRows.length };
  }

  const store = getLocalVerificationStore();
  const listings = getLocalListingsStoreForVerification();
  let expiredCount = 0;

  for (const record of store.verifications) {
    const expiresAtMs = record.expiresAt
      ? new Date(record.expiresAt).getTime()
      : null;
    if (
      record.status === "VERIFIED" &&
      expiresAtMs !== null &&
      !Number.isNaN(expiresAtMs) &&
      expiresAtMs <= now.getTime()
    ) {
      expiredCount += 1;
      record.status = "EXPIRED";
      record.failureReason = `${record.provider} verification expired — re-verification required`;
      record.updatedAt = nowIso;

      if (record.businessId) {
        const biz = listings.find((b) => b.id === record.businessId);
        if (biz) {
          const kind =
            record.type === "ANALYTICS_CONNECTOR" ? "ANALYTICS" : "PAYMENT";
          syncLocalBusinessWithConnector({
            business: biz,
            verification: record,
            connectorKind: kind,
            auditAction: "VERIFICATION_EXPIRED",
            actorId: null,
            actorLabel: "Automated Expiry Sweeper",
            note: record.failureReason,
            nowIso,
          });
        }
      }

      store.auditLogs.unshift({
        id: `vaudit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        actorId: null,
        entityId: record.id,
        action: "VERIFICATION_EXPIRED",
        previousStatus: "VERIFIED",
        newStatus: "EXPIRED",
        note: record.failureReason,
        createdAt: nowIso,
      });
    }
  }

  return { expiredCount };
}

export async function getVerificationCentreState(
  session: AuthSession,
  now: Date = new Date()
): Promise<VerificationCentreState> {
  await reconcileExpiredVerifications(now);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const isAdmin = session.roles.includes("ADMIN");

    const [userVerifications, businesses, notifications] = await Promise.all([
      prisma.verification.findMany({
        where: {
          userId: session.userId,
          type: {
            in: [
              PrismaVerificationType.IDENTITY,
              PrismaVerificationType.PROOF_OF_FUNDS,
            ],
          },
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      session.roles.includes("SELLER") || isAdmin
        ? prisma.business.findMany({
            where: isAdmin ? undefined : { sellerProfile: { userId: session.userId } },
            include: {
              metrics: { include: { verification: true } },
              verifications: {
                where: {
                  type: {
                    in: [
                      PrismaVerificationType.PAYMENT_CONNECTOR,
                      PrismaVerificationType.ANALYTICS_CONNECTOR,
                    ],
                  },
                },
                include: {
                  user: { select: { id: true, name: true, email: true } },
                  business: {
                    select: {
                      id: true,
                      teaserTitle: true,
                      slug: true,
                      isSampleData: true,
                    },
                  },
                },
                orderBy: { updatedAt: "desc" },
              },
            },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
      prisma.notification.findMany({
        where: {
          userId: session.userId,
          type: { startsWith: "VERIFICATION_" },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const identityRow =
      userVerifications.find((v) => v.type === PrismaVerificationType.IDENTITY) ??
      null;
    const pofRow =
      userVerifications.find(
        (v) => v.type === PrismaVerificationType.PROOF_OF_FUNDS
      ) ?? null;

    const identityRecord = identityRow ? mapPrismaVerificationRow(identityRow) : null;
    const pofRecord = pofRow ? mapPrismaVerificationRow(pofRow) : null;

    const sellerBusinesses: SellerBusinessConnectorSummary[] = businesses.map(
      (biz) => {
        const payRow =
          biz.verifications.find(
            (v) => v.type === PrismaVerificationType.PAYMENT_CONNECTOR
          ) ?? null;
        const analyticsRow =
          biz.verifications.find(
            (v) => v.type === PrismaVerificationType.ANALYTICS_CONNECTOR
          ) ?? null;
        const payRecord = payRow ? mapPrismaVerificationRow(payRow) : null;
        const analyticsRecord = analyticsRow
          ? mapPrismaVerificationRow(analyticsRow)
          : null;

        const verifiedMetricsCount = biz.metrics.filter(
          (m) => evaluateVerification(m.verification, now).isVerified
        ).length;

        return {
          businessId: biz.id,
          slug: biz.slug,
          teaserTitle: biz.teaserTitle,
          status: biz.status,
          currency: biz.currency as CurrencyCode,
          isSampleData: biz.isSampleData,
          verifiedMetricsCount,
          totalMetricsCount: biz.metrics.length,
          paymentConnector: payRecord
            ? {
                record: payRecord,
                evaluated: evaluateVerification(payRecord, now),
              }
            : null,
          analyticsConnector: analyticsRecord
            ? {
                record: analyticsRecord,
                evaluated: evaluateVerification(analyticsRecord, now),
              }
            : null,
        };
      }
    );

    return {
      identity: identityRecord
        ? {
            record: identityRecord,
            evaluated: evaluateVerification(identityRecord, now),
          }
        : null,
      proofOfFunds: pofRecord
        ? {
            record: pofRecord,
            evaluated: evaluateVerification(pofRecord, now),
          }
        : null,
      buyerDataAccess: hasActiveBuyerDataAccessVerification({
        identity: identityRecord,
        proofOfFunds: pofRecord,
        now,
      }),
      sellerBusinesses,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  const store = getLocalVerificationStore();
  const listings = getLocalListingsStoreForVerification();
  const isAdmin = session.roles.includes("ADMIN");

  const identityRecord =
    store.verifications
      .filter((v) => v.userId === session.userId && v.type === "IDENTITY")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;

  const pofRecord =
    store.verifications
      .filter((v) => v.userId === session.userId && v.type === "PROOF_OF_FUNDS")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;

  const ownedBusinesses =
    session.roles.includes("SELLER") || isAdmin
      ? listings.filter((b) => isAdmin || b.sellerUserId === session.userId)
      : [];

  const sellerBusinesses: SellerBusinessConnectorSummary[] = ownedBusinesses.map(
    (biz) => {
      const payRecord =
        store.verifications
          .filter(
            (v) => v.businessId === biz.id && v.type === "PAYMENT_CONNECTOR"
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
      const analyticsRecord =
        store.verifications
          .filter(
            (v) => v.businessId === biz.id && v.type === "ANALYTICS_CONNECTOR"
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;

      const verifiedMetricsCount = biz.metrics.filter(
        (m) => evaluateVerification(m.verification, now).isVerified
      ).length;

      return {
        businessId: biz.id,
        slug: biz.slug,
        teaserTitle: biz.teaserTitle,
        status: biz.status,
        currency: biz.currency,
        isSampleData: biz.isSampleData,
        verifiedMetricsCount,
        totalMetricsCount: biz.metrics.length,
        paymentConnector: payRecord
          ? {
              record: payRecord,
              evaluated: evaluateVerification(payRecord, now),
            }
          : null,
        analyticsConnector: analyticsRecord
          ? {
              record: analyticsRecord,
              evaluated: evaluateVerification(analyticsRecord, now),
            }
          : null,
      };
    }
  );

  const recentVerificationAlerts = store.auditLogs
    .filter(
      (a) =>
        (a.action === "VERIFICATION_EXPIRED" ||
          a.action === "CONNECTOR_SYNC_FAILED" ||
          a.action === "CONNECTOR_CONNECTION_FAILED" ||
          a.action === "VERIFICATION_FAILED" ||
          a.action === "VERIFICATION_REVOKED" ||
          a.action === "VERIFICATION_APPROVED") &&
        store.verifications.some(
          (v) => v.id === a.entityId && v.userId === session.userId
        )
    )
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      type: a.action,
      title: a.action.replace(/_/g, " "),
      body: a.note ?? "Verification status changed.",
      createdAt: a.createdAt,
    }));

  return {
    identity: identityRecord
      ? {
          record: identityRecord,
          evaluated: evaluateVerification(identityRecord, now),
        }
      : null,
    proofOfFunds: pofRecord
      ? {
          record: pofRecord,
          evaluated: evaluateVerification(pofRecord, now),
        }
      : null,
    buyerDataAccess: hasActiveBuyerDataAccessVerification({
      identity: identityRecord,
      proofOfFunds: pofRecord,
      now,
    }),
    sellerBusinesses,
    notifications: recentVerificationAlerts,
  };
}

export async function submitIdentityVerification(
  input: {
    provider: IdentityProvider;
    legalName: string;
    country: string;
    documentType: "PAN" | "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE";
    referenceLast4: string;
    roleContext: "BUYER" | "SELLER";
  },
  actor: AuthSession
): Promise<
  | { ok: true; data: VerificationWithEvaluation }
  | { ok: false; code: "FORBIDDEN"; reason: string }
> {
  if (
    input.roleContext === "BUYER" &&
    !actor.roles.includes("BUYER") &&
    !actor.roles.includes("ADMIN")
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "A Buyer role is required to submit Buyer KYC verification.",
    };
  }
  if (
    input.roleContext === "SELLER" &&
    !actor.roles.includes("SELLER") &&
    !actor.roles.includes("ADMIN")
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "A Seller role is required to submit Seller KYC verification.",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const metadata: VerificationMetadata = {
    roleContext: input.roleContext,
    legalName: input.legalName.trim(),
    country: input.country.trim(),
    documentType: input.documentType,
    maskedReference: maskSecretHint(input.referenceLast4),
  };

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.verification.create({
        data: {
          userId: actor.userId,
          businessId: null,
          type: PrismaVerificationType.IDENTITY,
          provider: input.provider,
          status: PrismaVerificationStatus.PENDING,
          verifiedAt: null,
          expiresAt: null,
          failureReason: null,
          metadataJson: metadata as unknown as Prisma.InputJsonValue,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      if (input.roleContext === "BUYER") {
        await tx.buyerProfile.upsert({
          where: { userId: actor.userId },
          update: { identityStatus: PrismaVerificationStatus.PENDING },
          create: {
            userId: actor.userId,
            identityStatus: PrismaVerificationStatus.PENDING,
          },
        });
      } else {
        await tx.sellerProfile.upsert({
          where: { userId: actor.userId },
          update: { identityStatus: PrismaVerificationStatus.PENDING },
          create: {
            userId: actor.userId,
            identityStatus: PrismaVerificationStatus.PENDING,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Verification",
          entityId: created.id,
          action: "IDENTITY_VERIFICATION_SUBMITTED",
          previousState: Prisma.JsonNull,
          newState: { status: "PENDING", provider: input.provider },
          metadataJson: metadata as unknown as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    const record = mapPrismaVerificationRow(row);
    return {
      ok: true,
      data: {
        record,
        evaluated: evaluateVerification(record, now),
      },
    };
  }

  const store = getLocalVerificationStore();
  const record: FullVerificationRecord = {
    id: `ver-id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId: actor.userId,
    userName: actor.name,
    userEmail: actor.email,
    businessId: null,
    businessTitle: null,
    businessSlug: null,
    type: "IDENTITY",
    provider: input.provider,
    status: "PENDING",
    verifiedAt: null,
    expiresAt: null,
    failureReason: null,
    metadata,
    isSampleData: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.verifications.unshift(record);
  store.auditLogs.unshift({
    id: `vaudit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    entityId: record.id,
    action: "IDENTITY_VERIFICATION_SUBMITTED",
    previousStatus: null,
    newStatus: "PENDING",
    note: `${input.provider} KYC submitted for compliance verification.`,
    createdAt: nowIso,
  });

  return {
    ok: true,
    data: {
      record,
      evaluated: evaluateVerification(record, now),
    },
  };
}

export async function submitProofOfFundsVerification(
  input: {
    provider: ProofOfFundsProvider;
    amount: number;
    currency: CurrencyCode;
    institutionLabel: string;
    attestationRef: string;
  },
  actor: AuthSession
): Promise<
  | { ok: true; data: VerificationWithEvaluation }
  | { ok: false; code: "FORBIDDEN"; reason: string }
> {
  if (!actor.roles.includes("BUYER") && !actor.roles.includes("ADMIN")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "A Buyer or Admin role is required to submit Proof of Funds.",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const metadata: VerificationMetadata = {
    roleContext: "BUYER",
    declaredAmount: input.amount,
    currency: input.currency,
    institutionLabel: input.institutionLabel.trim(),
    attestationRef: input.attestationRef.trim(),
  };

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.verification.create({
        data: {
          userId: actor.userId,
          businessId: null,
          type: PrismaVerificationType.PROOF_OF_FUNDS,
          provider: input.provider,
          status: PrismaVerificationStatus.PENDING,
          verifiedAt: null,
          expiresAt: null,
          failureReason: null,
          metadataJson: metadata as unknown as Prisma.InputJsonValue,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.buyerProfile.upsert({
        where: { userId: actor.userId },
        update: { proofOfFundsStatus: PrismaVerificationStatus.PENDING },
        create: {
          userId: actor.userId,
          preferredCurrency: input.currency as PrismaCurrencyCode,
          proofOfFundsStatus: PrismaVerificationStatus.PENDING,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Verification",
          entityId: created.id,
          action: "PROOF_OF_FUNDS_SUBMITTED",
          previousState: Prisma.JsonNull,
          newState: { status: "PENDING", provider: input.provider },
          metadataJson: metadata as unknown as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    const record = mapPrismaVerificationRow(row);
    return {
      ok: true,
      data: {
        record,
        evaluated: evaluateVerification(record, now),
      },
    };
  }

  const store = getLocalVerificationStore();
  const record: FullVerificationRecord = {
    id: `ver-pof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId: actor.userId,
    userName: actor.name,
    userEmail: actor.email,
    businessId: null,
    businessTitle: null,
    businessSlug: null,
    type: "PROOF_OF_FUNDS",
    provider: input.provider,
    status: "PENDING",
    verifiedAt: null,
    expiresAt: null,
    failureReason: null,
    metadata,
    isSampleData: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.verifications.unshift(record);
  store.auditLogs.unshift({
    id: `vaudit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    entityId: record.id,
    action: "PROOF_OF_FUNDS_SUBMITTED",
    previousStatus: null,
    newStatus: "PENDING",
    note: `${input.provider} Proof of Funds submitted for compliance review.`,
    createdAt: nowIso,
  });

  return {
    ok: true,
    data: {
      record,
      evaluated: evaluateVerification(record, now),
    },
  };
}

export async function connectBusinessAccount(
  input: {
    businessId: string;
    connectorKind: "PAYMENT" | "ANALYTICS";
    provider: PaymentConnectorProvider | AnalyticsConnectorProvider;
    accountIdentifier: string;
    readOnlyToken: string;
    syncIntervalMinutes: number;
    expiresInHours?: number;
  },
  actor: AuthSession
): Promise<
  | {
      ok: true;
      data: VerificationWithEvaluation;
      syncedMetrics: ConnectorSyncedMetric[];
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN" | "CONNECTION_FAILED";
      reason: string;
      data?: VerificationWithEvaluation;
    }
> {
  if (!actor.roles.includes("SELLER") && !actor.roles.includes("ADMIN")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "A Seller or Admin role is required to connect business accounts.",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const verificationType: VerificationTypeValue =
    input.connectorKind === "PAYMENT"
      ? "PAYMENT_CONNECTOR"
      : "ANALYTICS_CONNECTOR";
  const spec = CONNECTOR_PROVIDER_SPECS[input.provider];
  const ttlHours = input.expiresInHours ?? 168; // 7 days default

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const biz = await prisma.business.findUnique({
      where: { id: input.businessId },
      include: {
        sellerProfile: { select: { userId: true } },
        metrics: true,
      },
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
        reason: "Only the owning Seller can connect accounts to this listing.",
      };
    }

    const fetchResult = await fetchReadOnlyConnectorMetrics({
      provider: input.provider,
      accountIdentifier: input.accountIdentifier,
      readOnlyToken: input.readOnlyToken,
      baselineMetrics: biz.metrics.map((m) => ({
        key: m.key as MetricKeyValue,
        value: Number(m.value),
        currency: (m.currency as CurrencyCode | null) ?? null,
      })),
      businessCurrency: biz.currency as CurrencyCode,
      syncCount: 0,
    });

    const existingConnector = await prisma.verification.findFirst({
      where: {
        businessId: biz.id,
        type: verificationType as PrismaVerificationType,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!fetchResult.ok) {
      const failStatus =
        fetchResult.code === "TOKEN_EXPIRED"
          ? PrismaVerificationStatus.EXPIRED
          : PrismaVerificationStatus.FAILED;
      const failMeta: VerificationMetadata = {
        connectorKind: input.connectorKind,
        accountIdentifier: input.accountIdentifier.trim(),
        readOnlyScope: true,
        syncIntervalMinutes: input.syncIntervalMinutes,
        lastSyncAttemptAt: nowIso,
        adapterMode: "sandbox",
        sandboxTokenBehavior: fetchResult.sandboxTokenBehavior,
        syncedMetricKeys: spec.metricKeys,
      };

      const savedFail = await prisma.$transaction(async (tx) => {
        const ver = existingConnector
          ? await tx.verification.update({
              where: { id: existingConnector.id },
              data: {
                provider: input.provider,
                status: failStatus,
                failureReason: fetchResult.reason,
                expiresAt:
                  fetchResult.code === "TOKEN_EXPIRED"
                    ? now
                    : existingConnector.expiresAt,
                metadataJson: failMeta as unknown as Prisma.InputJsonValue,
              },
              include: {
                user: { select: { id: true, name: true, email: true } },
                business: {
                  select: {
                    id: true,
                    teaserTitle: true,
                    slug: true,
                    isSampleData: true,
                  },
                },
              },
            })
          : await tx.verification.create({
              data: {
                userId: actor.userId,
                businessId: biz.id,
                type: verificationType as PrismaVerificationType,
                provider: input.provider,
                status: failStatus,
                verifiedAt: null,
                expiresAt: fetchResult.code === "TOKEN_EXPIRED" ? now : null,
                failureReason: fetchResult.reason,
                metadataJson: failMeta as unknown as Prisma.InputJsonValue,
              },
              include: {
                user: { select: { id: true, name: true, email: true } },
                business: {
                  select: {
                    id: true,
                    teaserTitle: true,
                    slug: true,
                    isSampleData: true,
                  },
                },
              },
            });

        await tx.businessMetric.updateMany({
          where: {
            businessId: biz.id,
            key: { in: spec.metricKeys as PrismaMetricKey[] },
          },
          data: {
            source: spec.source as PrismaMetricSource,
            verificationId: ver.id,
            verifiedAt: null,
          },
        });

        if (input.connectorKind === "PAYMENT") {
          const series = parseFinancialSeriesFromJson(biz.financialSeriesJson);
          const profit = Number(
            biz.metrics.find((m) => m.key === "PROFIT")?.value ?? 0
          );
          await tx.business.update({
            where: { id: biz.id },
            data: {
              financialSeriesJson: updateSeriesSourceForPaymentVerification(
                series,
                null,
                profit,
                false
              ) as unknown as Prisma.InputJsonValue,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            entityType: "Verification",
            entityId: ver.id,
            action: "CONNECTOR_CONNECTION_FAILED",
            previousState: existingConnector
              ? { status: existingConnector.status }
              : Prisma.JsonNull,
            newState: { status: failStatus, provider: input.provider },
            metadataJson: { reason: fetchResult.reason },
          },
        });

        return ver;
      });

      const record = mapPrismaVerificationRow(savedFail);
      return {
        ok: false,
        code: "CONNECTION_FAILED",
        reason: fetchResult.reason,
        data: {
          record,
          evaluated: evaluateVerification(record, now),
        },
      };
    }

    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    const nextSyncAt = new Date(
      now.getTime() + input.syncIntervalMinutes * 60 * 1000
    ).toISOString();

    const successMeta: VerificationMetadata = {
      connectorKind: input.connectorKind,
      accountIdentifier: input.accountIdentifier.trim(),
      accountHint: fetchResult.accountHint,
      readOnlyScope: true,
      syncIntervalMinutes: input.syncIntervalMinutes,
      lastSyncAttemptAt: nowIso,
      nextSyncAt,
      adapterMode: fetchResult.adapterMode,
      sandboxTokenBehavior: fetchResult.sandboxTokenBehavior,
      syncedMetricKeys: fetchResult.metrics.map((m) => m.key),
    };

    const saved = await prisma.$transaction(async (tx) => {
      const ver = existingConnector
        ? await tx.verification.update({
            where: { id: existingConnector.id },
            data: {
              userId: biz.sellerProfile.userId,
              provider: input.provider,
              status: PrismaVerificationStatus.VERIFIED,
              verifiedAt: now,
              expiresAt,
              failureReason: null,
              metadataJson: successMeta as unknown as Prisma.InputJsonValue,
            },
            include: {
              user: { select: { id: true, name: true, email: true } },
              business: {
                select: {
                  id: true,
                  teaserTitle: true,
                  slug: true,
                  isSampleData: true,
                },
              },
            },
          })
        : await tx.verification.create({
            data: {
              userId: biz.sellerProfile.userId,
              businessId: biz.id,
              type: verificationType as PrismaVerificationType,
              provider: input.provider,
              status: PrismaVerificationStatus.VERIFIED,
              verifiedAt: now,
              expiresAt,
              failureReason: null,
              metadataJson: successMeta as unknown as Prisma.InputJsonValue,
            },
            include: {
              user: { select: { id: true, name: true, email: true } },
              business: {
                select: {
                  id: true,
                  teaserTitle: true,
                  slug: true,
                  isSampleData: true,
                },
              },
            },
          });

      for (const synced of fetchResult.metrics) {
        const existingMetric = biz.metrics.find((m) => m.key === synced.key);
        if (existingMetric) {
          await tx.businessMetric.update({
            where: { id: existingMetric.id },
            data: {
              value: synced.value,
              label: synced.label,
              source: synced.source as PrismaMetricSource,
              verificationId: ver.id,
              verifiedAt: now,
            },
          });
        } else {
          await tx.businessMetric.create({
            data: {
              businessId: biz.id,
              key: synced.key as PrismaMetricKey,
              label: synced.label,
              value: synced.value,
              unit: synced.unit as PrismaMetricUnit,
              currency: synced.currency
                ? (synced.currency as PrismaCurrencyCode)
                : null,
              source: synced.source as PrismaMetricSource,
              verificationId: ver.id,
              verifiedAt: now,
              isSampleData: biz.isSampleData,
            },
          });
        }
      }

      if (input.connectorKind === "PAYMENT") {
        const series = parseFinancialSeriesFromJson(biz.financialSeriesJson);
        const profit = Number(
          biz.metrics.find((m) => m.key === "PROFIT")?.value ?? 0
        );
        const revMetric = fetchResult.metrics.find((m) => m.key === "REVENUE");
        await tx.business.update({
          where: { id: biz.id },
          data: {
            financialSeriesJson: updateSeriesSourceForPaymentVerification(
              series,
              revMetric?.value ?? null,
              profit,
              true
            ) as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Verification",
          entityId: ver.id,
          action: "CONNECTOR_VERIFIED",
          previousState: existingConnector
            ? { status: existingConnector.status }
            : Prisma.JsonNull,
          newState: {
            status: "VERIFIED",
            provider: input.provider,
            businessId: biz.id,
          },
          metadataJson: successMeta as unknown as Prisma.InputJsonValue,
        },
      });

      return ver;
    });

    const record = mapPrismaVerificationRow(saved);
    return {
      ok: true,
      data: {
        record,
        evaluated: evaluateVerification(record, now),
      },
      syncedMetrics: fetchResult.metrics,
    };
  }

  // Local-dev branch
  const listings = getLocalListingsStoreForVerification();
  const biz = listings.find((b) => b.id === input.businessId);
  if (!biz) {
    return { ok: false, code: "NOT_FOUND", reason: "Listing not found." };
  }
  if (biz.sellerUserId !== actor.userId && !actor.roles.includes("ADMIN")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the owning Seller can connect accounts to this listing.",
    };
  }

  const fetchResult = await fetchReadOnlyConnectorMetrics({
    provider: input.provider,
    accountIdentifier: input.accountIdentifier,
    readOnlyToken: input.readOnlyToken,
    baselineMetrics: biz.metrics.map((m) => ({
      key: m.key,
      value: m.value,
      currency: m.currency,
    })),
    businessCurrency: biz.currency,
    syncCount: 0,
  });

  const store = getLocalVerificationStore();
  const existingIdx = store.verifications.findIndex(
    (v) => v.businessId === biz.id && v.type === verificationType
  );
  const existing = existingIdx >= 0 ? store.verifications[existingIdx]! : null;

  if (!fetchResult.ok) {
    const failStatus: VerificationStatusValue =
      fetchResult.code === "TOKEN_EXPIRED" ? "EXPIRED" : "FAILED";
    const failRecord: FullVerificationRecord = {
      id:
        existing?.id ??
        `ver-conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      userId: biz.sellerUserId,
      userName: biz.sellerDisplayLabel,
      userEmail: actor.email,
      businessId: biz.id,
      businessTitle: biz.teaserTitle,
      businessSlug: biz.slug,
      type: verificationType,
      provider: input.provider,
      status: failStatus,
      verifiedAt: existing?.verifiedAt ?? null,
      expiresAt: fetchResult.code === "TOKEN_EXPIRED" ? nowIso : null,
      failureReason: fetchResult.reason,
      metadata: {
        connectorKind: input.connectorKind,
        accountIdentifier: input.accountIdentifier.trim(),
        readOnlyScope: true,
        syncIntervalMinutes: input.syncIntervalMinutes,
        lastSyncAttemptAt: nowIso,
        adapterMode: "sandbox",
        sandboxTokenBehavior: fetchResult.sandboxTokenBehavior,
        syncedMetricKeys: spec.metricKeys,
      },
      isSampleData: biz.isSampleData,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    if (existingIdx >= 0) {
      store.verifications[existingIdx] = failRecord;
    } else {
      store.verifications.unshift(failRecord);
    }

    syncLocalBusinessWithConnector({
      business: biz,
      verification: failRecord,
      connectorKind: input.connectorKind,
      auditAction: "CONNECTOR_CONNECTION_FAILED",
      actorId: actor.userId,
      actorLabel: actor.name,
      note: fetchResult.reason,
      nowIso,
    });

    store.auditLogs.unshift({
      id: `vaudit-${Date.now().toString(36)}`,
      actorId: actor.userId,
      entityId: failRecord.id,
      action: "CONNECTOR_CONNECTION_FAILED",
      previousStatus: existing?.status ?? null,
      newStatus: failStatus,
      note: fetchResult.reason,
      createdAt: nowIso,
    });

    return {
      ok: false,
      code: "CONNECTION_FAILED",
      reason: fetchResult.reason,
      data: {
        record: failRecord,
        evaluated: evaluateVerification(failRecord, now),
      },
    };
  }

  const expiresAtIso = new Date(
    now.getTime() + ttlHours * 60 * 60 * 1000
  ).toISOString();
  const nextSyncAtIso = new Date(
    now.getTime() + input.syncIntervalMinutes * 60 * 1000
  ).toISOString();

  const verifiedRecord: FullVerificationRecord = {
    id:
      existing?.id ??
      `ver-conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId: biz.sellerUserId,
    userName: biz.sellerDisplayLabel,
    userEmail: actor.email,
    businessId: biz.id,
    businessTitle: biz.teaserTitle,
    businessSlug: biz.slug,
    type: verificationType,
    provider: input.provider,
    status: "VERIFIED",
    verifiedAt: nowIso,
    expiresAt: expiresAtIso,
    failureReason: null,
    metadata: {
      connectorKind: input.connectorKind,
      accountIdentifier: input.accountIdentifier.trim(),
      accountHint: fetchResult.accountHint,
      readOnlyScope: true,
      syncIntervalMinutes: input.syncIntervalMinutes,
      lastSyncAttemptAt: nowIso,
      nextSyncAt: nextSyncAtIso,
      adapterMode: fetchResult.adapterMode,
      sandboxTokenBehavior: fetchResult.sandboxTokenBehavior,
      syncedMetricKeys: fetchResult.metrics.map((m) => m.key),
    },
    isSampleData: biz.isSampleData,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  if (existingIdx >= 0) {
    store.verifications[existingIdx] = verifiedRecord;
  } else {
    store.verifications.unshift(verifiedRecord);
  }

  syncLocalBusinessWithConnector({
    business: biz,
    verification: verifiedRecord,
    connectorKind: input.connectorKind,
    syncedMetrics: fetchResult.metrics,
    auditAction: "CONNECTOR_VERIFIED",
    actorId: actor.userId,
    actorLabel: actor.name,
    note: `Connected read-only ${input.provider} (${fetchResult.accountHint}).`,
    nowIso,
  });

  store.auditLogs.unshift({
    id: `vaudit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    entityId: verifiedRecord.id,
    action: "CONNECTOR_VERIFIED",
    previousStatus: existing?.status ?? null,
    newStatus: "VERIFIED",
    note: `Verified ${input.provider} read-only connection.`,
    createdAt: nowIso,
  });

  return {
    ok: true,
    data: {
      record: verifiedRecord,
      evaluated: evaluateVerification(verifiedRecord, now),
    },
    syncedMetrics: fetchResult.metrics,
  };
}

export async function syncConnectorVerification(
  verificationId: string,
  options: { readOnlyToken?: string; now?: Date },
  actor: AuthSession
): Promise<
  | { ok: true; data: VerificationWithEvaluation }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE";
      reason: string;
    }
> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const isStaff =
    actor.roles.includes("ADMIN") || actor.roles.includes("REVIEWER");

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.verification.findUnique({
      where: { id: verificationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        business: {
          include: {
            sellerProfile: { select: { userId: true } },
            metrics: true,
          },
        },
      },
    });
    if (!row || !row.business) {
      return {
        ok: false,
        code: "NOT_FOUND",
        reason: "Connector verification record not found.",
      };
    }
    if (
      !isStaff &&
      row.userId !== actor.userId &&
      row.business.sellerProfile.userId !== actor.userId
    ) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the owning Seller or Admin can refresh this connector.",
      };
    }
    if (
      row.type !== PrismaVerificationType.PAYMENT_CONNECTOR &&
      row.type !== PrismaVerificationType.ANALYTICS_CONNECTOR
    ) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Only payment or analytics connectors can be refreshed.",
      };
    }
    if (
      (row.status === PrismaVerificationStatus.REVOKED ||
        row.status === PrismaVerificationStatus.FAILED) &&
      !options.readOnlyToken
    ) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason:
          row.status === PrismaVerificationStatus.REVOKED
            ? "Connector was revoked. Supply a new read-only token to reconnect."
            : "Connector failed verification. Supply a new read-only token to reconnect.",
      };
    }

    const meta = parseMetadata(row.metadataJson);
    const kind =
      row.type === PrismaVerificationType.ANALYTICS_CONNECTOR
        ? "ANALYTICS"
        : "PAYMENT";

    if (
      !options.readOnlyToken &&
      (row.status === PrismaVerificationStatus.EXPIRED ||
        (row.expiresAt && row.expiresAt.getTime() <= now.getTime()))
    ) {
      await reconcileExpiredVerifications(now);
      const refreshed = await prisma.verification.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          business: {
            select: {
              id: true,
              teaserTitle: true,
              slug: true,
              isSampleData: true,
            },
          },
        },
      });
      const rec = mapPrismaVerificationRow(refreshed);
      return {
        ok: true,
        data: { record: rec, evaluated: evaluateVerification(rec, now) },
      };
    }

    const provider = row.provider as
      | PaymentConnectorProvider
      | AnalyticsConnectorProvider;
    const fetchResult = await fetchReadOnlyConnectorMetrics({
      provider,
      accountIdentifier: meta.accountIdentifier ?? row.business.slug,
      readOnlyToken: options.readOnlyToken,
      previousBehavior: meta.sandboxTokenBehavior ?? "valid",
      baselineMetrics: row.business.metrics.map((m) => ({
        key: m.key as MetricKeyValue,
        value: Number(m.value),
        currency: (m.currency as CurrencyCode | null) ?? null,
      })),
      businessCurrency: row.business.currency as CurrencyCode,
      syncCount: 1,
    });

    if (!fetchResult.ok) {
      const failStatus =
        fetchResult.code === "TOKEN_EXPIRED"
          ? PrismaVerificationStatus.EXPIRED
          : PrismaVerificationStatus.FAILED;
      const nextMeta: VerificationMetadata = {
        ...meta,
        lastSyncAttemptAt: nowIso,
        sandboxTokenBehavior: fetchResult.sandboxTokenBehavior,
      };
      const updated = await prisma.$transaction(async (tx) => {
        const ver = await tx.verification.update({
          where: { id: row.id },
          data: {
            status: failStatus,
            failureReason: fetchResult.reason,
            expiresAt:
              fetchResult.code === "TOKEN_EXPIRED" ? now : row.expiresAt,
            metadataJson: nextMeta as unknown as Prisma.InputJsonValue,
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            business: {
              select: {
                id: true,
                teaserTitle: true,
                slug: true,
                isSampleData: true,
              },
            },
          },
        });

        await tx.businessMetric.updateMany({
          where: { verificationId: row.id },
          data: { verifiedAt: null },
        });

        if (kind === "PAYMENT" && row.business) {
          const series = parseFinancialSeriesFromJson(
            row.business.financialSeriesJson
          );
          const profit = Number(
            row.business.metrics.find((m) => m.key === "PROFIT")?.value ?? 0
          );
          await tx.business.update({
            where: { id: row.business.id },
            data: {
              financialSeriesJson: updateSeriesSourceForPaymentVerification(
                series,
                null,
                profit,
                false
              ) as unknown as Prisma.InputJsonValue,
            },
          });
        }

        await tx.notification.create({
          data: {
            userId: row.business!.sellerProfile.userId,
            type: "VERIFICATION_FAILED",
            title: `${row.provider} sync failed`,
            body: `${fetchResult.reason} The Verified mark has been removed automatically.`,
            actionUrl: "/verify",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            entityType: "Verification",
            entityId: row.id,
            action: "CONNECTOR_SYNC_FAILED",
            previousState: { status: row.status },
            newState: { status: failStatus },
            metadataJson: { reason: fetchResult.reason },
          },
        });

        return ver;
      });

      const rec = mapPrismaVerificationRow(updated);
      return {
        ok: true,
        data: { record: rec, evaluated: evaluateVerification(rec, now) },
      };
    }

    const interval = meta.syncIntervalMinutes ?? 60;
    const nextMeta: VerificationMetadata = {
      ...meta,
      accountHint: fetchResult.accountHint,
      lastSyncAttemptAt: nowIso,
      nextSyncAt: new Date(now.getTime() + interval * 60 * 1000).toISOString(),
      adapterMode: fetchResult.adapterMode,
      sandboxTokenBehavior: "valid",
    };
    const nextExpiry =
      row.expiresAt && row.expiresAt.getTime() > now.getTime()
        ? row.expiresAt
        : new Date(now.getTime() + 168 * 60 * 60 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      const ver = await tx.verification.update({
        where: { id: row.id },
        data: {
          status: PrismaVerificationStatus.VERIFIED,
          verifiedAt: now,
          expiresAt: nextExpiry,
          failureReason: null,
          metadataJson: nextMeta as unknown as Prisma.InputJsonValue,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          business: {
            select: {
              id: true,
              teaserTitle: true,
              slug: true,
              isSampleData: true,
            },
          },
        },
      });

      for (const synced of fetchResult.metrics) {
        const existingMetric = row.business!.metrics.find(
          (m) => m.key === synced.key
        );
        if (existingMetric) {
          await tx.businessMetric.update({
            where: { id: existingMetric.id },
            data: {
              value: synced.value,
              label: synced.label,
              source: synced.source as PrismaMetricSource,
              verificationId: ver.id,
              verifiedAt: now,
            },
          });
        } else {
          await tx.businessMetric.create({
            data: {
              businessId: row.business!.id,
              key: synced.key as PrismaMetricKey,
              label: synced.label,
              value: synced.value,
              unit: synced.unit as PrismaMetricUnit,
              currency: synced.currency
                ? (synced.currency as PrismaCurrencyCode)
                : null,
              source: synced.source as PrismaMetricSource,
              verificationId: ver.id,
              verifiedAt: now,
              isSampleData: row.business!.isSampleData,
            },
          });
        }
      }

      if (kind === "PAYMENT") {
        const series = parseFinancialSeriesFromJson(
          row.business!.financialSeriesJson
        );
        const profit = Number(
          row.business!.metrics.find((m) => m.key === "PROFIT")?.value ?? 0
        );
        const revMetric = fetchResult.metrics.find((m) => m.key === "REVENUE");
        await tx.business.update({
          where: { id: row.business!.id },
          data: {
            financialSeriesJson: updateSeriesSourceForPaymentVerification(
              series,
              revMetric?.value ?? null,
              profit,
              true
            ) as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Verification",
          entityId: ver.id,
          action: "CONNECTOR_SYNCED",
          previousState: { status: row.status },
          newState: { status: "VERIFIED", verifiedAt: nowIso },
        },
      });

      return ver;
    });

    const rec = mapPrismaVerificationRow(updated);
    return {
      ok: true,
      data: { record: rec, evaluated: evaluateVerification(rec, now) },
    };
  }

  // Local-dev branch
  const store = getLocalVerificationStore();
  const listings = getLocalListingsStoreForVerification();
  const idx = store.verifications.findIndex((v) => v.id === verificationId);
  if (idx === -1) {
    return {
      ok: false,
      code: "NOT_FOUND",
      reason: "Connector verification record not found.",
    };
  }
  const existing = store.verifications[idx]!;
  const biz = existing.businessId
    ? listings.find((b) => b.id === existing.businessId) ?? null
    : null;
  if (!biz) {
    return {
      ok: false,
      code: "NOT_FOUND",
      reason: "Linked listing not found.",
    };
  }
  if (!isStaff && existing.userId !== actor.userId && biz.sellerUserId !== actor.userId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the owning Seller or Admin can refresh this connector.",
    };
  }
  if (
    existing.type !== "PAYMENT_CONNECTOR" &&
    existing.type !== "ANALYTICS_CONNECTOR"
  ) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "Only payment or analytics connectors can be refreshed.",
    };
  }
  if (
    (existing.status === "REVOKED" || existing.status === "FAILED") &&
    !options.readOnlyToken
  ) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason:
        existing.status === "REVOKED"
          ? "Connector was revoked. Supply a new read-only token to reconnect."
          : "Connector failed verification. Supply a new read-only token to reconnect.",
    };
  }

  const kind =
    existing.type === "ANALYTICS_CONNECTOR" ? "ANALYTICS" : "PAYMENT";

  if (
    !options.readOnlyToken &&
    (existing.status === "EXPIRED" ||
      (existing.expiresAt &&
        new Date(existing.expiresAt).getTime() <= now.getTime()))
  ) {
    await reconcileExpiredVerifications(now);
    const updated = store.verifications[idx]!;
    return {
      ok: true,
      data: {
        record: updated,
        evaluated: evaluateVerification(updated, now),
      },
    };
  }

  const fetchResult = await fetchReadOnlyConnectorMetrics({
    provider: existing.provider as
      | PaymentConnectorProvider
      | AnalyticsConnectorProvider,
    accountIdentifier: existing.metadata.accountIdentifier ?? biz.slug,
    readOnlyToken: options.readOnlyToken,
    previousBehavior: existing.metadata.sandboxTokenBehavior ?? "valid",
    baselineMetrics: biz.metrics.map((m) => ({
      key: m.key,
      value: m.value,
      currency: m.currency,
    })),
    businessCurrency: biz.currency,
    syncCount: 1,
  });

  if (!fetchResult.ok) {
    const prevStatus = existing.status;
    const nextStatus: VerificationStatusValue =
      fetchResult.code === "TOKEN_EXPIRED" ? "EXPIRED" : "FAILED";
    const updated: FullVerificationRecord = {
      ...existing,
      status: nextStatus,
      failureReason: fetchResult.reason,
      expiresAt:
        fetchResult.code === "TOKEN_EXPIRED" ? nowIso : existing.expiresAt,
      metadata: {
        ...existing.metadata,
        lastSyncAttemptAt: nowIso,
        sandboxTokenBehavior: fetchResult.sandboxTokenBehavior,
      },
      updatedAt: nowIso,
    };
    store.verifications[idx] = updated;

    syncLocalBusinessWithConnector({
      business: biz,
      verification: updated,
      connectorKind: kind,
      auditAction: "CONNECTOR_SYNC_FAILED",
      actorId: actor.userId,
      actorLabel: actor.name,
      note: fetchResult.reason,
      nowIso,
    });

    store.auditLogs.unshift({
      id: `vaudit-${Date.now().toString(36)}`,
      actorId: actor.userId,
      entityId: updated.id,
      action: "CONNECTOR_SYNC_FAILED",
      previousStatus: prevStatus,
      newStatus: nextStatus,
      note: fetchResult.reason,
      createdAt: nowIso,
    });

    return {
      ok: true,
      data: {
        record: updated,
        evaluated: evaluateVerification(updated, now),
      },
    };
  }

  const interval = existing.metadata.syncIntervalMinutes ?? 60;
  const nextExpiryIso =
    existing.expiresAt && new Date(existing.expiresAt).getTime() > now.getTime()
      ? toIso(existing.expiresAt)
      : new Date(now.getTime() + 168 * 60 * 60 * 1000).toISOString();

  const updated: FullVerificationRecord = {
    ...existing,
    status: "VERIFIED",
    verifiedAt: nowIso,
    expiresAt: nextExpiryIso,
    failureReason: null,
    metadata: {
      ...existing.metadata,
      accountHint: fetchResult.accountHint,
      lastSyncAttemptAt: nowIso,
      nextSyncAt: new Date(now.getTime() + interval * 60 * 1000).toISOString(),
      adapterMode: fetchResult.adapterMode,
      sandboxTokenBehavior: "valid",
    },
    updatedAt: nowIso,
  };
  store.verifications[idx] = updated;

  syncLocalBusinessWithConnector({
    business: biz,
    verification: updated,
    connectorKind: kind,
    syncedMetrics: fetchResult.metrics,
    auditAction: "CONNECTOR_SYNCED",
    actorId: actor.userId,
    actorLabel: actor.name,
    note: `Refreshed ${existing.provider} read-only vitals.`,
    nowIso,
  });

  store.auditLogs.unshift({
    id: `vaudit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    entityId: updated.id,
    action: "CONNECTOR_SYNCED",
    previousStatus: existing.status,
    newStatus: "VERIFIED",
    note: `Refreshed ${existing.provider} read-only vitals.`,
    createdAt: nowIso,
  });

  return {
    ok: true,
    data: {
      record: updated,
      evaluated: evaluateVerification(updated, now),
    },
  };
}

export async function revokeConnectorVerification(
  verificationId: string,
  actor: AuthSession
): Promise<
  | { ok: true; data: VerificationWithEvaluation }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE"; reason: string }
> {
  const now = new Date();
  const nowIso = now.toISOString();
  const isStaff =
    actor.roles.includes("ADMIN") || actor.roles.includes("REVIEWER");

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const row = await prisma.verification.findUnique({
      where: { id: verificationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        business: {
          include: {
            sellerProfile: { select: { userId: true } },
            metrics: { where: { key: "PROFIT" }, select: { value: true } },
          },
        },
      },
    });
    if (!row || !row.business) {
      return { ok: false, code: "NOT_FOUND", reason: "Connector not found." };
    }
    if (
      !isStaff &&
      row.userId !== actor.userId &&
      row.business.sellerProfile.userId !== actor.userId
    ) {
      return {
        ok: false,
        code: "FORBIDDEN",
        reason: "Only the owning Seller or Admin can disconnect this account.",
      };
    }
    if (
      row.type !== PrismaVerificationType.PAYMENT_CONNECTOR &&
      row.type !== PrismaVerificationType.ANALYTICS_CONNECTOR
    ) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: "Only connector records can be disconnected.",
      };
    }

    const reason = "Disconnected by seller";
    const updated = await prisma.$transaction(async (tx) => {
      const ver = await tx.verification.update({
        where: { id: row.id },
        data: {
          status: PrismaVerificationStatus.REVOKED,
          failureReason: reason,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          business: {
            select: {
              id: true,
              teaserTitle: true,
              slug: true,
              isSampleData: true,
            },
          },
        },
      });

      await tx.businessMetric.updateMany({
        where: { verificationId: row.id },
        data: { verifiedAt: null },
      });

      if (row.type === PrismaVerificationType.PAYMENT_CONNECTOR && row.business) {
        const series = parseFinancialSeriesFromJson(
          row.business.financialSeriesJson
        );
        const profit = Number(row.business.metrics[0]?.value ?? 0);
        await tx.business.update({
          where: { id: row.business.id },
          data: {
            financialSeriesJson: updateSeriesSourceForPaymentVerification(
              series,
              null,
              profit,
              false
            ) as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Verification",
          entityId: row.id,
          action: "CONNECTOR_REVOKED",
          previousState: { status: row.status },
          newState: { status: "REVOKED" },
          metadataJson: { reason },
        },
      });

      return ver;
    });

    const rec = mapPrismaVerificationRow(updated);
    return {
      ok: true,
      data: { record: rec, evaluated: evaluateVerification(rec, now) },
    };
  }

  const store = getLocalVerificationStore();
  const listings = getLocalListingsStoreForVerification();
  const idx = store.verifications.findIndex((v) => v.id === verificationId);
  if (idx === -1) {
    return { ok: false, code: "NOT_FOUND", reason: "Connector not found." };
  }
  const existing = store.verifications[idx]!;
  const biz = existing.businessId
    ? listings.find((b) => b.id === existing.businessId) ?? null
    : null;
  if (!biz) {
    return { ok: false, code: "NOT_FOUND", reason: "Linked listing not found." };
  }
  if (!isStaff && existing.userId !== actor.userId && biz.sellerUserId !== actor.userId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      reason: "Only the owning Seller or Admin can disconnect this account.",
    };
  }

  const prevStatus = existing.status;
  const reason = "Disconnected by seller";
  const updated: FullVerificationRecord = {
    ...existing,
    status: "REVOKED",
    failureReason: reason,
    updatedAt: nowIso,
  };
  store.verifications[idx] = updated;

  const kind =
    existing.type === "ANALYTICS_CONNECTOR" ? "ANALYTICS" : "PAYMENT";
  syncLocalBusinessWithConnector({
    business: biz,
    verification: updated,
    connectorKind: kind,
    auditAction: "CONNECTOR_REVOKED",
    actorId: actor.userId,
    actorLabel: actor.name,
    note: reason,
    nowIso,
  });

  store.auditLogs.unshift({
    id: `vaudit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    entityId: updated.id,
    action: "CONNECTOR_REVOKED",
    previousStatus: prevStatus,
    newStatus: "REVOKED",
    note: reason,
    createdAt: nowIso,
  });

  return {
    ok: true,
    data: { record: updated, evaluated: evaluateVerification(updated, now) },
  };
}

export async function autoRefreshDueConnectors(params: {
  actor: AuthSession;
  businessId?: string;
  force?: boolean;
  now?: Date;
}): Promise<{
  expiredCount: number;
  refreshedCount: number;
  failedCount: number;
  updatedIds: string[];
}> {
  const now = params.now ?? new Date();
  const { expiredCount } = await reconcileExpiredVerifications(now);
  const isStaff =
    params.actor.roles.includes("ADMIN") ||
    params.actor.roles.includes("REVIEWER");

  let candidates: Array<{ id: string; nextSyncAt: string | null }> = [];

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.verification.findMany({
      where: {
        status: PrismaVerificationStatus.VERIFIED,
        type: {
          in: [
            PrismaVerificationType.PAYMENT_CONNECTOR,
            PrismaVerificationType.ANALYTICS_CONNECTOR,
          ],
        },
        ...(params.businessId ? { businessId: params.businessId } : {}),
        ...(isStaff
          ? {}
          : {
              OR: [
                { userId: params.actor.userId },
                { business: { sellerProfile: { userId: params.actor.userId } } },
              ],
            }),
      },
    });
    candidates = rows.map((r) => ({
      id: r.id,
      nextSyncAt: parseMetadata(r.metadataJson).nextSyncAt ?? null,
    }));
  } else {
    const store = getLocalVerificationStore();
    const listings = getLocalListingsStoreForVerification();
    candidates = store.verifications
      .filter((v) => {
        if (v.status !== "VERIFIED") return false;
        if (
          v.type !== "PAYMENT_CONNECTOR" &&
          v.type !== "ANALYTICS_CONNECTOR"
        ) {
          return false;
        }
        if (params.businessId && v.businessId !== params.businessId) {
          return false;
        }
        if (isStaff) return true;
        const biz = v.businessId
          ? listings.find((b) => b.id === v.businessId)
          : null;
        return v.userId === params.actor.userId || biz?.sellerUserId === params.actor.userId;
      })
      .map((v) => ({
        id: v.id,
        nextSyncAt: v.metadata.nextSyncAt ?? null,
      }));
  }

  let refreshedCount = 0;
  let failedCount = 0;
  const updatedIds: string[] = [];

  for (const item of candidates) {
    const due =
      params.force === true ||
      !item.nextSyncAt ||
      new Date(item.nextSyncAt).getTime() <= now.getTime();
    if (!due) continue;

    const res = await syncConnectorVerification(
      item.id,
      { now },
      params.actor
    );
    if (res.ok) {
      updatedIds.push(item.id);
      if (res.data.evaluated.isVerified) {
        refreshedCount += 1;
      } else {
        failedCount += 1;
      }
    }
  }

  return {
    expiredCount,
    refreshedCount,
    failedCount,
    updatedIds,
  };
}

export async function listVerificationsForAdminReview(
  _session: AuthSession,
  now: Date = new Date()
): Promise<VerificationWithEvaluation[]> {
  await reconcileExpiredVerifications(now);

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const rows = await prisma.verification.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        business: {
          select: {
            id: true,
            teaserTitle: true,
            slug: true,
            isSampleData: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    return rows
      .map((row) => {
        const rec = mapPrismaVerificationRow(row);
        return { record: rec, evaluated: evaluateVerification(rec, now) };
      })
      .sort((a, b) => {
        const aPending = a.record.status === "PENDING" ? 0 : 1;
        const bPending = b.record.status === "PENDING" ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return b.record.updatedAt.localeCompare(a.record.updatedAt);
      });
  }

  const store = getLocalVerificationStore();
  return [...store.verifications]
    .sort((a, b) => {
      const aPending = a.status === "PENDING" ? 0 : 1;
      const bPending = b.status === "PENDING" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .map((record) => ({
      record,
      evaluated: evaluateVerification(record, now),
    }));
}

export async function reviewVerificationAsAdmin(
  verificationId: string,
  decision: AdminVerificationDecision,
  reviewerNote: string,
  actor: AuthSession,
  now: Date = new Date()
): Promise<
  | { ok: true; data: VerificationWithEvaluation }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_TRANSITION" | "NOTE_REQUIRED";
      reason: string;
    }
> {
  const nowIso = now.toISOString();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const existing = await prisma.verification.findUnique({
      where: { id: verificationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        business: {
          include: {
            sellerProfile: { select: { userId: true } },
            metrics: true,
          },
        },
      },
    });
    if (!existing) {
      return {
        ok: false,
        code: "NOT_FOUND",
        reason: "Verification record not found.",
      };
    }

    const validation = validateVerificationReviewTransition({
      actorRoles: actor.roles,
      fromStatus: existing.status as VerificationStatusValue,
      decision,
      reviewerNote,
    });
    if (!validation.ok) {
      return validation;
    }

    const meta = parseMetadata(existing.metadataJson);
    const nextMeta: VerificationMetadata = {
      ...meta,
      reviewerNote: validation.reviewerNote,
      reviewedById: actor.userId,
      reviewedAt: nowIso,
    };

    const ttlDays =
      existing.type === PrismaVerificationType.IDENTITY
        ? 90
        : existing.type === PrismaVerificationType.PROOF_OF_FUNDS
          ? 30
          : 7;

    const nextVerifiedAt =
      validation.nextStatus === "VERIFIED" ? now : existing.verifiedAt;
    const nextExpiresAt =
      validation.nextStatus === "VERIFIED"
        ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)
        : validation.nextStatus === "EXPIRED"
          ? now
          : existing.expiresAt;
    const nextFailureReason =
      validation.nextStatus === "VERIFIED" ? null : validation.reviewerNote;

    const updated = await prisma.$transaction(async (tx) => {
      const ver = await tx.verification.update({
        where: { id: existing.id },
        data: {
          status: validation.nextStatus as PrismaVerificationStatus,
          verifiedAt: nextVerifiedAt,
          expiresAt: nextExpiresAt,
          failureReason: nextFailureReason,
          metadataJson: nextMeta as unknown as Prisma.InputJsonValue,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          business: {
            select: {
              id: true,
              teaserTitle: true,
              slug: true,
              isSampleData: true,
            },
          },
        },
      });

      if (existing.type === PrismaVerificationType.IDENTITY && existing.userId) {
        if (meta.roleContext === "SELLER") {
          await tx.sellerProfile.upsert({
            where: { userId: existing.userId },
            update: {
              identityStatus: validation.nextStatus as PrismaVerificationStatus,
            },
            create: {
              userId: existing.userId,
              identityStatus: validation.nextStatus as PrismaVerificationStatus,
            },
          });
        } else {
          await tx.buyerProfile.upsert({
            where: { userId: existing.userId },
            update: {
              identityStatus: validation.nextStatus as PrismaVerificationStatus,
            },
            create: {
              userId: existing.userId,
              identityStatus: validation.nextStatus as PrismaVerificationStatus,
            },
          });
        }
      } else if (
        existing.type === PrismaVerificationType.PROOF_OF_FUNDS &&
        existing.userId
      ) {
        await tx.buyerProfile.upsert({
          where: { userId: existing.userId },
          update: {
            proofOfFundsStatus:
              validation.nextStatus as PrismaVerificationStatus,
          },
          create: {
            userId: existing.userId,
            proofOfFundsStatus:
              validation.nextStatus as PrismaVerificationStatus,
          },
        });
      } else if (
        (existing.type === PrismaVerificationType.PAYMENT_CONNECTOR ||
          existing.type === PrismaVerificationType.ANALYTICS_CONNECTOR) &&
        existing.business
      ) {
        const isActive = validation.nextStatus === "VERIFIED";
        await tx.businessMetric.updateMany({
          where: { verificationId: existing.id },
          data: { verifiedAt: isActive ? now : null },
        });

        if (existing.type === PrismaVerificationType.PAYMENT_CONNECTOR) {
          const series = parseFinancialSeriesFromJson(
            existing.business.financialSeriesJson
          );
          const profit = Number(
            existing.business.metrics.find((m) => m.key === "PROFIT")?.value ?? 0
          );
          await tx.business.update({
            where: { id: existing.business.id },
            data: {
              financialSeriesJson: updateSeriesSourceForPaymentVerification(
                series,
                null,
                profit,
                isActive
              ) as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }

      const recipientUserId =
        existing.userId ?? existing.business?.sellerProfile.userId ?? null;
      if (recipientUserId) {
        await tx.notification.create({
          data: {
            userId: recipientUserId,
            type: "VERIFICATION_REVIEWED",
            title: `${existing.provider} verification: ${validation.nextStatus}`,
            body: validation.reviewerNote,
            actionUrl: "/verify",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entityType: "Verification",
          entityId: existing.id,
          action: validation.auditAction,
          previousState: { status: existing.status },
          newState: { status: validation.nextStatus },
          metadataJson: { reviewerNote: validation.reviewerNote },
        },
      });

      return ver;
    });

    const record = mapPrismaVerificationRow(updated);
    return {
      ok: true,
      data: { record, evaluated: evaluateVerification(record, now) },
    };
  }

  // Local-dev branch
  const store = getLocalVerificationStore();
  const idx = store.verifications.findIndex((v) => v.id === verificationId);
  if (idx === -1) {
    return {
      ok: false,
      code: "NOT_FOUND",
      reason: "Verification record not found.",
    };
  }
  const existing = store.verifications[idx]!;
  const validation = validateVerificationReviewTransition({
    actorRoles: actor.roles,
    fromStatus: existing.status,
    decision,
    reviewerNote,
  });
  if (!validation.ok) {
    return validation;
  }

  const ttlDays =
    existing.type === "IDENTITY"
      ? 90
      : existing.type === "PROOF_OF_FUNDS"
        ? 30
        : 7;

  const updated: FullVerificationRecord = {
    ...existing,
    status: validation.nextStatus,
    verifiedAt:
      validation.nextStatus === "VERIFIED" ? nowIso : existing.verifiedAt,
    expiresAt:
      validation.nextStatus === "VERIFIED"
        ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
        : validation.nextStatus === "EXPIRED"
          ? nowIso
          : existing.expiresAt,
    failureReason:
      validation.nextStatus === "VERIFIED" ? null : validation.reviewerNote,
    metadata: {
      ...existing.metadata,
      reviewerNote: validation.reviewerNote,
      reviewedById: actor.userId,
      reviewedAt: nowIso,
    },
    updatedAt: nowIso,
  };
  store.verifications[idx] = updated;

  if (
    updated.businessId &&
    (updated.type === "PAYMENT_CONNECTOR" ||
      updated.type === "ANALYTICS_CONNECTOR")
  ) {
    const listings = getLocalListingsStoreForVerification();
    const biz = listings.find((b) => b.id === updated.businessId);
    if (biz) {
      const kind =
        updated.type === "ANALYTICS_CONNECTOR" ? "ANALYTICS" : "PAYMENT";
      syncLocalBusinessWithConnector({
        business: biz,
        verification: updated,
        connectorKind: kind,
        auditAction: validation.auditAction,
        actorId: actor.userId,
        actorLabel: actor.name,
        note: validation.reviewerNote,
        nowIso,
      });
    }
  }

  store.auditLogs.unshift({
    id: `vaudit-${Date.now().toString(36)}`,
    actorId: actor.userId,
    entityId: updated.id,
    action: validation.auditAction,
    previousStatus: existing.status,
    newStatus: validation.nextStatus,
    note: validation.reviewerNote,
    createdAt: nowIso,
  });

  return {
    ok: true,
    data: { record: updated, evaluated: evaluateVerification(updated, now) },
  };
}
