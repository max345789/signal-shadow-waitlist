import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ListingDetailClient } from "@/components/listings/listing-detail-client";
import { Button } from "@/components/ui/button";
import { CardStateEmpty } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth/session-server";
import { listDealRoomsForUser } from "@/lib/deal-rooms/store";
import { getListingBySlugForViewer } from "@/lib/listings/store";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getServerSession();
  const listing = await getListingBySlugForViewer(slug, session);
  const referenceNow = new Date().toISOString();

  if (!listing) {
    return (
      <AppShell
        activeNav="listings"
        trustBanner={{
          canTrustAnswer:
            "Unapproved drafts and flagged listings are hidden from public view until Admin review passes.",
          nextStepAnswer:
            "Return to approved marketplace listings or sign in with the owning Seller or Reviewer account.",
        }}
      >
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Listing not available
          </h1>
          <CardStateEmpty
            title="Listing could not be found or is awaiting review"
            description="Only Admin-approved listings are visible publicly. Drafts and pending submissions remain private to the seller and platform reviewers."
          />
          <div>
            <Button asChild variant="action">
              <Link href="/listings">Browse approved listings</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const hasTwoFactorVerified = Boolean(
    session?.twoFactorEnabled && session?.twoFactorVerifiedAt
  );
  const canOpenDealRoom = Boolean(
    session &&
      (session.roles.includes("BUYER") || session.roles.includes("ADMIN")) &&
      !listing.canEdit
  );
  let existingDealRoomId: string | null = null;
  if (session && hasTwoFactorVerified) {
    const roomsRes = await listDealRoomsForUser(session);
    if (roomsRes.ok) {
      const match = roomsRes.data.find((r) => r.businessId === listing.id);
      existingDealRoomId = match?.id ?? null;
    }
  }

  return (
    <AppShell
      activeNav="listings"
      trustBanner={{
        canTrustAnswer: `${listing.trustSummary.verifiedCount} verified, ${listing.trustSummary.sellerReportedCount} seller-reported${
          listing.trustSummary.expiredOrFailedCount > 0
            ? `, and ${listing.trustSummary.expiredOrFailedCount} expired/failed`
            : ""
        } metrics. Sensitive identity fields stay redacted until NDA signature.`,
        nextStepAnswer:
          "Review verified vs seller-reported vitals, read disclosed risks, ask questions in Q&A, or open a 2FA-protected deal room.",
      }}
    >
      <ListingDetailClient
        initialListing={listing}
        referenceNow={referenceNow}
        isAuthenticated={Boolean(session)}
        canOpenDealRoom={canOpenDealRoom}
        hasTwoFactorVerified={hasTwoFactorVerified}
        existingDealRoomId={existingDealRoomId}
      />
    </AppShell>
  );
}
