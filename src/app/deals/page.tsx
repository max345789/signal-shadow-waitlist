import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DealRoomsIndexClient } from "@/components/deal-rooms/deal-rooms-index-client";
import { getServerSession } from "@/lib/auth/session-server";
import { listDealRoomsForUser } from "@/lib/deal-rooms/store";

export const dynamic = "force-dynamic";

export default async function DealRoomsPage() {
  const session = await getServerSession();
  const res = await listDealRoomsForUser(session);

  let gateStatus: "ready" | "unauthenticated" | "two-factor-required" = "ready";
  let gateMessage: string | undefined;

  if (!res.ok) {
    gateStatus =
      res.code === "UNAUTHENTICATED" ? "unauthenticated" : "two-factor-required";
    gateMessage = res.reason;
  }

  return (
    <AppShell
      activeNav="deals"
      trustBanner={{
        canTrustAnswer:
          "Deal rooms require fresh 2FA verification, enforce participant-only RBAC on every API request, and log every state change immutably.",
        nextStepAnswer:
          gateStatus === "ready"
            ? "Enter a deal room to review stage progression, sign NDA, exchange watermarked files, and manage offers."
            : "Sign in and complete your 6-digit TOTP check to unlock deal rooms.",
      }}
    >
      <DealRoomsIndexClient
        initialRooms={res.ok ? res.data : []}
        gateStatus={gateStatus}
        gateMessage={gateMessage}
      />
    </AppShell>
  );
}
