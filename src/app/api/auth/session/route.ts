import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { canEnterDealRoom } from "@/lib/auth/permissions";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { authenticated: false, session: null, canEnterDealRoomSample: false },
      { status: 200 }
    );
  }

  const dealRoomGate = canEnterDealRoom(session, {
    buyerUserId: session.userId,
    sellerUserId: session.userId,
  });

  return NextResponse.json(
    {
      authenticated: true,
      session,
      dealRoomTwoFactorSatisfied: dealRoomGate.allowed,
    },
    { status: 200 }
  );
}
