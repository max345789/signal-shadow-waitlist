import {
  evaluateVerification,
  type FullVerificationRecord,
  type VerificationTypeValue,
} from "@/lib/domain/verification";
import { createSampleSeedListings } from "@/lib/listings/sample-data";

export interface LocalVerificationAuditEntry {
  id: string;
  actorId: string | null;
  entityId: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  note: string | null;
  createdAt: string;
}

export interface LocalVerificationStoreState {
  verifications: FullVerificationRecord[];
  auditLogs: LocalVerificationAuditEntry[];
}

const globalForVerificationStore = globalThis as unknown as {
  __trustMarketplaceLocalVerifications?: LocalVerificationStoreState;
};

function createInitialVerificationStoreState(
  nowMs: number = Date.now()
): LocalVerificationStoreState {
  const sampleListings = createSampleSeedListings(nowMs);
  const byId = new Map<string, FullVerificationRecord>();

  for (const biz of sampleListings) {
    for (const metric of biz.metrics) {
      if (!metric.verification) continue;
      if (byId.has(metric.verification.id)) continue;

      const isAnalytics =
        metric.source === "GA4" || metric.source === "PLAUSIBLE";
      const type: VerificationTypeValue = isAnalytics
        ? "ANALYTICS_CONNECTOR"
        : "PAYMENT_CONNECTOR";

      const verifiedAtIso =
        typeof metric.verification.verifiedAt === "string"
          ? metric.verification.verifiedAt
          : metric.verification.verifiedAt?.toISOString() ?? null;
      const expiresAtIso =
        typeof metric.verification.expiresAt === "string"
          ? metric.verification.expiresAt
          : metric.verification.expiresAt?.toISOString() ?? null;

      byId.set(metric.verification.id, {
        id: metric.verification.id,
        userId: biz.sellerUserId,
        userName: biz.sellerDisplayLabel,
        userEmail:
          biz.sellerUserId === "sample-seller-01"
            ? "seller.sample@trustmarketplace.local"
            : "seller2.sample@trustmarketplace.local",
        businessId: biz.id,
        businessTitle: biz.teaserTitle,
        businessSlug: biz.slug,
        type,
        provider: metric.verification.provider,
        status: metric.verification.status,
        verifiedAt: verifiedAtIso,
        expiresAt: expiresAtIso,
        failureReason: metric.verification.failureReason ?? null,
        metadata: {
          connectorKind: isAnalytics ? "ANALYTICS" : "PAYMENT",
          accountIdentifier: `sample-${metric.source.toLowerCase()}-${biz.id.slice(-2)}`,
          accountHint: `${metric.verification.provider} sample****01`,
          readOnlyScope: true,
          syncIntervalMinutes: 60,
          lastSyncAttemptAt: verifiedAtIso ?? biz.updatedAt,
          nextSyncAt: new Date(nowMs + 60 * 60 * 1000).toISOString(),
          adapterMode: "sandbox",
          sandboxTokenBehavior: "valid",
          syncedMetricKeys: isAnalytics ? ["TRAFFIC"] : ["REVENUE", "CUSTOMERS"],
        },
        isSampleData: true,
        createdAt: biz.createdAt,
        updatedAt: verifiedAtIso ?? biz.updatedAt,
      });
    }
  }

  return {
    verifications: Array.from(byId.values()),
    auditLogs: [],
  };
}

export function getLocalVerificationStore(): LocalVerificationStoreState {
  if (!globalForVerificationStore.__trustMarketplaceLocalVerifications) {
    globalForVerificationStore.__trustMarketplaceLocalVerifications =
      createInitialVerificationStoreState();
  }
  return globalForVerificationStore.__trustMarketplaceLocalVerifications;
}

export function resetLocalVerificationsStoreForTest(): void {
  globalForVerificationStore.__trustMarketplaceLocalVerifications =
    createInitialVerificationStoreState();
}

export function hasActiveLocalUserVerification(
  userId: string,
  type: "IDENTITY" | "PROOF_OF_FUNDS",
  now: Date = new Date()
): boolean {
  const store = getLocalVerificationStore();
  const latest = store.verifications
    .filter((v) => v.userId === userId && v.type === type)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!latest) return false;
  return evaluateVerification(latest, now).isVerified;
}
