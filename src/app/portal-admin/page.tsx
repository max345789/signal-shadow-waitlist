import React from "react";
import { notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth/session-server";
import { isAuthorizedAdmin } from "@/lib/auth/permissions";
import {
  getAdminOverviewMetrics,
  listAllListingsForAdmin,
  listUsersForAdmin,
  listVerificationsForAdmin,
  listReportsForAdminAction,
  getAdminFinancials,
  getSystemAuditLogs,
} from "@/lib/admin/store";
import { PortalAdminClient } from "@/components/portal-admin/portal-admin-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Baton Executive Console",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function PortalAdminPage() {
  const session = await getServerSession();

  // Stealth 404 security guard: If not an authenticated ADMIN with authorized email, return 404
  if (!isAuthorizedAdmin(session)) {
    notFound();
  }

  const [metrics, listings, users, verifications, reports, financials, auditLogs] =
    await Promise.all([
      getAdminOverviewMetrics(session!),
      listAllListingsForAdmin(session!),
      listUsersForAdmin(),
      listVerificationsForAdmin(session!),
      listReportsForAdminAction(),
      getAdminFinancials(),
      getSystemAuditLogs(50),
    ]);

  return (
    <PortalAdminClient
      session={session!}
      initialMetrics={metrics}
      initialListings={listings}
      initialUsers={users}
      initialVerifications={verifications}
      initialReports={reports}
      initialFinancials={financials}
      initialAuditLogs={auditLogs}
    />
  );
}
