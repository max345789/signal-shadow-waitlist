import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SellerOnboardingClient } from "@/components/seller/seller-onboarding-client";
import { Button } from "@/components/ui/button";
import { CardStateError } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth/session-server";
import { getListingByIdForViewer } from "@/lib/listings/store";

export const dynamic = "force-dynamic";

export default async function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ listingId?: string }>;
}) {
  const params = await searchParams;
  const session = await getServerSession();

  let editingListing = null;
  let editError: string | null = null;

  if (params.listingId) {
    const found = await getListingByIdForViewer(params.listingId, session);
    if (!found) {
      editError = "That listing could not be found or you do not have permission to edit it.";
    } else if (!found.canEdit) {
      editError = "Only the owning seller can edit this listing.";
    } else {
      editingListing = found;
    }
  }

  return (
    <AppShell
      activeNav="sell"
      trustBanner={{
        canTrustAnswer:
          "Confidential name, domain, and customer lists are automatically checked against public fields and redacted until an NDA is signed.",
        nextStepAnswer:
          "Complete guided valuation, verify your auto-built listing narrative, and submit for Admin review.",
      }}
    >
      {editError ? (
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Cannot open listing editor
          </h1>
          <CardStateError title="Access or listing unavailable" message={editError} />
          <div>
            <Button asChild variant="secondary">
              <Link href="/seller">Back to Seller dashboard</Link>
            </Button>
          </div>
        </div>
      ) : (
        <SellerOnboardingClient session={session} editingListing={editingListing} />
      )}
    </AppShell>
  );
}
