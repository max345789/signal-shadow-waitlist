import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { AdminReviewClient } from "@/components/admin/admin-review-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { canReviewAdminQueue } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session-server";
import { listDisputedDealRoomsForAdmin } from "@/lib/deal-rooms/store";
import { listListingsForAdminReview } from "@/lib/listings/store";
import { listVerificationsForAdminReview } from "@/lib/verification/store";

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  const session = await getServerSession();
  const perm = canReviewAdminQueue(session);

  if (!perm.allowed) {
    return (
      <AppShell
        activeNav="admin"
        trustBanner={{
          canTrustAnswer:
            "Confidential business names, domains, and review actions are restricted to Admin and Reviewer accounts.",
          nextStepAnswer:
            "Sign in with an authorized Reviewer or Admin account to inspect pending submissions.",
        }}
      >
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Admin review queue
          </h1>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Reviewer authorization required</CardTitle>
              <CardDescription>{perm.reason}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-16 text-ink">
                {session
                  ? `Signed in as ${session.name} (${session.roles.join(", ")}). Only Admin or Reviewer accounts can inspect confidential submissions.`
                  : "Sign in with an Admin or Reviewer account to review pending business listings."}
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild variant="primary">
                <Link href="/auth/signin">Sign in as Reviewer</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </AppShell>
    );
  }

  const [listings, verifications, disputesRes] = await Promise.all([
    listListingsForAdminReview(session!),
    listVerificationsForAdminReview(session!),
    listDisputedDealRoomsForAdmin(session!),
  ]);

  const disputes = disputesRes.ok ? disputesRes.data : [];

  return (
    <AppShell
      activeNav="admin"
      trustBanner={{
        canTrustAnswer:
          "You are viewing confidential identity fields, verification records, and escrow disputes under Reviewer access. Every action appends to the AuditLog.",
        nextStepAnswer:
          "Inspect pending submissions, KYC/POF/Connector verifications, or flagged escrow disputes, enter a reviewer note, and record your decision.",
      }}
    >
      <AdminReviewClient
        initialListings={listings}
        initialVerifications={verifications}
        initialDisputes={disputes}
      />
    </AppShell>
  );
}
