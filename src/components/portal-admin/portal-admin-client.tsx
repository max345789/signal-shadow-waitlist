"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building,
  Users,
  CreditCard,
  Activity,
  LogOut,
  Search,
  Ban,
  Check,
  FileText,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/currency";
import type { AuthSession, RoleName } from "@/lib/auth/types";
import type { SanitizedListingView } from "@/lib/domain/listings";
import type { VerificationWithEvaluation } from "@/lib/verification/store";
import type { AdminVerificationDecision } from "@/lib/domain/verification";
import type { ReportRecord, ReportStatus, ReportActionTaken } from "@/lib/reports/store";
import type {
  AdminMetricsOverview,
  AdminAuditEntry,
  AdminFinancialSummary,
} from "@/lib/admin/store";
import type { AdminUserSummary } from "@/lib/auth/store";

interface PortalAdminClientProps {
  session: AuthSession;
  initialMetrics: AdminMetricsOverview;
  initialListings: SanitizedListingView[];
  initialUsers: AdminUserSummary[];
  initialVerifications: VerificationWithEvaluation[];
  initialReports: ReportRecord[];
  initialFinancials: AdminFinancialSummary;
  initialAuditLogs: AdminAuditEntry[];
}

type TabType =
  | "overview"
  | "listings"
  | "users"
  | "verifications"
  | "reports"
  | "billing"
  | "audit"
  | "security";

