import { NextResponse } from "next/server";
import { canCreateListing } from "@/lib/auth/permissions";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getServerSession } from "@/lib/auth/session-server";
import { detectConfidentialLeak } from "@/lib/domain/valuation";
import {
  createSellerListing,
  listApprovedListings,
  listListingsForSeller,
} from "@/lib/listings/store";
import { upsertListingSchema } from "@/lib/listings/validation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");

  if (scope === "mine") {
    const session = await getServerSession();
    const perm = canCreateListing(session);
    if (!perm.allowed) {
      return NextResponse.json(
        { error: perm.reason, code: perm.code },
        { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    const listings = await listListingsForSeller(session!);
    return NextResponse.json({ listings }, { status: 200 });
  }

  const sector = url.searchParams.get("sector") ?? undefined;
  const query = url.searchParams.get("q") ?? undefined;
  const verifiedOnly = url.searchParams.get("verifiedOnly") === "true";

  const listings = await listApprovedListings({ sector, query, verifiedOnly });
  return NextResponse.json({ listings }, { status: 200 });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  const perm = canCreateListing(session);
  if (!perm.allowed) {
    return NextResponse.json(
      { error: perm.reason, code: perm.code },
      { status: perm.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  const rateLimit = await checkRateLimit(`listings:create:${session!.userId}`, 15, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many listing submissions. Please wait before trying again.",
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
        error: parsed.error.issues[0]?.message ?? "Check required listing fields.",
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

  const listing = await createSellerListing(data, session!);
  return NextResponse.json({ listing }, { status: 201 });
}
