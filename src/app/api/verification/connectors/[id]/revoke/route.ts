import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { revokeConnectorVerification } from "@/lib/verification/store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to disconnect an account.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(`verify:revoke:${session.userId}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many disconnect requests. Wait before retrying.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  const result = await revokeConnectorVerification(id, session);
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
          ? 403
          : 400;
    return NextResponse.json(
      { error: result.reason, code: result.code },
      { status }
    );
  }

  return NextResponse.json({ verification: result.data }, { status: 200 });
}
