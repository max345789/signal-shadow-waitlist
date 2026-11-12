import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import { isAuthorizedAdmin } from "@/lib/auth/permissions";
import { toggleUserSuspension, updateUserRoles } from "@/lib/admin/store";
import type { RoleName } from "@/lib/auth/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!isAuthorizedAdmin(session)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const { id } = await context.params;
  let body: { action?: "SUSPEND" | "REACTIVATE" | "SET_ROLES"; roles?: RoleName[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "SUSPEND") {
    const res = await toggleUserSuspension(id, true, session!);
    return NextResponse.json(res);
  }

  if (body.action === "REACTIVATE") {
    const res = await toggleUserSuspension(id, false, session!);
    return NextResponse.json(res);
  }

  if (body.action === "SET_ROLES" && Array.isArray(body.roles)) {
    const res = await updateUserRoles(id, body.roles, session!);
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: "Invalid user action" }, { status: 400 });
}
