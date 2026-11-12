import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CompareClient } from "@/components/matching/compare-client";
import { canManageBuyerThesis } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session-server";
import { listApprovedListings } from "@/lib/listings/store";
import {
  getListingsForCompare,
  listSavedThesesForBuyer,
} from "@/lib/matching/store";
import { parseCompareBusinessIds } from "@/lib/matching/validation";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; thesisId?: string }>;
}) {
  const params = await searchParams;
  const session = await getServerSession();
  const rawIds = typeof params.ids === "string" ? params.ids : null;
  const thesisId = typeof params.thesisId === "string" ? params.thesisId : null;

  const parsedIds = parseCompareBusinessIds(rawIds);
  const perm = canManageBuyerThesis(session);
  const savedTheses =
    perm.allowed && session ? await listSavedThesesForBuyer(session) : [];

  if (!parsedIds.ok) {
    const availableListings = await listApprovedListings();
    return (
      <AppShell
        activeNav="compare"
        trustBanner={{
          canTrustAnswer:
            "Side-by-side comparison keeps verified connectors distinct from Seller-reported metrics and leaves identities redacted until NDA.",
          nextStepAnswer:
            "Select up to 3 businesses to compare vitals, risks, and thesis mismatches cleanly.",
        }}
      >
        <CompareClient
          key={`err-${rawIds ?? ""}-${thesisId ?? ""}`}
          initialListings={[]}
          availableListings={availableListings}
          initialThesis={null}
          initialEvaluationsByBusinessId={{}}
          savedTheses={savedTheses}
          initialTooManyError={parsedIds.error}
        />
      </AppShell>
    );
  }

  const compareResult = await getListingsForCompare({
    ids: parsedIds.ids,
    thesisId,
    session,
  });

  if (!compareResult.ok) {
    const availableListings = await listApprovedListings();
    return (
      <AppShell activeNav="compare">
        <CompareClient
          initialListings={[]}
          availableListings={availableListings}
          initialThesis={null}
          initialEvaluationsByBusinessId={{}}
          savedTheses={savedTheses}
          initialTooManyError={compareResult.reason}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      activeNav="compare"
      trustBanner={{
        canTrustAnswer:
          "Side-by-side comparison keeps verified connectors distinct from Seller-reported metrics and leaves identities redacted until NDA.",
        nextStepAnswer:
          "Compare up to 3 businesses across financials, workload, and risks, then open a listing to ask diligence Q&A.",
      }}
    >
      <CompareClient
        key={`${rawIds ?? ""}-${thesisId ?? ""}`}
        initialListings={compareResult.listings}
        availableListings={compareResult.availableListings}
        initialThesis={compareResult.thesis}
        initialEvaluationsByBusinessId={compareResult.evaluationsByBusinessId}
        savedTheses={savedTheses}
        initialExcludedCount={compareResult.excludedCount}
      />
    </AppShell>
  );
}
