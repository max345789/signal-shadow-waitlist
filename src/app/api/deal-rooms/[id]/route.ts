import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { getDealRoomForViewer } from "@/lib/deal-rooms/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  const result = await getDealRoomForViewer(id, session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }
  return NextResponse.json({ dealRoom: result.data }, { status: 200 });
}
