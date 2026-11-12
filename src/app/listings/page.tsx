import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ListingsDirectoryClient } from "@/components/listings/listings-directory-client";
import { listApprovedListings } from "@/lib/listings/store";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const listings = await listApprovedListings();

  return (
    <AppShell
      activeNav="listings"
      trustBanner={{
        canTrustAnswer:
          "Only Admin-approved listings appear here. Verified metrics carry active third-party records; unverified numbers are labelled Seller-reported.",
        nextStepAnswer:
          "Inspect any listing's vitals strip, disclosed risks, and Q&A, or sign in as a Seller to submit your own business.",
      }}
    >
      <ListingsDirectoryClient initialListings={listings} />
    </AppShell>
  );
}
