import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { syncConnectorVerification } from "@/lib/verification/store";
import { syncConnectorSchema } from "@/lib/verification/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to refresh connector metrics.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(`verify:sync:${session.userId}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many sync requests. Wait before refreshing again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let body: unknown = {};
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
  }

  const parsed = syncConnectorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid sync parameters." },
      { status: 400 }
    );
  }

  const result = await syncConnectorVerification(
    id,
    { readOnlyToken: parsed.data.readOnlyToken },
    session
  );

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
