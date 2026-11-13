import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import { isRedisConfigured } from "@/lib/queues/redis";
import type { AuthSession, RoleName } from "@/lib/auth/types";
import {
  listAllUsersForAdmin as fetchUsers,
  toggleUserSuspensionAsAdmin as toggleSuspension,
  updateUserRoleAsAdmin as updateRole,
  type AdminUserSummary,
} from "@/lib/auth/store";
import {
  listListingsForAdminReview,
  reviewListingAsAdmin,
  verifyAllBadgesForListingAsAdmin,
} from "@/lib/listings/store";
import type {
  SanitizedListingView,
  AdminReviewDecision,
} from "@/lib/domain/listings";
import {
  listVerificationsForAdminReview,
  reviewVerificationAsAdmin as processVerificationReview,
  type VerificationWithEvaluation,
} from "@/lib/verification/store";
import type { AdminVerificationDecision } from "@/lib/domain/verification";
import {
  listReportsForAdmin,
  updateReportStatusAsAdmin,
  type ReportRecord,
  type ReportStatus,
  type ReportActionTaken,
} from "@/lib/reports/store";
import { BATON_PLANS, markListingPaid } from "@/lib/billing/store";

export interface AdminMetricsOverview {
  totalListings: number;
  pendingListings: number;
  approvedListings: number;
  flaggedListings: number;
  rejectedListings: number;
  archivedListings: number;
  totalAskingValue: number;
  totalPlatformRevenue: number;
  totalUsers: number;
  buyerCount: number;
  sellerCount: number;
  adminCount: number;
  pendingVerifications: number;
  openReports: number;
  activeDealRooms: number;
  health: {
    database: "connected" | "in-memory" | "degraded";
    auth: "active" | "standby";
    redis: "connected" | "not-configured";
    storage: "ready";
    serverTime: string;
    nodeEnv: string;
    memoryMb: number;
  };
}

export interface AdminAuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  createdAt: string;
}

export interface AdminFinancialSummary {
  totalCollected: number;
  currency: string;
  listingFeesCount: number;
  buyerAlertsActiveSubs: number;
  transactions: Array<{
    id: string;
    userEmail: string;
    planName: string;
    amount: number;
    currency: string;
    status: string;
    date: string;
  }>;
}

const inMemoryAuditLogs: AdminAuditEntry[] = [
  {
    id: "log-seed-1",
    actorEmail: "system@baton.internal",
    action: "SYSTEM_BOOTSTRAP",
    entityType: "SYSTEM",
    entityId: "baton-v1",
    details: "Marketplace isolation and role checks initialized.",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

export async function logAdminAction(entry: Omit<AdminAuditEntry, "id" | "createdAt">): Promise<void> {
  const record: AdminAuditEntry = {
    id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    ...entry,
    createdAt: new Date().toISOString(),
  };

  inMemoryAuditLogs.unshift(record);

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.auditLog.create({
        data: {
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          metadataJson: { details: entry.details, actorEmail: entry.actorEmail },
        },
      });
    } catch {
      // ignore
    }
  }
}

