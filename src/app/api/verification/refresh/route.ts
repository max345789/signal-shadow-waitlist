import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { autoRefreshDueConnectors } from "@/lib/verification/store";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to refresh verification connectors.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const rateLimit = await checkRateLimit(`verify:refresh:${session.userId}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many refresh triggers. Wait before trying again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let businessId: string | undefined;
  let force = false;
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      const parsed = JSON.parse(text) as { businessId?: unknown; force?: unknown };
      if (typeof parsed.businessId === "string" && parsed.businessId.trim()) {
        businessId = parsed.businessId.trim();
      }
      if (typeof parsed.force === "boolean") {
        force = parsed.force;
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
  }

  const summary = await autoRefreshDueConnectors({
    actor: session,
    businessId,
    force,
  });

  return NextResponse.json(summary, { status: 200 });
}