export function PortalAdminClient({
  session,
  initialMetrics,
  initialListings,
  initialUsers,
  initialVerifications,
  initialReports,
  initialFinancials,
  initialAuditLogs,
}: PortalAdminClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [listings, setListings] = useState(initialListings);
  const [users, setUsers] = useState(initialUsers);
  const [verifications, setVerifications] = useState(initialVerifications);
  const [reports, setReports] = useState(initialReports);
  const [auditLogs] = useState(initialAuditLogs);
  const [financials] = useState(initialFinancials);
  const [metrics] = useState(initialMetrics);

  const [currentAdminEmail, setCurrentAdminEmail] = useState(session.email);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [otpCodeInput, setOtpCodeInput] = useState("");
  const [otpNewPasswordInput, setOtpNewPasswordInput] = useState("");
  const [generatedOtpDisplay, setGeneratedOtpDisplay] = useState<string | null>(null);

  const [listingFilter, setListingFilter] = useState<string>("ALL");
  const [listingSearch, setListingSearch] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Listing moderation state
  const [selectedListingNote, setSelectedListingNote] = useState<Record<string, string>>({});

  // Verification review state
  const [selectedVerifNote, setSelectedVerifNote] = useState<Record<string, string>>({});

  // Abuse report state
  const [selectedReportNote, setSelectedReportNote] = useState<Record<string, string>>({});

  const showNotification = (successMsg?: string, errorMsg?: string) => {
    if (successMsg) {
      setActionSuccess(successMsg);
      setActionError(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } else if (errorMsg) {
      setActionError(errorMsg);
      setActionSuccess(null);
      setTimeout(() => setActionError(null), 5000);
    }
  };

  // 1. Moderate Listing
  const handleListingModeration = async (
    id: string,
    decision: "APPROVE" | "FLAG" | "REJECT" | "TAKEDOWN"
  ) => {
    setIsProcessing(true);
    setActionError(null);
    const note = selectedListingNote[id]?.trim() || `Reviewed as ${decision} by ${session.email}`;

    try {
      const res = await fetch(`/api/portal-admin/listings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewerNote: note }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to submit moderation decision");
      } else {
        showNotification(`Listing action [${decision}] applied successfully.`);
        setListings((prev) =>
          prev.map((l) =>
            l.id === id
              ? {
                  ...l,
                  status:
                    decision === "APPROVE"
                      ? "APPROVED"
                      : decision === "REJECT"
                        ? "REJECTED"
                        : "FLAGGED",
                  reviewerNote: note,
                }
              : l
          )
        );
      }
    } catch {
      showNotification(undefined, "Network error updating listing.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. User Suspension
  const handleToggleUserSuspension = async (userId: string, currentSuspended: boolean) => {
    setIsProcessing(true);
    const action = currentSuspended ? "REACTIVATE" : "SUSPEND";
    try {
      const res = await fetch(`/api/portal-admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to update user suspension status");
      } else {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, suspended: !currentSuspended } : u))
        );
        showNotification(`User ${action === "SUSPEND" ? "suspended" : "reactivated"} successfully.`);
      }
    } catch {
      showNotification(undefined, "Network error updating user suspension.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Update User Roles
  const handleToggleUserRole = async (userId: string, targetRole: RoleName) => {
    setIsProcessing(true);
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const newRoles = user.roles.includes(targetRole)
      ? user.roles.filter((r) => r !== targetRole)
      : [...user.roles, targetRole];

    try {
      const res = await fetch(`/api/portal-admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_ROLES", roles: newRoles }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to update roles");
      } else {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, roles: newRoles } : u))
        );
        showNotification(`User roles updated to [${newRoles.join(", ")}].`);
      }
    } catch {
      showNotification(undefined, "Network error updating user roles.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Review Verification
  const handleReviewVerification = async (
    id: string,
    decision: AdminVerificationDecision
  ) => {
    setIsProcessing(true);
    const note = selectedVerifNote[id]?.trim() || `Verification review ${decision} by ${session.email}`;
    try {
      const res = await fetch(`/api/portal-admin/verifications/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewerNote: note }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to review verification");
      } else {
        showNotification(`Verification ${decision} decision applied.`);
        setVerifications((prev) =>
          prev.map((v) =>
            v.record.id === id
              ? {
                  ...v,
                  record: {
                    ...v.record,
                    status:
                      decision === "APPROVE"
                        ? "VERIFIED"
                        : decision === "FAIL"
                          ? "FAILED"
                          : "REVOKED",
                    reviewerNote: note,
                  },
                }
              : v
          )
        );
      }
    } catch {
      showNotification(undefined, "Network error updating verification.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Resolve Abuse Report
  const handleResolveReport = async (
    id: string,
    status: ReportStatus,
    actionTaken: ReportActionTaken
  ) => {
    setIsProcessing(true);
    const note = selectedReportNote[id]?.trim() || `Report updated by ${session.email}`;
    try {
      const res = await fetch(`/api/portal-admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actionTaken, adminNote: note }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to resolve report");
      } else {
        showNotification(`Report resolved: ${actionTaken}.`);
        setReports((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status,
                  actionTaken,
                  adminNote: note,
                  resolvedAt: new Date().toISOString(),
                }
              : r
          )
        );
      }
    } catch {
      showNotification(undefined, "Network error updating report.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Admin Credentials Management
  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailInput.trim() || !newEmailInput.includes("@")) {
      showNotification(undefined, "Please enter a valid email address.");
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_email", newEmail: newEmailInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to update admin email.");
      } else {
        setCurrentAdminEmail(data.newEmail);
        setNewEmailInput("");
        showNotification(`Admin email successfully changed to ${data.newEmail}.`);
      }
    } catch {
      showNotification(undefined, "Network error updating admin email.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPasswordInput) {
      showNotification(undefined, "Current password is required.");
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      showNotification(undefined, "New passwords do not match.");
      return;
    }
    if (newPasswordInput.length < 8) {
      showNotification(undefined, "New password must be at least 8 characters.");
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to update password.");
      } else {
        setCurrentPasswordInput("");
        setNewPasswordInput("");
        setConfirmPasswordInput("");
        showNotification("Admin password successfully updated.");
      }
    } catch {
      showNotification(undefined, "Network error updating password.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestOtp = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_otp" }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to generate OTP.");
      } else {
        setGeneratedOtpDisplay(data.devOtp || "Sent");
        showNotification("6-digit verification code generated! Enter it below to update password.");
      }
    } catch {
      showNotification(undefined, "Network error generating OTP.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCodeInput || otpCodeInput.trim().length !== 6) {
      showNotification(undefined, "6-digit OTP code is required.");
      return;
    }
    if (!otpNewPasswordInput || otpNewPasswordInput.length < 8) {
      showNotification(undefined, "New password must be at least 8 characters.");
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_with_otp",
          otp: otpCodeInput,
          newPassword: otpNewPasswordInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(undefined, data.error || "Failed to reset password via OTP.");
      } else {
        setOtpCodeInput("");
        setOtpNewPasswordInput("");
        setGeneratedOtpDisplay(null);
        showNotification("Password successfully updated using OTP!");
      }
    } catch {
      showNotification(undefined, "Network error verifying OTP.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter listings
  const filteredListings = listings.filter((l) => {
    if (listingFilter !== "ALL" && l.status !== listingFilter) return false;
    if (listingSearch.trim()) {
      const q = listingSearch.toLowerCase();
      return (
        l.teaserTitle.toLowerCase().includes(q) ||
        l.sector.toLowerCase().includes(q) ||
        (l.redactedName && l.redactedName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-cloud text-ink flex flex-col">
      {/* Isolated Admin Navigation Bar */}
      <header className="border-b border-mist bg-deep-navy text-white px-6 py-4 sticky top-0 z-30 shadow-none">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-trust-blue rounded text-white">
              <Shield className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-20 font-semibold tracking-wide">
                  Baton Control Console
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-14 font-medium bg-brick-red text-white">
                  INTERNAL AIR-GAPPED
                </span>
              </div>
              <p className="text-14 text-mist m-0">
                Authorized Executive Administration &bull; Disconnected from consumer surface
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-14 font-semibold text-white">{session.name}</span>
              <span className="text-12 text-mist font-mono">{currentAdminEmail}</span>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-mist/30 bg-mist/10 text-mist hover:text-white hover:bg-mist/20 text-13 font-medium transition-colors no-underline"
            >
              <Building className="w-3.5 h-3.5" />
              <span>Marketplace</span>
            </Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/";
                } catch {
                  window.location.href = "/";
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded border border-white/20 bg-white/10 text-white hover:bg-white/20 text-13 font-medium transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Console Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-4 pt-2 border-t border-mist/20 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
          {[
            { id: "overview", label: "Executive Overview", icon: Activity },
            { id: "listings", label: `Listings Moderation (${listings.length})`, icon: Building },
            { id: "users", label: `User Accounts (${users.length})`, icon: Users },
            { id: "verifications", label: `Verification Queue (${verifications.length})`, icon: CheckCircle2 },
            { id: "reports", label: `Abuse Reports (${reports.length})`, icon: AlertTriangle },
            { id: "billing", label: "Financials & Billing", icon: CreditCard },
            { id: "audit", label: `Audit Trail (${auditLogs.length})`, icon: FileText },
            { id: "security", label: "Admin Credentials", icon: KeyRound },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded text-14 font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-white text-deep-navy font-semibold"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full p-6 flex-1 flex flex-col gap-6">
        {/* Alerts / Feedback Banner */}
        {actionSuccess && (
          <div className="rounded border border-verified-green bg-white p-4 text-verified-green font-medium flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="rounded border border-brick-red bg-white p-4 text-brick-red font-medium flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            {actionError}
          </div>
        )}

        {/* TAB 1: EXECUTIVE OVERVIEW */}
        {activeTab === "overview" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-28 font-semibold text-deep-navy">
                Company &amp; Marketplace Metrics
              </h1>
              <p className="text-16 text-slate">
                Real-time operational indicators, deal volume, platform revenue, and infrastructure telemetry.
              </p>
            </div>

            {/* Metrics KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-white border-mist">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate">Total Listings Under Governance</CardDescription>
                  <CardTitle className="text-28 font-semibold text-deep-navy">
                    {metrics.totalListings}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-14 text-slate">
                  <span className="text-verified-green font-semibold">{metrics.approvedListings} Live</span> &bull;{" "}
                  <span className="text-amber font-semibold">{metrics.pendingListings} Pending</span> &bull;{" "}
                  <span className="text-brick-red font-semibold">{metrics.flaggedListings} Flagged</span>
                </CardContent>
              </Card>

              <Card className="bg-white border-mist">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate">Gross Listed Enterprise Value</CardDescription>
                  <CardTitle className="text-28 font-semibold text-deep-navy">
                    {formatCurrency(metrics.totalAskingValue, { compact: true })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-14 text-slate">
                  Total cumulative asking price across vetted Indian SaaS &amp; tech companies
                </CardContent>
              </Card>

              <Card className="bg-white border-mist">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate">Marketplace Collected Revenue</CardDescription>
                  <CardTitle className="text-28 font-semibold text-trust-blue">
                    {formatCurrency(financials.totalCollected)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-14 text-slate">
                  Listing fees (₹4,999) + Buyer match alerts (₹999/mo) &bull; Zero closing commission
                </CardContent>
              </Card>

              <Card className="bg-white border-mist">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate">Platform User Base</CardDescription>
                  <CardTitle className="text-28 font-semibold text-deep-navy">
                    {metrics.totalUsers}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-14 text-slate">
                  {metrics.buyerCount} Buyers &bull; {metrics.sellerCount} Sellers &bull; {metrics.adminCount} Internal Admins
                </CardContent>
              </Card>
            </div>

            {/* Platform Telemetry & System Health */}
            <Card className="bg-white border-mist">
              <CardHeader>
                <CardTitle className="text-20 text-deep-navy flex items-center gap-2">
                  <Activity className="w-5 h-5 text-trust-blue" />
                  System Health &amp; Infrastructure Runtime
                </CardTitle>
                <CardDescription className="text-slate">
                  Direct telemetry from primary PostgreSQL, Supabase Auth, memory allocation, and connection pools.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded border border-mist bg-cloud">
                    <span className="text-14 font-semibold text-deep-navy block">Database Layer</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-3 h-3 rounded-full bg-verified-green inline-block" />
                      <span className="text-16 text-ink font-medium capitalize">
                        {metrics.health.database} (Supabase Managed Postgres)
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded border border-mist bg-cloud">
                    <span className="text-14 font-semibold text-deep-navy block">Authentication Infrastructure</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-3 h-3 rounded-full bg-verified-green inline-block" />
                      <span className="text-16 text-ink font-medium">
                        Supabase Auth + HTTP-only Signed Tokens
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded border border-mist bg-cloud">
                    <span className="text-14 font-semibold text-deep-navy block">Runtime Environment</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-3 h-3 rounded-full bg-trust-blue inline-block" />
                      <span className="text-16 text-ink font-medium">
                        Node {metrics.health.nodeEnv} &bull; {metrics.health.memoryMb} MB heap
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded bg-cloud border border-mist text-14 text-slate flex items-center justify-between">
                  <span>Server Wall Clock: {metrics.health.serverTime}</span>
                  <span className="font-semibold text-deep-navy">Stealth Perimeter Active &bull; Zero Public Links</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 2: LISTINGS MODERATION & APPROVALS */}
        {activeTab === "listings" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="font-serif text-28 font-semibold text-deep-navy">
                  Listings Moderation &amp; Approvals
                </h1>
                <p className="text-16 text-slate">
                  Review submitted businesses, evaluate confidential identity disclosures, inspect leak checks, approve or reject.
                </p>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-14 font-semibold text-slate">Filter Status:</span>
                <select
                  value={listingFilter}
                  onChange={(e) => setListingFilter(e.target.value)}
                  className="rounded border border-mist bg-white px-3 py-2 text-14 text-ink focus:outline-none focus:border-trust-blue"
                >
                  <option value="ALL">All Statuses ({listings.length})</option>
                  <option value="PENDING_REVIEW">Pending Review</option>
                  <option value="APPROVED">Approved (Live)</option>
                  <option value="FLAGGED">Flagged / Edits Required</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search listings by title, category, or real legal name..."
                value={listingSearch}
                onChange={(e) => setListingSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded border border-mist bg-white text-14 text-ink placeholder:text-slate focus:outline-none focus:border-trust-blue"
              />
            </div>

            {/* Listing Cards */}
            <div className="flex flex-col gap-4">
              {filteredListings.length === 0 ? (
                <div className="p-8 text-center bg-white rounded border border-mist text-slate">
                  No listings found matching the filter criteria.
                </div>
              ) : (
                filteredListings.map((listing) => {
                  const statusColors: Record<string, string> = {
                    APPROVED: "bg-verified-green text-white",
                    PENDING_REVIEW: "bg-amber text-white",
                    FLAGGED: "bg-brick-red text-white",
                    REJECTED: "bg-slate text-white",
                    ARCHIVED: "bg-mist text-ink",
                  };

                  return (
                    <Card key={listing.id} className="bg-white border-mist">
                      <CardHeader className="pb-3 border-b border-mist/50">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-14 font-semibold ${
                                  statusColors[listing.status] || "bg-slate text-white"
                                }`}
                              >
                                {listing.status}
                              </span>
                              <span className="text-14 font-mono text-slate">ID: {listing.id}</span>
                              <span className="text-14 text-slate">&bull; {listing.sector}</span>
                            </div>
                            <h2 className="text-20 font-semibold text-deep-navy mt-1">
                              {listing.teaserTitle}
                            </h2>
                          </div>

                          <div className="text-right">
                            <span className="text-14 text-slate block">Asking Price</span>
                            <span className="text-20 font-bold text-deep-navy">
                              {formatCurrency(listing.askingPrice)}
                            </span>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="pt-4 flex flex-col gap-4">
                        {/* Confidential Identity Disclosure (Admin Only) */}
                        <div className="p-3 rounded border border-mist bg-cloud grid grid-cols-1 md:grid-cols-2 gap-3 text-14">
                          <div>
                            <span className="font-semibold text-deep-navy block">
                              Confidential Real Legal Name:
                            </span>
                            <span className="text-ink font-mono">
                              {listing.redactedName || "Not disclosed by seller"}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold text-deep-navy block">
                              Confidential Business Domain:
                            </span>
                            <span className="text-ink font-mono">
                              {listing.redactedDomain || "Not disclosed by seller"}
                            </span>
                          </div>
                        </div>

                        {/* Financial Snapshot */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-14">
                          <div className="p-2 rounded bg-cloud border border-mist/50">
                            <span className="text-slate block text-14">Asking Multiple</span>
                            <span className="font-semibold text-deep-navy">
                              {listing.askingPrice && listing.financialSeries[0]?.revenue
                                ? `${(listing.askingPrice / listing.financialSeries[0].revenue).toFixed(1)}x`
                                : "N/A"}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-cloud border border-mist/50">
                            <span className="text-slate block text-14">Latest Annual Revenue</span>
                            <span className="font-semibold text-deep-navy">
                              {listing.financialSeries[0]?.revenue
                                ? formatCurrency(listing.financialSeries[0].revenue)
                                : "Seller reported"}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-cloud border border-mist/50">
                            <span className="text-slate block text-14">Owner Hours / Wk</span>
                            <span className="font-semibold text-deep-navy">
                              {listing.ownerHoursPerWeek} hrs
                            </span>
                          </div>
                          <div className="p-2 rounded bg-cloud border border-mist/50">
                            <span className="text-slate block text-14">Verified Badges</span>
                            <span className="font-semibold text-verified-green">
                              {listing.trustSummary?.verifiedCount ?? 0} Passed
                            </span>
                          </div>
                        </div>

                        {/* Teaser Summary */}
                        <p className="text-14 text-ink m-0">{listing.teaserSummary}</p>

                        {/* Current Audit Note */}
                        {listing.reviewerNote && (
                          <div className="p-2 rounded border border-amber/30 bg-amber/10 text-14 text-deep-navy">
                            <span className="font-semibold">Reviewer Audit Note: </span>
                            {listing.reviewerNote}
                          </div>
                        )}

                        {/* Moderation Controls */}
                        <div className="pt-2 border-t border-mist/50 flex flex-col md:flex-row items-center gap-3">
                          <input
                            type="text"
                            placeholder="Enter moderation note or reason..."
                            value={selectedListingNote[listing.id] || ""}
                            onChange={(e) =>
                              setSelectedListingNote((prev) => ({
                                ...prev,
                                [listing.id]: e.target.value,
                              }))
                            }
                            className="flex-1 px-3 py-2 rounded border border-mist text-14 text-ink focus:outline-none focus:border-trust-blue"
                          />

                          <div className="flex flex-wrap gap-2 shrink-0">
                            <Button
                              disabled={isProcessing}
                              onClick={() => handleListingModeration(listing.id, "APPROVE")}
                              className="bg-verified-green text-white hover:bg-verified-green/90 text-14 px-3 py-1.5 h-auto min-h-0"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={isProcessing}
                              onClick={() => handleListingModeration(listing.id, "FLAG")}
                              className="border-amber text-amber hover:bg-amber/10 text-14 px-3 py-1.5 h-auto min-h-0"
                            >
                              <AlertTriangle className="w-4 h-4 mr-1" />
                              Flag for Edits
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={isProcessing}
                              onClick={() => handleListingModeration(listing.id, "REJECT")}
                              className="border-brick-red text-brick-red hover:bg-brick-red/10 text-14 px-3 py-1.5 h-auto min-h-0"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                            {listing.status === "APPROVED" && (
                              <Button
                                variant="secondary"
                                disabled={isProcessing}
                                onClick={() => handleListingModeration(listing.id, "TAKEDOWN")}
                                className="border-deep-navy text-deep-navy hover:bg-deep-navy/10 text-14 px-3 py-1.5 h-auto min-h-0"
                              >
                                <Ban className="w-4 h-4 mr-1" />
                                Take Down
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: USER & ACCOUNT OVERSIGHT */}
        {activeTab === "users" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-28 font-semibold text-deep-navy">
                User &amp; Account Oversight
              </h1>
              <p className="text-16 text-slate">
                Manage registered buyers, sellers, and internal personnel. Control roles and enforce suspension policies.
              </p>
            </div>

            <div className="overflow-x-auto rounded border border-mist bg-white">
              <table className="w-full text-left text-14">
                <thead className="bg-cloud border-b border-mist text-deep-navy font-semibold">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Assigned Roles</th>
                    <th className="py-3 px-4">2FA Status</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {users.map((u) => {
                    const isSelf = u.id === session.userId;
                    return (
                      <tr key={u.id} className="hover:bg-cloud/50">
                        <td className="py-3 px-4 font-medium text-deep-navy">{u.name}</td>
                        <td className="py-3 px-4 font-mono text-ink">{u.email}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <span
                                key={r}
                                className={`px-2 py-0.5 rounded text-14 font-semibold ${
                                  r === "ADMIN"
                                    ? "bg-deep-navy text-white"
                                    : r === "SELLER"
                                      ? "bg-trust-blue text-white"
                                      : r === "REVIEWER"
                                        ? "bg-amber text-white"
                                        : "bg-mist text-ink"
                                }`}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {u.twoFactorEnabled ? (
                            <span className="inline-flex items-center text-verified-green font-medium">
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              2FA Active
                            </span>
                          ) : (
                            <span className="text-slate font-medium">Not enabled</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {u.suspended ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-brick-red text-white text-14 font-semibold">
                              SUSPENDED
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-verified-green text-white text-14 font-semibold">
                              ACTIVE
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {/* Role Toggle Admin */}
                            {!isSelf && (
                              <Button
                                variant="secondary"
                                disabled={isProcessing}
                                onClick={() => handleToggleUserRole(u.id, "ADMIN")}
                                className="text-14 py-1 px-2 h-auto min-h-0"
                              >
                                {u.roles.includes("ADMIN") ? "Revoke Admin" : "Grant Admin"}
                              </Button>
                            )}

                            {/* Suspend / Reactivate */}
                            {!isSelf && (
                              <Button
                                variant="secondary"
                                disabled={isProcessing}
                                onClick={() => handleToggleUserSuspension(u.id, u.suspended)}
                                className={`text-14 py-1 px-2 h-auto min-h-0 ${
                                  u.suspended
                                    ? "border-verified-green text-verified-green hover:bg-verified-green/10"
                                    : "border-brick-red text-brick-red hover:bg-brick-red/10"
                                }`}
                              >
                                {u.suspended ? "Reactivate" : "Suspend"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: VERIFICATION QUEUE */}
        {activeTab === "verifications" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-28 font-semibold text-deep-navy">
                Verification Checks Queue
              </h1>
              <p className="text-16 text-slate">
                Inspect Domain DNS TXT verification, Stripe/Razorpay revenue proofs, GA4 traffic tokens, and KYC documents.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {verifications.length === 0 ? (
                <div className="p-8 text-center bg-white rounded border border-mist text-slate">
                  No verification records currently in the queue.
                </div>
              ) : (
                verifications.map((v) => {
                  const statusColors: Record<string, string> = {
                    VERIFIED: "bg-verified-green text-white",
                    PENDING: "bg-amber text-white",
                    FAILED: "bg-brick-red text-white",
                    REVOKED: "bg-slate text-white",
                  };

                  return (
                    <Card key={v.record.id} className="bg-white border-mist">
                      <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-14 font-semibold ${
                                statusColors[v.record.status] || "bg-slate text-white"
                              }`}
                            >
                              {v.record.status}
                            </span>
                            <span className="font-mono text-14 text-slate">ID: {v.record.id}</span>
                            <span className="text-14 font-semibold text-deep-navy">&bull; Type: {v.record.type}</span>
                          </div>
                          <CardTitle className="text-16 font-semibold text-deep-navy mt-1">
                            Connector / Source: {v.record.provider}
                          </CardTitle>
                        </div>
                        <span className="text-14 text-slate">
                          Submitted: {new Date(v.record.createdAt).toLocaleDateString()}
                        </span>
                      </CardHeader>

                      <CardContent className="flex flex-col gap-3">
                        {/* Evidence payload */}
                        <div className="p-3 rounded border border-mist bg-cloud text-14">
                          <span className="font-semibold text-deep-navy block mb-1">
                            Verification Payload &amp; Evidence:
                          </span>
                          <pre className="font-mono text-ink text-14 whitespace-pre-wrap break-all bg-white p-2 rounded border border-mist/50">
                            {JSON.stringify(v.record.metadata, null, 2)}
                          </pre>
                        </div>

                        {(v.record.metadata?.reviewerNote || v.record.failureReason) && (
                          <p className="text-14 text-deep-navy bg-cloud p-2 rounded border border-mist">
                            <span className="font-semibold">Reviewer Note: </span>
                            {v.record.metadata?.reviewerNote || v.record.failureReason}
                          </p>
                        )}

                        {/* Review Controls */}
                        <div className="pt-2 border-t border-mist/50 flex flex-col sm:flex-row items-center gap-3">
                          <input
                            type="text"
                            placeholder="Enter verification audit note..."
                            value={selectedVerifNote[v.record.id] || ""}
                            onChange={(e) =>
                              setSelectedVerifNote((prev) => ({
                                ...prev,
                                [v.record.id]: e.target.value,
                              }))
                            }
                            className="flex-1 px-3 py-2 rounded border border-mist text-14 text-ink focus:outline-none focus:border-trust-blue"
                          />

                          <div className="flex gap-2">
                            <Button
                              disabled={isProcessing}
                              onClick={() => handleReviewVerification(v.record.id, "APPROVE")}
                              className="bg-verified-green text-white hover:bg-verified-green/90 text-14 px-3 py-1.5 h-auto min-h-0"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Verify
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={isProcessing}
                              onClick={() => handleReviewVerification(v.record.id, "FAIL")}
                              className="border-brick-red text-brick-red hover:bg-brick-red/10 text-14 px-3 py-1.5 h-auto min-h-0"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Fail
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={isProcessing}
                              onClick={() => handleReviewVerification(v.record.id, "REVOKE")}
                              className="border-slate text-slate hover:bg-slate/10 text-14 px-3 py-1.5 h-auto min-h-0"
                            >
                              Revoke
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 5: ABUSE REPORTS QUEUE */}
        {activeTab === "reports" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-28 font-semibold text-deep-navy">
                Abuse &amp; Fraud Reports Queue
              </h1>
              <p className="text-16 text-slate">
                Investigate confidential user complaints regarding fake figures, intellectual property infringement, or impersonation.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {reports.length === 0 ? (
                <div className="p-8 text-center bg-white rounded border border-mist text-slate">
                  Zero abuse reports currently on file. Clean trust score.
                </div>
              ) : (
                reports.map((report) => (
                  <Card key={report.id} className="bg-white border-mist">
                    <CardHeader className="pb-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-14 font-semibold ${
                                report.status === "NEW"
                                  ? "bg-brick-red text-white"
                                  : report.status === "IN_REVIEW"
                                    ? "bg-amber text-white"
                                    : "bg-verified-green text-white"
                              }`}
                            >
                              {report.status}
                            </span>
                            <span className="font-mono text-14 text-slate">ID: {report.id}</span>
                            <span className="text-14 font-semibold text-deep-navy">
                              Reason: {report.reason}
                            </span>
                          </div>
                          <CardTitle className="text-16 font-semibold text-deep-navy mt-1">
                            Listing: {report.listingTitle} ({report.listingId})
                          </CardTitle>
                        </div>
                        <span className="text-14 text-slate">
                          Reported: {new Date(report.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-3">
                      <div className="p-3 rounded border border-mist bg-cloud text-14">
                        <span className="font-semibold text-deep-navy block mb-1">
                          Reporter Details &amp; Claims:
                        </span>
                        <p className="text-ink m-0">{report.details}</p>
                        {report.reporterEmail && (
                          <span className="text-slate text-14 block mt-1">
                            Contact: {report.reporterEmail}
                          </span>
                        )}
                      </div>

                      {report.adminNote && (
                        <p className="text-14 text-deep-navy bg-cloud p-2 rounded border border-mist">
                          <span className="font-semibold">Action Note: </span>
                          {report.adminNote}
                        </p>
                      )}

                      {/* Resolution controls */}
                      <div className="pt-2 border-t border-mist/50 flex flex-col sm:flex-row items-center gap-3">
                        <input
                          type="text"
                          placeholder="Action reason / notes..."
                          value={selectedReportNote[report.id] || ""}
                          onChange={(e) =>
                            setSelectedReportNote((prev) => ({
                              ...prev,
                              [report.id]: e.target.value,
                            }))
                          }
                          className="flex-1 px-3 py-2 rounded border border-mist text-14 text-ink focus:outline-none focus:border-trust-blue"
                        />

                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={isProcessing}
                            onClick={() => handleResolveReport(report.id, "ACTION_TAKEN", "REQUEST_EDITS")}
                            className="bg-amber text-white hover:bg-amber/90 text-14 px-3 py-1.5 h-auto min-h-0"
                          >
                            Request Edits
                          </Button>
                          <Button
                            disabled={isProcessing}
                            onClick={() => handleResolveReport(report.id, "ACTION_TAKEN", "HIDE")}
                            className="bg-deep-navy text-white hover:bg-deep-navy/90 text-14 px-3 py-1.5 h-auto min-h-0"
                          >
                            Hide Listing
                          </Button>
                          <Button
                            disabled={isProcessing}
                            onClick={() => handleResolveReport(report.id, "ACTION_TAKEN", "REMOVE")}
                            className="bg-brick-red text-white hover:bg-brick-red/90 text-14 px-3 py-1.5 h-auto min-h-0"
                          >
                            Remove Listing
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={isProcessing}
                            onClick={() => handleResolveReport(report.id, "NO_ACTION", "NONE")}
                            className="border-slate text-slate text-14 px-3 py-1.5 h-auto min-h-0"
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 6: FINANCIALS & BILLING */}
        {activeTab === "billing" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-28 font-semibold text-deep-navy">
                Financials &amp; Platform Billing
              </h1>
              <p className="text-16 text-slate">
                Flat listing fee payments, early buyer thesis match alert subscriptions, and transaction ledger.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-white border-mist">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate">Total Revenue Collected</CardDescription>
                  <CardTitle className="text-28 font-semibold text-deep-navy">
                    {formatCurrency(financials.totalCollected)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-14 text-slate">
                  Zero commission retained on acquisitions &bull; 100% flat fee model
                </CardContent>
              </Card>

              <Card className="bg-white border-mist">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate">Listing Fee Payments (₹4,999)</CardDescription>
                  <CardTitle className="text-28 font-semibold text-deep-navy">
                    {financials.listingFeesCount}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-14 text-slate">
                  Active verified business listings on Baton marketplace
                </CardContent>
              </Card>

              <Card className="bg-white border-mist">
                <CardHeader className="pb-2">
                  <CardDescription className="text-slate">Early Match Alerts Subscriptions (₹999/mo)</CardDescription>
                  <CardTitle className="text-28 font-semibold text-trust-blue">
                    {financials.buyerAlertsActiveSubs}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-14 text-slate">
                  Active recurring buyer subscriptions for 48h priority matching
                </CardContent>
              </Card>
            </div>

            {/* Transaction Ledger */}
            <Card className="bg-white border-mist">
              <CardHeader>
                <CardTitle className="text-20 text-deep-navy">Payment Transaction Ledger</CardTitle>
                <CardDescription className="text-slate">
                  Chronological record of listing fee invoices and monthly alert charges.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-14">
                    <thead className="bg-cloud border-b border-mist text-deep-navy font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">Transaction ID</th>
                        <th className="py-2.5 px-4">User Account</th>
                        <th className="py-2.5 px-4">Item / Plan</th>
                        <th className="py-2.5 px-4">Amount</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist">
                      {financials.transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-cloud/50">
                          <td className="py-2.5 px-4 font-mono text-slate">{tx.id}</td>
                          <td className="py-2.5 px-4 font-medium text-deep-navy">{tx.userEmail}</td>
                          <td className="py-2.5 px-4 text-ink">{tx.planName}</td>
                          <td className="py-2.5 px-4 font-semibold text-deep-navy">
                            {formatCurrency(tx.amount)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded bg-verified-green text-white text-14 font-semibold">
                              {tx.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate">{tx.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 7: AUDIT LOGS */}
        {activeTab === "audit" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-serif text-28 font-semibold text-deep-navy">
                System Security &amp; Audit Trail
              </h1>
              <p className="text-16 text-slate">
                Immutable chronological log of all administrative actions, moderation decisions, and user suspensions.
              </p>
            </div>

            <div className="overflow-x-auto rounded border border-mist bg-white">
              <table className="w-full text-left text-14">
                <thead className="bg-cloud border-b border-mist text-deep-navy font-semibold">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Administrator</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Entity</th>
                    <th className="py-3 px-4">Details / Justification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-cloud/50">
                      <td className="py-3 px-4 font-mono text-slate text-14">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-medium text-deep-navy">{log.actorEmail}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-cloud border border-mist text-deep-navy font-mono font-semibold text-14">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate text-14">
                        {log.entityType}: {log.entityId}
                      </td>
                      <td className="py-3 px-4 text-ink">{log.details || "â€”"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Security & Credentials Tab */}
        {activeTab === "security" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-24 font-bold text-deep-navy">Admin Credentials &amp; Security Settings</h2>
              <p className="text-16 text-slate">
                Replace your administrator login email, update your secure password, or reset credentials via One-Time Password (OTP).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Account Overview & Change Email */}
              <Card className="bg-white border-mist">
                <CardHeader>
                  <CardTitle as="h3" className="text-18 font-semibold text-deep-navy">
                    Replace Admin Email
                  </CardTitle>
                  <CardDescription className="text-14 text-slate">
                    Update the primary email used to access the executive console.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="p-3 bg-cloud border border-mist rounded flex flex-col gap-1">
                    <span className="text-12 font-medium text-slate uppercase">Current Active Email</span>
                    <span className="text-16 font-mono font-semibold text-deep-navy">{currentAdminEmail}</span>
                  </div>

                  <form onSubmit={handleChangeEmail} className="flex flex-col gap-3">
                    <Input
                      label="New Admin Email"
                      type="email"
                      required
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      placeholder="new-admin@yourdomain.com"
                      className="min-h-12"
                    />
                    <Button type="submit" variant="primary" loading={isProcessing} className="min-h-12">
                      Update Admin Email
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Change Password */}
              <Card className="bg-white border-mist">
                <CardHeader>
                  <CardTitle as="h3" className="text-18 font-semibold text-deep-navy">
                    Change Password
                  </CardTitle>
                  <CardDescription className="text-14 text-slate">
                    Verify your current password to set a new high-entropy password.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
                    <Input
                      label="Current Password"
                      type="password"
                      required
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      placeholder="Current password"
                      className="min-h-12"
                    />
                    <Input
                      label="New Password"
                      type="password"
                      required
                      minLength={8}
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="min-h-12"
                    />
                    <Input
                      label="Confirm New Password"
                      type="password"
                      required
                      minLength={8}
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      placeholder="Re-enter new password"
                      className="min-h-12"
                    />
                    <Button type="submit" variant="primary" loading={isProcessing} className="min-h-12 mt-1">
                      Update Admin Password
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* OTP Reset Section */}
            <Card className="bg-white border-mist">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-trust-blue" />
                  <CardTitle as="h3" className="text-18 font-semibold text-deep-navy">
                    Reset Password with OTP (One-Time Password)
                  </CardTitle>
                </div>
                <CardDescription className="text-14 text-slate">
                  Generate a 6-digit verification code to reset the administrator password immediately without entering your current password.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {generatedOtpDisplay ? (
                  <div className="p-4 bg-cloud border border-trust-blue rounded flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-12 font-medium text-slate uppercase">Your Verification OTP Code</span>
                      <span className="text-28 font-mono font-bold text-trust-blue tracking-widest">{generatedOtpDisplay}</span>
                      <span className="text-12 text-slate">Expires in 10 minutes</span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setOtpCodeInput(generatedOtpDisplay)}
                      className="min-h-10 text-14"
                    >
                      Fill into OTP input
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      loading={isProcessing}
                      onClick={handleRequestOtp}
                      className="min-h-12"
                    >
                      <KeyRound className="w-4 h-4 mr-2" />
                      Request 6-Digit OTP Code
                    </Button>
                  </div>
                )}

                <form onSubmit={handleResetWithOtp} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <Input
                    label="6-Digit OTP Code"
                    type="text"
                    maxLength={6}
                    required
                    value={otpCodeInput}
                    onChange={(e) => setOtpCodeInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="min-h-12 font-mono text-center tracking-widest text-16"
                  />
                  <Input
                    label="New Password"
                    type="password"
                    minLength={8}
                    required
                    value={otpNewPasswordInput}
                    onChange={(e) => setOtpNewPasswordInput(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="min-h-12"
                  />
                  <div className="flex flex-col justify-end">
                    <Button type="submit" variant="primary" loading={isProcessing} className="min-h-12 w-full">
                      Verify OTP &amp; Reset Password
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
