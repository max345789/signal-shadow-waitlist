import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ThesisBuilderClient } from "@/components/matching/thesis-builder-client";
import { getServerSession } from "@/lib/auth/session-server";
import { getThesisWithMatchesForViewer } from "@/lib/matching/store";

export const dynamic = "force-dynamic";

export default async function ThesisBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; thesisId?: string }>;
}) {
  const params = await searchParams;
  const session = await getServerSession();
  const initialPrompt =
    typeof params.prompt === "string" && params.prompt.trim().length > 0
      ? params.prompt.trim()
      : undefined;

  let editingThesis = null;
  if (typeof params.thesisId === "string" && params.thesisId.trim() && session) {
    const res = await getThesisWithMatchesForViewer(params.thesisId.trim(), session);
    if (res.ok) {
      editingThesis = res.data.thesis;
    }
  }

  return (
    <AppShell
      activeNav="thesis"
      trustBanner={{
        canTrustAnswer:
          "Weighted match scoring evaluates hard bounds and free-text fit, and always displays mismatches alongside matching reasons.",
        nextStepAnswer:
          "Preview ranked matches immediately, or sign in as a Buyer to save your thesis and receive alerts on new listings.",
      }}
    >
      <ThesisBuilderClient
        key={`${initialPrompt ?? ""}-${params.thesisId ?? ""}`}
        session={session}
        initialPrompt={initialPrompt}
        editingThesis={editingThesis}
      />
    </AppShell>
  );
}
