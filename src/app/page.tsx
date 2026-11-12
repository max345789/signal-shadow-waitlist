import React from "react";
import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
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
import { MetricTile } from "@/components/domain/metric-tile";
import { HomeThesisForm } from "@/components/home/home-thesis-form";
import { getServerSession } from "@/lib/auth/session-server";
import { canEnterDealRoom } from "@/lib/auth/permissions";

export default async function HomePage() {
  const session = await getServerSession();
  const dealRoomGate = canEnterDealRoom(session, {
    buyerUserId: session?.userId ?? "none",
    sellerUserId: "none",
  });

  const referenceNow = "2026-11-12T10:00:00.000Z";

  return (
    <AppShell
      activeNav="home"
      trustBanner={{
        canTrustAnswer:
          "Phase 0 Foundation active. No live listings are published yet; any example figures below are marked Sample data.",
        nextStepAnswer:
          "Inspect the Section 4 Style Guide or verify your account with mandatory 2FA before Phase 1 listings launch.",
      }}
    >
      <div className="flex flex-col gap-8">
        {/* Section 5: Home — single prompt 'What do you want to buy?' */}
        <section aria-labelledby="home-hero-heading">
          <Card className="p-6 sm:p-8">
            <div className="flex max-w-[720px] flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone="neutral" label="Phase 0: Foundation" />
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
            </div>
          </Card>
        </section>

        {/* Saved-thesis feed preview (Phase 0 empty state + Sample data vitals contrast) */}
        <section aria-labelledby="saved-thesis-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="saved-thesis-heading"
                className="font-serif text-28 font-semibold text-deep-navy"
              >
                Saved-thesis feed preview
              </h2>
              <p className="text-16 text-slate">
                Illustrative preview showing how verified and seller-reported vitals are
                kept visually distinct.
              </p>
            </div>
            <StatusChip tone="neutral" label="Sample data" />
          </div>

          <CardStateEmpty
            title="No saved acquisition theses yet"
            description="Saved theses and ranked matches launch in Phase 2. Below is a Sample data preview demonstrating verified versus seller-reported vitals."
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetricTile
              label="Annual Recurring Revenue (Sample)"
              value={12_500_000}
              unit="CURRENCY"
              currency="INR"
              compactCurrency
              sourceLabel="Stripe"
              isSampleData
              referenceNow={referenceNow}
              verification={{
                id: "sample-ver-stripe-01",
                provider: "Stripe (Sample)",
                status: "VERIFIED",
                verifiedAt: "2026-11-12T08:00:00.000Z",
                expiresAt: "2026-11-19T08:00:00.000Z",
              }}
            />
            <MetricTile
              label="Owner Discretionary Profit (Sample)"
              value={4_250_000}
              unit="CURRENCY"
              currency="INR"
              compactCurrency
              sourceLabel="Seller-reported"
              isSampleData
              referenceNow={referenceNow}
              verification={null}
            />
          </div>
        </section>

        {/* Phase 0 Foundation verification cards */}
        <section
          aria-label="Phase 0 components and security"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <Card>
            <CardHeader>
              <CardTitle>Design System &amp; Style Guide</CardTitle>
              <CardDescription>
                Verify Section 4 solid colors, WCAG AA contrast checks, 8px spacing,
                tabular figures, and all Phase 0 components.
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
