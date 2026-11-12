import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MatchesClient } from "@/components/matching/matches-client";
import { canManageBuyerThesis } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session-server";
import {
  listNotificationsForUser,
  listThesesWithMatchesForBuyer,
  type ThesisWithMatches,
} from "@/lib/matching/store";
import type { ThesisNotificationRecord } from "@/lib/domain/matching";

export const dynamic = "force-dynamic";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ thesisId?: string }>;
}) {
  const params = await searchParams;
  const session = await getServerSession();
  const perm = canManageBuyerThesis(session);

  let initialTheses: ThesisWithMatches[] = [];
  let initialNotifications: ThesisNotificationRecord[] = [];

  if (perm.allowed && session) {
    [initialTheses, initialNotifications] = await Promise.all([
      listThesesWithMatchesForBuyer(session),
      listNotificationsForUser(session),
    ]);
  }

  return (
    <AppShell
      activeNav="matches"
      trustBanner={{
        canTrustAnswer:
          "Every match lists both Why this matches and What doesn't fit, and separates third-party verified metrics from Seller-reported numbers.",
        nextStepAnswer:
          "Select up to 3 matched businesses to compare side by side, or inspect any listing's vitals, risks, and Q&A.",
      }}
    >
      <MatchesClient
        key={`${session?.userId ?? "anon"}-${params.thesisId ?? "first"}`}
        session={session}
        initialTheses={initialTheses}
        initialNotifications={initialNotifications}
        initialSelectedThesisId={
          typeof params.thesisId === "string" ? params.thesisId : undefined
        }
      />
    </AppShell>
  );
}
