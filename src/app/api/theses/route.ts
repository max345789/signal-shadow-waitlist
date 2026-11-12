import { NextResponse } from "next/server";
import { canManageBuyerThesis } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import {
  createThesisForBuyer,
  listThesesWithMatchesForBuyer,
} from "@/lib/matching/store";
import { upsertThesisSchema } from "@/lib/matching/validation";

export async function GET() {
  const session = await getServerSession();
  const perm = canManageBuyerThesis(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const theses = await listThesesWithMatchesForBuyer(session!);
  return NextResponse.json({ theses }, { status: 200 });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  const perm = canManageBuyerThesis(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const rateLimit = await checkRateLimit(`theses:create:${session!.userId}`, 25, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many thesis creations. Wait before creating another thesis.",
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

  const parsed = upsertThesisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Check required thesis criteria.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const result = await createThesisForBuyer(parsed.data, session!);
  return NextResponse.json(result, { status: 201 });
}
