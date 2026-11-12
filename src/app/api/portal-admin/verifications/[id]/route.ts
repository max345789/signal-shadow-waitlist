import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { isAuthorizedAdmin } from "@/lib/auth/permissions";
import { reviewVerificationAction } from "@/lib/admin/store";
import type { AdminVerificationDecision } from "@/lib/domain/verification";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!isAuthorizedAdmin(session)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const { id } = await context.params;
  let body: {
    decision?: AdminVerificationDecision;
    reviewerNote?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.decision || !body.reviewerNote) {
    return NextResponse.json(
      { error: "Decision and reviewer note are required." },
      { status: 400 }
    );
  }

  const res = await reviewVerificationAction(
    id,
    body.decision,
    body.reviewerNote,
    session!
  );

  if (!res.ok) {
    return NextResponse.json({ error: res.reason || "Action failed" }, { status: 400 });
  }

  return NextResponse.json(res);
}
