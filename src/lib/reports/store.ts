import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";

export type ReportReason =
  | "fake_figures"
  | "ip_breach"
  | "impersonation"
  | "scam"
  | "duplicate"
  | "other";

export type ReportStatus = "NEW" | "IN_REVIEW" | "ACTION_TAKEN" | "NO_ACTION";
export type ReportActionTaken = "REQUEST_EDITS" | "HIDE" | "REMOVE" | "SUSPEND_ACCOUNT" | "NONE";

export interface ReportRecord {
  id: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  reporterId: string | null;
  reporterEmail: string | null;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  actionTaken: ReportActionTaken | null;
  adminNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

// In-memory reports store
const memoryReports: ReportRecord[] = [
  {
    id: "rep-sample-01",
    listingId: "sample-biz-edtech-02",
    listingTitle: "Regional K-12 Live Tutoring (Sample)",
    listingSlug: "sample-biz-edtech-02",
    reporterId: "sample-buyer-01",
    reporterEmail: "buyer.sample@trustmarketplace.local",
    reason: "fake_figures",
    details: "Discrepancy noted between student counts mentioned in Q&A vs narrative.",
    status: "NEW",
    actionTaken: null,
    adminNote: null,
    resolvedAt: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];

export async function createListingReport(params: {
  listingId: string;
  listingTitle?: string;
  listingSlug?: string;
  reporterId?: string | null;
  reporterEmail?: string | null;
  reason: ReportReason;
  details: string;
}): Promise<ReportRecord> {
  const now = new Date().toISOString();
  const id = `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const newReport: ReportRecord = {
    id,
    listingId: params.listingId,
    listingTitle: params.listingTitle || "Listing",
    listingSlug: params.listingSlug || params.listingId,
    reporterId: params.reporterId || null,
    reporterEmail: params.reporterEmail || null,
    reason: params.reason,
    details: params.details.trim(),
    status: "NEW",
    actionTaken: null,
    adminNote: null,
    resolvedAt: null,
    createdAt: now,
  };

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.report.create({
        data: {
          id,
          listingId: params.listingId,
          reporterId: params.reporterId || null,
          reporterEmail: params.reporterEmail || null,
          reason: params.reason,
          details: params.details.trim(),
          status: "NEW",
        },
      });
    } catch {
      // fallback to memory
    }
  }

  memoryReports.unshift(newReport);
  return newReport;
}

export async function listReportsForAdmin(filterStatus?: ReportStatus): Promise<ReportRecord[]> {
  if (filterStatus) {
    return memoryReports.filter((r) => r.status === filterStatus);
  }
  return memoryReports;
}

export async function updateReportStatusAsAdmin(params: {
  reportId: string;
  status: ReportStatus;
  actionTaken?: ReportActionTaken;
  adminNote?: string;
}): Promise<ReportRecord | null> {
  const target = memoryReports.find((r) => r.id === params.reportId);
  if (!target) return null;

  target.status = params.status;
  if (params.actionTaken) target.actionTaken = params.actionTaken;
  if (params.adminNote !== undefined) target.adminNote = params.adminNote;
  if (params.status === "ACTION_TAKEN" || params.status === "NO_ACTION") {
    target.resolvedAt = new Date().toISOString();
  }

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.report.update({
        where: { id: params.reportId },
        data: {
          status: params.status,
          actionTaken: params.actionTaken || null,
          adminNote: params.adminNote || null,
          resolvedAt: target.resolvedAt ? new Date(target.resolvedAt) : null,
        },
      });
    } catch {
      // ignore
    }
  }

  return target;
}
