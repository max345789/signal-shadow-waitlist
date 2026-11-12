import { NextResponse } from "next/server";
import { canReviewAdminQueue } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { reviewListingAsAdmin } from "@/lib/listings/store";
import { adminReviewSchema } from "@/lib/listings/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  const perm = canReviewAdminQueue(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const rateLimit = await checkRateLimit(`admin:review:${session!.userId}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many review actions. Wait before submitting another review.",
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

  const parsed = adminReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Decision and reviewer note are required.",
      },
      { status: 400 }
    );
  }

  const result = await reviewListingAsAdmin(
    id,
    parsed.data.decision,
    parsed.data.reviewerNote,
    session!
  );

  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
          ? 403
          : 400;
    return NextResponse.json({ error: result.reason, code: result.code }, { status });
  }

  return NextResponse.json({ listing: result.listing }, { status: 200 });
}
