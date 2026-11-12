import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { connectBusinessAccount } from "@/lib/verification/store";
import { connectAccountSchema } from "@/lib/verification/validation";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in with a Seller account to connect data sources.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(`verify:connect:${session.userId}`, 15, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many connector attempts. Wait before trying again.",
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

  const parsed = connectAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check account connection fields.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const result = await connectBusinessAccount(parsed.data, session);
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
          ? 403
          : 422;
    return NextResponse.json(
      {
        error: result.reason,
        code: result.code,
        verification: result.data ?? null,
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      verification: result.data,
      syncedMetrics: result.syncedMetrics,
    },
    { status: 201 }
  );
}
