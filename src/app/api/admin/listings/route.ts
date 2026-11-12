import { NextResponse } from "next/server";
import { canReviewAdminQueue } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session-server";
import type { ListingStatusValue } from "@/lib/domain/listings";
import { listListingsForAdminReview } from "@/lib/listings/store";

export async function GET(request: Request) {
  const session = await getServerSession();
  const perm = canReviewAdminQueue(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  let statuses: ListingStatusValue[] | undefined;

  if (statusParam === "PENDING_REVIEW") {
    statuses = ["PENDING_REVIEW"];
  } else if (statusParam === "APPROVED") {
    statuses = ["APPROVED"];
  } else if (statusParam === "FLAGGED_OR_REJECTED") {
    statuses = ["FLAGGED", "REJECTED"];
  }

  const listings = await listListingsForAdminReview(session!, statuses);
  return NextResponse.json({ listings }, { status: 200 });
}
