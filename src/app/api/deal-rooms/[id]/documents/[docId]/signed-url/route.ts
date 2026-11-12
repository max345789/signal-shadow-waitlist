import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { dealRoomFailureResponse } from "@/lib/deal-rooms/http";
import { createSignedDocumentDownloadUrl } from "@/lib/deal-rooms/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await context.params;
  const session = await getServerSession();
  const result = await createSignedDocumentDownloadUrl(id, docId, session);
  if (!result.ok) {
    return dealRoomFailureResponse(result);
  }
  return NextResponse.json(result.data, { status: 200 });
}
