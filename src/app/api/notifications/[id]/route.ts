import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { markNotificationRead } from "@/lib/matching/store";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to update notifications." },
      { status: 401 }
    );
  }

  const result = await markNotificationRead(id, session);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, code: result.code },
      { status: result.code === "NOT_FOUND" ? 404 : 403 }
    );
  }

  return NextResponse.json({ notification: result.notification }, { status: 200 });
}