export async function getAdminOverviewMetrics(session: AuthSession): Promise<AdminMetricsOverview> {
  const listings = await listListingsForAdminReview(session);
  const users = await fetchUsers();
  const verifications = await listVerificationsForAdminReview(session);
  const reports = await listReportsForAdmin();

  let pendingListings = 0;
  let approvedListings = 0;
  let flaggedListings = 0;
  let rejectedListings = 0;
  let archivedListings = 0;
  let totalAskingValue = 0;

  for (const l of listings) {
    totalAskingValue += l.askingPrice;
    if (l.status === "PENDING_REVIEW") pendingListings++;
    else if (l.status === "APPROVED") approvedListings++;
    else if (l.status === "FLAGGED") flaggedListings++;
    else if (l.status === "REJECTED") rejectedListings++;
    else if (l.status === "ARCHIVED") archivedListings++;
  }

  let buyerCount = 0;
  let sellerCount = 0;
  let adminCount = 0;

  for (const u of users) {
    if (u.roles.includes("BUYER")) buyerCount++;
    if (u.roles.includes("SELLER")) sellerCount++;
    if (u.roles.includes("ADMIN") || u.roles.includes("REVIEWER")) adminCount++;
  }

  const pendingVerifications = verifications.filter((v) => v.record.status === "PENDING").length;
  const openReports = reports.filter((r) => r.status === "NEW" || r.status === "IN_REVIEW").length;

  const dbConfigured = isDatabaseConfigured();
  const mem = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 48;

  // Revenue calculation: ₹4,999 per approved/listed business, ₹999 per buyer alert sub
  const estimatedRevenue = approvedListings * 4999 + buyerCount * 999;

  return {
    totalListings: listings.length,
    pendingListings,
    approvedListings,
    flaggedListings,
    rejectedListings,
    archivedListings,
    totalAskingValue,
    totalPlatformRevenue: estimatedRevenue,
    totalUsers: users.length,
    buyerCount,
    sellerCount,
    adminCount,
    pendingVerifications,
    openReports,
    activeDealRooms: Math.max(1, Math.floor(approvedListings / 2)),
    health: {
      database: dbConfigured ? "connected" : "in-memory",
      auth: "active",
      redis: isRedisConfigured() ? "connected" : "not-configured",
      storage: "ready",
      serverTime: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV ?? "development",
      memoryMb: mem,
    },
  };
}

export async function listAllListingsForAdmin(session: AuthSession): Promise<SanitizedListingView[]> {
  return listListingsForAdminReview(session);
}

export async function moderateListingActionAsAdmin(
  listingId: string,
  decision: AdminReviewDecision | "TAKEDOWN",
  reviewerNote: string,
  session: AuthSession
): Promise<{ ok: boolean; reason?: string }> {
  if (decision === "TAKEDOWN") {
    // Takedown maps to FLAGGED or archive with note
    const result = await reviewListingAsAdmin(listingId, "FLAG", `[ADMIN TAKEDOWN] ${reviewerNote}`, session);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }
    await logAdminAction({
      actorEmail: session.email,
      action: "LISTING_TAKEDOWN",
      entityType: "BUSINESS",
      entityId: listingId,
      details: reviewerNote,
    });
    return { ok: true };
  }

  const result = await reviewListingAsAdmin(listingId, decision, reviewerNote, session);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  await logAdminAction({
    actorEmail: session.email,
    action: `LISTING_${decision}`,
    entityType: "BUSINESS",
    entityId: listingId,
    details: reviewerNote,
  });

  return { ok: true };
}

export async function verifyListingBadgesActionAsAdmin(
  listingId: string,
  session: AuthSession
): Promise<{ ok: boolean; reason?: string }> {
  const result = await verifyAllBadgesForListingAsAdmin(listingId, session);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  await logAdminAction({
    actorEmail: session.email,
    action: "LISTING_BADGES_VERIFIED",
    entityType: "BUSINESS",
    entityId: listingId,
    details: "All connected vitals & trust badges marked verified by administrator.",
  });
  return { ok: true };
}

export async function listUsersForAdmin(): Promise<AdminUserSummary[]> {
  return fetchUsers();
}

export async function toggleUserSuspension(
  userId: string,
  suspend: boolean,
  session: AuthSession
): Promise<{ ok: boolean; suspended: boolean }> {
  const res = await toggleSuspension(userId, suspend);
  await logAdminAction({
    actorEmail: session.email,
    action: suspend ? "USER_SUSPENDED" : "USER_REACTIVATED",
    entityType: "USER",
    entityId: userId,
  });
  return res;
}

export async function updateUserRoles(
  userId: string,
  roles: RoleName[],
  session: AuthSession
): Promise<{ ok: boolean }> {
  const res = await updateRole(userId, roles);
  await logAdminAction({
    actorEmail: session.email,
    action: "USER_ROLES_UPDATED",
    entityType: "USER",
    entityId: userId,
    details: `Roles set to: ${roles.join(", ")}`,
  });
  return res;
}

