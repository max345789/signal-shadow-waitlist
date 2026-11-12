import { NextResponse } from "next/server";
import { canReviewAdminQueue } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { listDisputedDealRoomsForAdmin } from "@/lib/deal-rooms/store";

export async function GET() {
  const session = await getServerSession();
  const perm = canReviewAdminQueue(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const result = await listDisputedDealRoomsForAdmin(session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }

  return NextResponse.json({ disputes: result.data }, { status: 200 });
}
