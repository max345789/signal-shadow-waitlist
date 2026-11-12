import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SellerDashboardClient } from "@/components/seller/seller-dashboard-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { canCreateListing } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session-server";
import { listListingsForSeller } from "@/lib/listings/store";

export const dynamic = "force-dynamic";

export default async function SellerDashboardPage() {
  const session = await getServerSession();
  const perm = canCreateListing(session);

  if (!perm.allowed) {
    return (
      <AppShell
        activeNav="seller"
        trustBanner={{
          canTrustAnswer:
            "Seller dashboard records are strictly protected by server-side role checks.",
          nextStepAnswer:
            "Sign in with a Seller account to view your drafts, review feedback, and published listings.",
        }}
      >
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Seller dashboard
          </h1>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Seller sign-in required</CardTitle>
              <CardDescription>{perm.reason}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-16 text-ink">
                {session
                  ? `You are currently signed in as ${session.name} (${session.roles.join(", ")}). Switch to a Seller account to manage listings.`
                  : "Sign in to access your private listing drafts, confidential redaction fields, and review notes."}
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild variant="primary">
                <Link href="/auth/signin">Sign in as Seller</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </AppShell>
    );
  }

  const listings = await listListingsForSeller(session!);

  return (
    <AppShell
      activeNav="seller"
      trustBanner={{
        canTrustAnswer:
          "Only your own business listings and Admin reviewer notes appear here. Confidential fields remain hidden from public buyers.",
        nextStepAnswer:
          "Submit saved drafts for Admin review or address reviewer notes on flagged listings.",
      }}
    >
      <SellerDashboardClient initialListings={listings} />
    </AppShell>
  );
}
