import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { submitIdentityVerification } from "@/lib/verification/store";
import { submitIdentityVerificationSchema } from "@/lib/verification/validation";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to submit identity verification.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(`verify:identity:${session.userId}`, 10, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many identity verification submissions. Wait before retrying.",
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

  const parsed = submitIdentityVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check identity verification fields.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const result = await submitIdentityVerification(parsed.data, session);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, code: result.code },
      { status: 403 }
    );
  }

  return NextResponse.json({ verification: result.data }, { status: 201 });
}
