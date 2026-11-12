import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { isAuthorizedAdmin } from "@/lib/auth/permissions";
import { markListingPaidAction } from "@/lib/admin/store";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!isAuthorizedAdmin(session)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  let body: { businessId?: string; action?: "MARK_PAID" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "MARK_PAID" && body.businessId) {
    const res = await markListingPaidAction(body.businessId, session!);
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: "Invalid billing action" }, { status: 400 });
}