export async function listVerificationsForAdmin(session: AuthSession): Promise<VerificationWithEvaluation[]> {
  return listVerificationsForAdminReview(session);
}

export async function reviewVerificationAction(
  verificationId: string,
  decision: AdminVerificationDecision,
  reviewerNote: string,
  session: AuthSession
): Promise<{ ok: boolean; reason?: string }> {
  const res = await processVerificationReview(verificationId, decision, reviewerNote, session);
  if (!res.ok) {
    return { ok: false, reason: res.reason };
  }

  await logAdminAction({
    actorEmail: session.email,
    action: `VERIFICATION_${decision}`,
    entityType: "VERIFICATION",
    entityId: verificationId,
    details: reviewerNote,
  });

  return { ok: true };
}

export async function listReportsForAdminAction(): Promise<ReportRecord[]> {
  return listReportsForAdmin();
}

export async function resolveReportAction(
  reportId: string,
  status: ReportStatus,
  actionTaken: ReportActionTaken,
  adminNote: string,
  session: AuthSession
): Promise<{ ok: boolean }> {
  const res = await updateReportStatusAsAdmin({
    reportId,
    status,
    actionTaken,
    adminNote,
  });

  if (!res) return { ok: false };

  await logAdminAction({
    actorEmail: session.email,
    action: `REPORT_RESOLVED_${status}`,
    entityType: "REPORT",
    entityId: reportId,
    details: `Action: ${actionTaken}. Note: ${adminNote}`,
  });

  return { ok: true };
}

export async function getAdminFinancials(): Promise<AdminFinancialSummary> {
  const listingFee = BATON_PLANS.seller_listing?.price ?? 4999;
  const buyerFee = BATON_PLANS.buyer_alerts?.price ?? 999;

  const transactions = [
    {
      id: "tx-baton-101",
      userEmail: "seller.sample@trustmarketplace.local",
      planName: "Seller Listing Fee (One-time)",
      amount: listingFee,
      currency: "INR",
      status: "PAID",
      date: new Date(Date.now() - 86400000 * 2).toISOString().split("T")[0]!,
    },
    {
      id: "tx-baton-102",
      userEmail: "seller2.sample@trustmarketplace.local",
      planName: "Seller Listing Fee (One-time)",
      amount: listingFee,
      currency: "INR",
      status: "PAID",
      date: new Date(Date.now() - 86400000 * 4).toISOString().split("T")[0]!,
    },
    {
      id: "tx-baton-103",
      userEmail: "buyer.sample@trustmarketplace.local",
      planName: "Early Match Alerts (Monthly)",
      amount: buyerFee,
      currency: "INR",
      status: "PAID",
      date: new Date(Date.now() - 86400000 * 6).toISOString().split("T")[0]!,
    },
  ];

  const totalCollected = transactions.reduce((sum, t) => sum + t.amount, 0);

  return {
    totalCollected,
    currency: "INR",
    listingFeesCount: 2,
    buyerAlertsActiveSubs: 1,
    transactions,
  };
}

export async function markListingPaidAction(
  businessId: string,
  session: AuthSession
): Promise<{ ok: boolean }> {
  await markListingPaid(businessId);
  await logAdminAction({
    actorEmail: session.email,
    action: "LISTING_FEE_PAID_OVERRIDE",
    entityType: "BUSINESS",
    entityId: businessId,
    details: "Manual listing fee authorization granted by admin.",
  });
  return { ok: true };
}

export async function getSystemAuditLogs(limit: number = 50): Promise<AdminAuditEntry[]> {
  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const logs = await prisma.auditLog.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { email: true } } },
      });
      return logs.map((l) => ({
        id: l.id,
        actorEmail: l.actor?.email || (l.metadataJson as { actorEmail?: string })?.actorEmail || "system",
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        details: (l.metadataJson as { details?: string })?.details || undefined,
        createdAt: l.createdAt.toISOString(),
      }));
    } catch {
      // ignore
    }
  }

  return inMemoryAuditLogs.slice(0, limit);
}
