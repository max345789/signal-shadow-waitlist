import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { VerificationCentreClient } from "@/components/verification/verification-centre-client";
import { getServerSession } from "@/lib/auth/session-server";
import { getVerificationCentreState } from "@/lib/verification/store";

export const dynamic = "force-dynamic";

export default async function VerificationCentrePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; businessId?: string }>;
}) {
  const [session, params] = await Promise.all([
    getServerSession(),
    searchParams,
  ]);

  const initialState = session
    ? await getVerificationCentreState(session)
    : null;

  const initialTab =
    params.tab === "connectors"
      ? "connectors"
      : params.tab === "identity"
        ? "identity"
        : undefined;

  const isSandboxMode =
    process.env.NODE_ENV !== "production" ||
    process.env.AUTH_PROVIDER === "local-dev" ||
    process.env.ENABLE_LIVE_CONNECTORS !== "true";

  return (
    <AppShell
      activeNav="verify"
      trustBanner={{
        canTrustAnswer:
          "Verified marks render exclusively from active, non-expired third-party verification records with visible provider and last-verified timestamps.",
        nextStepAnswer:
          "Buyers complete Identity KYC and Proof of Funds for Data access; Sellers connect read-only Stripe/Razorpay and GA4/Plausible accounts.",
      }}
    >
      <VerificationCentreClient
        session={session}
        initialState={initialState}
        initialTab={initialTab}
        initialBusinessId={params.businessId}
        isSandboxMode={isSandboxMode}
      />
    </AppShell>
  );
}
