import React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DealRoomClient } from "@/components/deal-rooms/deal-room-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getServerSession } from "@/lib/auth/session-server";
import { getDealRoomForViewer } from "@/lib/deal-rooms/store";

export const dynamic = "force-dynamic";

export default async function DealRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  const res = await getDealRoomForViewer(id, session);

  if (!res.ok) {
    return (
      <AppShell
        activeNav="deals"
        trustBanner={{
          canTrustAnswer:
            "Deal rooms strictly enforce participant RBAC and fresh 2FA verification on every read and write.",
          nextStepAnswer:
            res.code === "UNAUTHENTICATED" ||
            res.code === "TWO_FACTOR_REQUIRED" ||
            res.code === "TWO_FACTOR_EXPIRED"
              ? "Sign in and complete your 6-digit TOTP verification to enter this deal room."
              : "Return to your authorized deal rooms or browse approved listings.",
        }}
      >
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Deal room access restricted
          </h1>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-trust-blue" aria-hidden="true" />
                <CardTitle as="h2">
                  {res.code === "NOT_FOUND"
                    ? "Deal room not found"
                    : res.code === "FORBIDDEN"
                      ? "Participant access required"
                      : "Mandatory 2FA verification required"}
                </CardTitle>
              </div>
              <CardDescription>{res.reason}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="primary">
                <Link href="/auth/signin">Sign in &amp; verify 2FA</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/deals">Back to deal rooms</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </AppShell>
    );
  }

  const room = res.data;

  return (
    <AppShell
      activeNav="deals"
      trustBanner={{
        canTrustAnswer: `${
          room.sensitiveDetailsUnlocked
            ? "NDA executed — confidential details unlocked."
            : "Confidential entity name, domain, and customers stay redacted until both parties sign the NDA."
        } Every stage transition, message, document view, and offer writes an immutable AuditLog entry.`,
        nextStepAnswer: `Current stage: ${room.stages.find((s) => s.status === "ACTIVE")?.requiredAction ?? "Review stage tracker and next action below."}`,
      }}
    >
      <DealRoomClient initialDealRoom={room} />
    </AppShell>
  );
}
