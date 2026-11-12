import { NextResponse } from "next/server";
import { canReviewAdminQueue } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session-server";
import { listVerificationsForAdminReview } from "@/lib/verification/store";

export async function GET() {
  const session = await getServerSession();
  const perm = canReviewAdminQueue(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const verifications = await listVerificationsForAdminReview(session!);
  return NextResponse.json({ verifications }, { status: 200 });
}
