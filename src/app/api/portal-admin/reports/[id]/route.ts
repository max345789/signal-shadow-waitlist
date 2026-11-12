import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { isAuthorizedAdmin } from "@/lib/auth/permissions";
import { resolveReportAction } from "@/lib/admin/store";
import type { ReportActionTaken, ReportStatus } from "@/lib/reports/store";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!isAuthorizedAdmin(session)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const { id } = await context.params;
  let body: {
    status?: ReportStatus;
    actionTaken?: ReportActionTaken;
    adminNote?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.status) {
    return NextResponse.json({ error: "Report status is required." }, { status: 400 });
  }

  const res = await resolveReportAction(
    id,
    body.status,
    body.actionTaken || "NONE",
    body.adminNote || "",
    session!
  );

  return NextResponse.json(res);
}
