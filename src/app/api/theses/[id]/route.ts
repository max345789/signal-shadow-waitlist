import { NextResponse } from "next/server";
import { canManageBuyerThesis } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import {
  deleteThesisForBuyer,
  getThesisWithMatchesForViewer,
  updateThesisForBuyer,
} from "@/lib/matching/store";
import { patchThesisSchema } from "@/lib/matching/validation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  const perm = canManageBuyerThesis(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const result = await getThesisWithMatchesForViewer(id, session!);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, code: result.code },
      { status: result.code === "NOT_FOUND" ? 404 : 403 }
    );
  }

  return NextResponse.json(result.data, { status: 200 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  const perm = canManageBuyerThesis(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const rateLimit = await checkRateLimit(`theses:update:${session!.userId}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many thesis updates. Wait before trying again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = patchThesisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid thesis update fields.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const result = await updateThesisForBuyer(id, parsed.data, session!);
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
          ? 403
          : 400;
    return NextResponse.json({ error: result.reason, code: result.code }, { status });
  }

  return NextResponse.json(result.data, { status: 200 });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  const perm = canManageBuyerThesis(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const result = await deleteThesisForBuyer(id, session!);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, code: result.code },
      { status: result.code === "NOT_FOUND" ? 404 : 403 }
    );
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
