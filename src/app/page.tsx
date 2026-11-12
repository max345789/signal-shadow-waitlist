import React from "react";
import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardStateEmpty,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { HomeThesisForm } from "@/components/home/home-thesis-form";
import { ListingCard } from "@/components/listings/listing-card";
import { getServerSession } from "@/lib/auth/session-server";
import { canEnterDealRoom } from "@/lib/auth/permissions";
import { listApprovedListings } from "@/lib/listings/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession();
  const dealRoomGate = canEnterDealRoom(session, {
    buyerUserId: session?.userId ?? "none",
    sellerUserId: "none",
  });
  const approvedListings = await listApprovedListings();

  return (
    <AppShell
      activeNav="home"
      trustBanner={{
        canTrustAnswer:
          "Phase 1 Listings & Vitals active. Every verified metric displays its source and verification timestamp; demo listings are labelled Sample data.",
        nextStepAnswer:
          "Browse approved listings, create a seller listing with guided valuation, or sign in with 2FA.",
      }}
    >
      <div className="flex flex-col gap-8">
        {/* Section 5: Home — single prompt 'What do you want to buy?' */}
        <section aria-labelledby="home-hero-heading">
          <Card className="p-6 sm:p-8">
            <div className="flex max-w-[760px] flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone="neutral" label="Phase 1: Listings & Vitals" />
                <StatusChip
                  tone={dealRoomGate.allowed ? "verified" : "neutral"}
                  label={
                    dealRoomGate.allowed
                      ? "2FA verified for deal rooms"
                      : "2FA required for deal rooms"
                  }
                />
              </div>

              <div className="flex flex-col gap-2">
                <h1
                  id="home-hero-heading"
                  className="font-serif text-28 font-semibold text-deep-navy sm:text-40"
                >
                  What do you want to buy?
                </h1>
                <p className="text-16 text-slate">
                  Describe the business you are looking for — sector, profit range,
                  owner hours, and budget. Every verified metric shows its source and
                  last verified time.
                </p>
              </div>

              <HomeThesisForm />

              <div className="flex flex-wrap gap-4 border-t border-mist pt-4">
                <Button asChild variant="action">
                  <Link href="/listings">
                    <span>Browse approved listings</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/sell">List a business for sale</Link>
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* Saved-thesis feed (Phase 2) + Approved Listings Preview (Phase 1) */}
        <section aria-labelledby="saved-thesis-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="saved-thesis-heading"
                className="font-serif text-28 font-semibold text-deep-navy"
              >
                Saved-thesis feed &amp; approved listings
              </h2>
              <p className="text-16 text-slate">
                Thesis matching alerts launch in Phase 2. Explore approved listings below
                showing verified vs seller-reported vitals.
              </p>
            </div>
            <Button asChild variant="link">
              <Link href="/listings">View all listings ({approvedListings.length})</Link>
            </Button>
          </div>

          <CardStateEmpty
            title="No saved acquisition theses yet"
            description="Saved theses and ranked matches launch in Phase 2. Below are currently approved marketplace listings (sample records labelled Sample data)."
          />

          {approvedListings.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {approvedListings.slice(0, 4).map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : null}
        </section>

        {/* Foundation & Account quick cards */}
        <section
          aria-label="Platform verification and design system"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <Card>
            <CardHeader>
              <CardTitle>Design System &amp; Style Guide</CardTitle>
              <CardDescription>
                Verify Section 4 solid colors, WCAG AA contrast checks, 8px spacing,
                tabular figures, and UI components.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-16 text-ink">
                <ShieldCheck className="h-4 w-4 text-verified-green" aria-hidden="true" />
                <span>Includes interactive loading, empty, and error states.</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button asChild variant="action">
                <Link href="/style-guide">Open Style Guide</Link>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Authentication &amp; Deal Room 2FA Gate</CardTitle>
              <CardDescription>
                {session
                  ? `Signed in as ${session.name} (${session.roles.join(", ")}).`
                  : "Sign in and complete 6-digit TOTP 2FA verification required for deal-room entry."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-16 text-ink">
                <Lock className="h-4 w-4 text-trust-blue" aria-hidden="true" />
                <span>
                  {dealRoomGate.allowed
                    ? "Deal room 2FA gate satisfied."
                    : dealRoomGate.reason}
                </span>
              </div>
            </CardContent>
            <CardFooter>
              <Button asChild variant="secondary">
                <Link href="/auth/signin">
                  {session ? "Manage session & 2FA" : "Sign in & verify 2FA"}
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
