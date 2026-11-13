import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import {
  createListingReport,
  listReportsForAdmin,
  updateReportStatusAsAdmin,
  type ReportReason,
  type ReportStatus,
  type ReportActionTaken,
} from "@/lib/reports/store";

export async function GET(request: Request) {
  const session = await getServerSession();
  const isStaff = session?.roles.includes("ADMIN") || session?.roles.includes("REVIEWER");
  if (!isStaff) {
    return NextResponse.json(
      { error: "Staff permissions required.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const statusFilter = statusParam ? (statusParam as ReportStatus) : undefined;
  const reports = await listReportsForAdmin(statusFilter);
  return NextResponse.json({ reports }, { status: 200 });
}

export async function POST(request: Request) {
  const session = await getServerSession();

  let body: {
    listingId?: string;
    listingTitle?: string;
    listingSlug?: string;
    reason?: ReportReason;
    details?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  if (!body.listingId || !body.reason || !body.details) {
    return NextResponse.json(
      { error: "Listing ID, reason, and details are required.", code: "MISSING_FIELDS" },
      { status: 400 }
    );
  }

  const validReasons: ReportReason[] = ["fake_figures", "ip_breach", "impersonation", "scam", "duplicate", "other"];
  if (!validReasons.includes(body.reason)) {
    return NextResponse.json(
      { error: "Invalid report reason.", code: "INVALID_REASON" },
      { status: 400 }
    );
  }

  const report = await createListingReport({
    listingId: body.listingId,
    listingTitle: body.listingTitle,
    listingSlug: body.listingSlug,
    reporterId: session?.userId || null,
    reporterEmail: session?.email || null,
    reason: body.reason,
    details: body.details,
  });

  return NextResponse.json({ ok: true, report }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  const isStaff = session?.roles.includes("ADMIN") || session?.roles.includes("REVIEWER");
  if (!isStaff) {
    return NextResponse.json(
      { error: "Staff permissions required.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  let body: {
    reportId?: string;
    status?: ReportStatus;
    actionTaken?: ReportActionTaken;
    adminNote?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  if (!body.reportId || !body.status) {
    return NextResponse.json(
      { error: "Report ID and target status are required.", code: "MISSING_FIELDS" },
      { status: 400 }
    );
  }

  const updated = await updateReportStatusAsAdmin({
    reportId: body.reportId,
    status: body.status,
    actionTaken: body.actionTaken,
    adminNote: body.adminNote,
  });

  if (!updated) {
    return NextResponse.json({ error: "Report not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, report: updated }, { status: 200 });
}
