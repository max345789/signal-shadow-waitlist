import React from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AdminReviewClient } from "@/components/admin/admin-review-client";
import { canReviewAdminQueue } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session-server";
import { listDisputedDealRoomsForAdmin } from "@/lib/deal-rooms/store";
import { listListingsForAdminReview } from "@/lib/listings/store";
import { listVerificationsForAdminReview } from "@/lib/verification/store";
import { listReportsForAdmin } from "@/lib/reports/store";

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  const session = await getServerSession();
  const perm = canReviewAdminQueue(session);

  if (!perm.allowed) {
    notFound();
  }

  const [listings, verifications, disputesRes, reports] = await Promise.all([
    listListingsForAdminReview(session!),
    listVerificationsForAdminReview(session!),
    listDisputedDealRoomsForAdmin(session!),
    listReportsForAdmin(),
  ]);

  const disputes = disputesRes.ok ? disputesRes.data : [];

  return (
    <AppShell
      activeNav="admin"
      trustBanner={{
        canTrustAnswer:
          "You are viewing confidential identity fields, verification records, user reports, and Connect room audits under Reviewer access.",
        nextStepAnswer:
          "Inspect pending submissions, light verifications, user reports, or disputed rooms, enter a reviewer note, and record your decision.",
      }}
    >
      <AdminReviewClient
        initialListings={listings}
        initialVerifications={verifications}
        initialDisputes={disputes}
        initialReports={reports}
      />
    </AppShell>
  );
}
