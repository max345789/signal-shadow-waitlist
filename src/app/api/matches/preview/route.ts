import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { previewMatchesForDraftThesis } from "@/lib/matching/store";
import { previewThesisSchema } from "@/lib/matching/validation";

export async function POST(request: Request) {
  const session = await getServerSession();
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "local";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "local";
  const rateKey = session
    ? `matches:preview:${session.userId}`
    : `matches:preview:ip:${clientIp}`;

  const rateLimit = await checkRateLimit(rateKey, 40, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many match preview requests. Wait briefly and try again.",
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

  const parsed = previewThesisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter at least one thesis criterion to preview matches.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const matches = await previewMatchesForDraftThesis({
    ...parsed.data,
    title: parsed.data.title || "Draft acquisition thesis",
  });

  return NextResponse.json(
    {
      matches,
      evaluatedCount: matches.length,
    },
    { status: 200 }
  );
}
