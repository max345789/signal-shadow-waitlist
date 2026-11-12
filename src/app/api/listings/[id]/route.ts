import { NextResponse } from "next/server";
import { canCreateListing } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { detectConfidentialLeak } from "@/lib/domain/valuation";
import {
  getListingByIdForViewer,
  updateSellerListing,
} from "@/lib/listings/store";
import { upsertListingSchema } from "@/lib/listings/validation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  const listing = await getListingByIdForViewer(id, session);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  return NextResponse.json({ listing }, { status: 200 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession();
  const perm = canCreateListing(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const rateLimit = await checkRateLimit(`listings:update:${session!.userId}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many listing updates. Wait briefly before trying again.",
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

  const parsed = upsertListingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid listing fields.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const leaks = detectConfidentialLeak(
    {
      teaserTitle: data.teaserTitle,
      teaserSummary: data.teaserSummary,
      financialNarrative: data.financialNarrative,
      risksSummary: data.risksSummary,
      founderStory: data.founderStory,
    },
    {
      redactedName: data.redactedName,
      redactedDomain: data.redactedDomain,
    }
  );

  if (data.submitForReview && leaks.length > 0) {
    const first = leaks[0]!;
    return NextResponse.json(
      {
        error: `Confidential name or domain ("${first.matchedTerm}") appeared in public field "${first.field}". Remove identifying text before submitting for review.`,
        leaks,
      },
      { status: 400 }
    );
  }

  const result = await updateSellerListing(id, data, session!);
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: result.reason, code: result.code }, { status });
  }

  return NextResponse.json({ listing: result.listing }, { status: 200 });
}
