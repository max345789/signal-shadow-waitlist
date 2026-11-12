"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type {
  AdminDisputeDecision,
  AdminDisputeView,
} from "@/lib/domain/deal-room";
import type { AdminReviewDecision, SanitizedListingView } from "@/lib/domain/listings";
import {
  ALLOWED_VERIFICATION_REVIEW_TRANSITIONS,
  type AdminVerificationDecision,
  type VerificationTypeValue,
} from "@/lib/domain/verification";
import { detectConfidentialLeak } from "@/lib/domain/valuation";
import { formatCurrency } from "@/lib/format/currency";
import type { VerificationWithEvaluation } from "@/lib/verification/store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardStateEmpty,
  CardStateError,
  CardStateLoading,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function statusChipTone(status: SanitizedListingView["status"]): StatusChipTone {
  switch (status) {
    case "APPROVED":
      return "verified";
    case "PENDING_REVIEW":
      return "pending";
    case "FLAGGED":
    case "REJECTED":
      return "risk";
    default:
      return "seller-reported";
  }
}

function verificationTypeLabel(type: VerificationTypeValue): string {
  switch (type) {
    case "IDENTITY":
      return "Identity KYC";
    case "PROOF_OF_FUNDS":
      return "Proof of funds";
    case "PAYMENT_CONNECTOR":
      return "Payment connector";
    case "ANALYTICS_CONNECTOR":
      return "Analytics connector";
  }
}

export function AdminReviewClient({
  initialListings,
  initialVerifications = [],
  initialDisputes = [],
}: {
  initialListings: SanitizedListingView[];
  initialVerifications?: VerificationWithEvaluation[];
  initialDisputes?: AdminDisputeView[];
}) {
  const [listings, setListings] =
    React.useState<SanitizedListingView[]>(initialListings);
  const [verifications, setVerifications] =
    React.useState<VerificationWithEvaluation[]>(initialVerifications);
  const [disputes, setDisputes] =
    React.useState<AdminDisputeView[]>(initialDisputes);
  const [notesById, setNotesById] = React.useState<Record<string, string>>({});
  const [fieldErrorsById, setFieldErrorsById] = React.useState<
    Record<string, string | undefined>
  >({});
  const [verNotesById, setVerNotesById] = React.useState<Record<string, string>>({});
  const [verErrorsById, setVerErrorsById] = React.useState<
    Record<string, string | undefined>
  >({});
  const [disputeNotesById, setDisputeNotesById] = React.useState<
    Record<string, string>
  >({});
  const [disputeErrorsById, setDisputeErrorsById] = React.useState<
    Record<string, string | undefined>
  >({});
  const [busyAction, setBusyAction] = React.useState<{
    id: string;
    decision: AdminReviewDecision;
  } | null>(null);
  const [busyVerAction, setBusyVerAction] = React.useState<{
    id: string;
    decision: AdminVerificationDecision;
  } | null>(null);
  const [busyDisputeAction, setBusyDisputeAction] = React.useState<{
    id: string;
    decision: AdminDisputeDecision;
  } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  async function refreshQueue() {
    setLoading(true);
    setFetchError(null);
    try {
      const [listingsRes, verRes, disputesRes] = await Promise.all([
        fetch("/api/admin/listings"),
        fetch("/api/admin/verifications"),
        fetch("/api/admin/disputes"),
      ]);
      const listingsData = await listingsRes.json();
      const verData = await verRes.json();
      const disputesData = await disputesRes.json();
      if (!listingsRes.ok) {
        setFetchError(listingsData.error ?? "Could not load Admin review queue.");
        return;
      }
      setListings(listingsData.listings ?? []);
      if (!verRes.ok) {
        setFetchError(verData.error ?? "Could not load verification queue.");
        return;
      }
      setVerifications(verData.verifications ?? []);
      if (!disputesRes.ok) {
        setFetchError(disputesData.error ?? "Could not load dispute queue.");
        return;
      }
      setDisputes(disputesData.disputes ?? []);
    } catch {
      setFetchError("Network error while refreshing review queue.");
    } finally {
      setLoading(false);
    }
  }

  async function submitDisputeResolution(
    dealRoomId: string,
    decision: AdminDisputeDecision
  ) {
    const note = (disputeNotesById[dealRoomId] ?? "").trim();
    if (note.length < 10) {
      setDisputeErrorsById((prev) => ({
        ...prev,
        [dealRoomId]:
          "Enter a resolution note (at least 10 characters) explaining your decision.",
      }));
      return;
    }

    setBusyDisputeAction({ id: dealRoomId, decision });
    setDisputeErrorsById((prev) => ({ ...prev, [dealRoomId]: undefined }));
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/disputes/${dealRoomId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, resolutionNote: note }),
      });
      const data = await res.json();
      if (!res.ok) {
        const twoFactorHint =
          data.code === "TWO_FACTOR_REQUIRED" ||
          data.code === "TWO_FACTOR_EXPIRED"
            ? " Complete 2FA verification at Sign in & 2FA before resolving disputes."
            : "";
        setDisputeErrorsById((prev) => ({
          ...prev,
          [dealRoomId]: `${data.error ?? "Dispute resolution failed."}${twoFactorHint}`,
        }));
        return;
      }

      const updatedDispute: AdminDisputeView = data.dispute;
      setDisputes((prev) =>
        prev.map((d) => (d.dealRoomId === dealRoomId ? updatedDispute : d))
      );
      setDisputeNotesById((prev) => {
        const copy = { ...prev };
        delete copy[dealRoomId];
        return copy;
      });
      setFeedback(
        `Resolved dispute for "${updatedDispute.teaserTitle}" (${updatedDispute.escrow.externalRef}) as ${updatedDispute.escrow.status} and wrote AuditLog entry.`
      );
    } catch {
      setDisputeErrorsById((prev) => ({
        ...prev,
        [dealRoomId]: "Network error while resolving dispute.",
      }));
    } finally {
      setBusyDisputeAction(null);
    }
  }

  async function submitVerificationDecision(
    id: string,
    decision: AdminVerificationDecision
  ) {
    const note = (verNotesById[id] ?? "").trim();
    if (note.length < 5) {
      setVerErrorsById((prev) => ({
        ...prev,
        [id]: "Enter a reviewer note (at least 5 characters) explaining this decision.",
      }));
      return;
    }

    setBusyVerAction({ id, decision });
    setVerErrorsById((prev) => ({ ...prev, [id]: undefined }));
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/verifications/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewerNote: note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerErrorsById((prev) => ({
          ...prev,
          [id]: data.error ?? "Verification review action failed.",
        }));
        return;
      }

      const updated: VerificationWithEvaluation = data.verification;
      setVerifications((prev) =>
        prev.map((item) => (item.record.id === id ? updated : item))
      );
      setVerNotesById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setFeedback(
        `Updated ${updated.record.provider} (${verificationTypeLabel(updated.record.type)}) to ${updated.record.status} and wrote AuditLog entry.`
      );
    } catch {
      setVerErrorsById((prev) => ({
        ...prev,
        [id]: "Network error while saving verification review.",
      }));
    } finally {
      setBusyVerAction(null);
    }
  }

  async function submitDecision(id: string, decision: AdminReviewDecision) {
    const note = (notesById[id] ?? "").trim();
    if (note.length < 5) {
      setFieldErrorsById((prev) => ({
        ...prev,
        [id]: "Enter a reviewer note (at least 5 characters) explaining this decision.",
      }));
      return;
    }

    setBusyAction({ id, decision });
    setFieldErrorsById((prev) => ({ ...prev, [id]: undefined }));
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/listings/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewerNote: note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFieldErrorsById((prev) => ({
          ...prev,
          [id]: data.error ?? "Review action failed.",
        }));
        return;
      }

      const updated: SanitizedListingView = data.listing;
      setListings((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setNotesById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setFeedback(
        `Updated "${updated.teaserTitle}" to ${updated.status.replace("_", " ")} and wrote AuditLog entry.`
      );
    } catch {
      setFieldErrorsById((prev) => ({
        ...prev,
        [id]: "Network error while saving review decision.",
      }));
    } finally {
      setBusyAction(null);
    }
  }

  const pendingListings = listings.filter((l) => l.status === "PENDING_REVIEW");
  const approvedListings = listings.filter((l) => l.status === "APPROVED");
  const flaggedOrRejected = listings.filter(
    (l) => l.status === "FLAGGED" || l.status === "REJECTED"
  );

  const pendingVerifications = verifications.filter(
    (v) => v.record.status === "PENDING"
  );
  const verifiedVerifications = verifications.filter(
    (v) => v.evaluated.isVerified
  );
  const inactiveVerifications = verifications.filter(
    (v) => v.record.status !== "PENDING" && !v.evaluated.isVerified
  );

  const openDisputes = disputes.filter(
    (d) => d.roomStatus === "DISPUTED" || d.escrow.status === "DISPUTED"
  );
  const resolvedDisputes = disputes.filter(
    (d) => d.roomStatus !== "DISPUTED" && d.escrow.status !== "DISPUTED"
  );

  function renderDisputeList(
    items: AdminDisputeView[],
    emptyTitle: string,
    emptyDescription: string,
    mode: "open" | "resolved"
  ) {
    if (loading) {
      return (
        <CardStateLoading
          title="Loading dispute queue"
          description="Checking flagged deal room escrow transactions and audit records."
        />
      );
    }
    if (fetchError) {
      return (
        <CardStateError
          message={fetchError}
          onRetry={() => void refreshQueue()}
        />
      );
    }
    if (items.length === 0) {
      return <CardStateEmpty title={emptyTitle} description={emptyDescription} />;
    }

    const hasFieldError = items.some((d) => Boolean(disputeErrorsById[d.dealRoomId]));

    return (
      <div className="flex flex-col gap-6">
        {items.map((item) => {
          const isBusy = busyDisputeAction?.id === item.dealRoomId;
          const noteError = disputeErrorsById[item.dealRoomId];
          const wasFunded = Boolean(item.escrow.fundedAt);
          const chipTone: StatusChipTone =
            mode === "open"
              ? "risk"
              : item.escrow.status === "RELEASED" && !hasFieldError
                ? "completed"
                : "neutral";

          return (
            <Card key={item.dealRoomId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      tone={chipTone}
                      emphasis={
                        chipTone === "risk" || chipTone === "completed"
                          ? "solid"
                          : "outline"
                      }
                      label={`Escrow: ${item.escrow.status.replace("_", " ")}`}
                    />
                    <StatusChip
                      tone="neutral"
                      label={`Room: ${item.roomStatus}`}
                    />
                    {item.isSampleData ? (
                      <StatusChip tone="neutral" label="Sample data" />
                    ) : null}
                  </div>
                  <span className="text-14 text-slate tabular-figures">
                    Ref:{" "}
                    <strong className="text-ink">{item.escrow.externalRef}</strong>
                  </span>
                </div>

                <CardTitle as="h2" className="pt-2">
                  {item.teaserTitle}
                </CardTitle>
                <CardDescription>
                  Buyer: {item.buyerName} · Seller: {item.sellerName} · Stage:{" "}
                  {item.currentStage.replace("_", " ")}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 rounded border border-mist bg-cloud p-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-14 text-slate">Escrow provider &amp; amount</span>
                    <span className="text-16 font-semibold text-deep-navy tabular-figures">
                      {item.escrow.provider} ·{" "}
                      {formatCurrency(item.escrow.amount, {
                        currency: item.escrow.currency,
                      })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-14 text-slate">Funding status</span>
                    <span className="text-16 font-medium text-ink">
                      {wasFunded ? "Funded in third-party escrow" : "Not funded yet"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-14 text-slate">Transfer checklist</span>
                    <span className="text-16 font-medium text-ink tabular-figures">
                      {item.transferTotalCount > 0
                        ? `${item.transferConfirmedCount} / ${item.transferTotalCount} confirmed`
                        : "Not in Transfer stage"}
                    </span>
                  </div>
                </div>

                {item.escrow.disputeReason ? (
                  <div className="rounded border border-mist bg-white p-4">
                    <span className="text-14 font-semibold text-deep-navy">
                      Reported dispute reason
                    </span>
                    <p className="pt-1 text-16 text-ink">
                      {item.escrow.disputeReason}
                    </p>
                  </div>
                ) : null}

                {item.resolutionNote ? (
                  <div className="rounded border border-mist bg-cloud p-4">
                    <span className="text-14 font-semibold text-deep-navy">
                      Reviewer resolution note
                    </span>
                    <p className="pt-1 text-16 text-ink">{item.resolutionNote}</p>
                  </div>
                ) : null}

                {mode === "open" ? (
                  <Textarea
                    label="Dispute resolution note (required for AuditLog)"
                    value={disputeNotesById[item.dealRoomId] ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDisputeNotesById((prev) => ({
                        ...prev,
                        [item.dealRoomId]: val,
                      }));
                      if (noteError) {
                        setDisputeErrorsById((prev) => ({
                          ...prev,
                          [item.dealRoomId]: undefined,
                        }));
                      }
                    }}
                    error={noteError}
                    rows={2}
                    placeholder="Document evidence reviewed from Transfer checklist, chat, and third-party escrow logs."
                  />
                ) : null}
              </CardContent>

              <CardFooter>
                <Button asChild variant="link">
                  <Link href={`/deals/${item.dealRoomId}`}>
                    <span>Inspect deal room</span>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>

                {mode === "open" ? (
                  <div className="flex flex-wrap gap-2">
                    {wasFunded ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isBusy}
                        loading={
                          isBusy &&
                          busyDisputeAction?.decision === "REFUND_TO_BUYER"
                        }
                        loadingLabel="Refunding..."
                        onClick={() =>
                          void submitDisputeResolution(
                            item.dealRoomId,
                            "REFUND_TO_BUYER"
                          )
                        }
                      >
                        <span>Refund to Buyer</span>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isBusy}
                      loading={
                        isBusy &&
                        busyDisputeAction?.decision === "RESUME_TO_IN_REVIEW"
                      }
                      loadingLabel="Resuming..."
                      onClick={() =>
                        void submitDisputeResolution(
                          item.dealRoomId,
                          "RESUME_TO_IN_REVIEW"
                        )
                      }
                    >
                      <span>Resume to In Review</span>
                    </Button>
                    {wasFunded ? (
                      <Button
                        type="button"
                        variant="primary"
                        disabled={isBusy}
                        loading={
                          isBusy &&
                          busyDisputeAction?.decision === "RELEASE_TO_SELLER"
                        }
                        loadingLabel="Releasing..."
                        onClick={() =>
                          void submitDisputeResolution(
                            item.dealRoomId,
                            "RELEASE_TO_SELLER"
                          )
                        }
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        <span>Release to Seller</span>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  }

  function renderVerificationList(
    items: VerificationWithEvaluation[],
    emptyTitle: string,
    emptyDescription: string,
    tabToneMode: "pending" | "verified" | "inactive"
  ) {
    if (loading) {
      return (
        <CardStateLoading
          title="Loading verification records"
          description="Checking KYC, Proof of Funds, and connector expirations."
        />
      );
    }
    if (fetchError) {
      return (
        <CardStateError
          message={fetchError}
          onRetry={() => void refreshQueue()}
        />
      );
    }
    if (items.length === 0) {
      return <CardStateEmpty title={emptyTitle} description={emptyDescription} />;
    }

    const inactiveHasRisk = items.some(
      (v) => v.record.status === "FAILED" || v.record.status === "REVOKED"
    );
    const hasFieldValidationError = items.some((v) =>
      Boolean(verErrorsById[v.record.id])
    );

    return (
      <div className="flex flex-col gap-6">
        {items.map((item) => {
          const { record, evaluated } = item;
          const isBusy = busyVerAction?.id === record.id;
          const verError = verErrorsById[record.id];
          const allowedTargets =
            ALLOWED_VERIFICATION_REVIEW_TRANSITIONS[record.status] ?? [];

          const chipTone: StatusChipTone =
            tabToneMode === "verified"
              ? "verified"
              : tabToneMode === "pending"
                ? hasFieldValidationError
                  ? "seller-reported"
                  : "pending"
                : record.status === "FAILED" || record.status === "REVOKED"
                  ? "risk"
                  : inactiveHasRisk || hasFieldValidationError
                    ? "seller-reported"
                    : "caution";

          return (
            <Card key={record.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      tone={chipTone}
                      emphasis={evaluated.isVerified ? "solid" : "outline"}
                      label={evaluated.label}
                    />
                    <StatusChip
                      tone="neutral"
                      label={verificationTypeLabel(record.type)}
                    />
                    {record.isSampleData ? (
                      <StatusChip tone="neutral" label="Sample data" />
                    ) : null}
                  </div>
                  <span className="text-14 text-slate">
                    Provider:{" "}
                    <strong className="text-ink">{record.provider}</strong>
                  </span>
                </div>

                <CardTitle as="h2" className="pt-2">
                  {record.businessTitle ??
                    record.userName ??
                    record.userEmail ??
                    `Verification ${record.id}`}
                </CardTitle>
                <CardDescription>
                  {record.userEmail
                    ? `Account: ${record.userName ?? record.userEmail} (${record.userEmail})`
                    : "Marketplace business verification record"}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 rounded border border-mist bg-cloud p-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-14 text-slate">Verification detail</span>
                    <span className="text-16 font-medium text-ink">
                      {evaluated.lastVerifiedLabel ?? evaluated.detail}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-14 text-slate">Masked reference</span>
                    <span className="break-words text-16 font-medium text-ink">
                      {record.type === "IDENTITY"
                        ? `${record.metadata.legalName ?? ""} · ${record.metadata.documentType ?? "ID"} ${record.metadata.maskedReference ?? "****"}`
                        : record.type === "PROOF_OF_FUNDS"
                          ? `${record.metadata.institutionLabel ?? "Bank"} · ${
                              record.metadata.declaredAmount
                                ? formatCurrency(
                                    record.metadata.declaredAmount,
                                    {
                                      currency:
                                        record.metadata.currency ?? "INR",
                                      compact: true,
                                    }
                                  )
                                : "—"
                            }`
                          : record.metadata.accountHint ?? record.provider}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-14 text-slate">Expiry timestamp</span>
                    <span className="text-16 text-ink tabular-figures">
                      {record.expiresAt
                        ? new Date(record.expiresAt).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "Pending assignment"}
                    </span>
                  </div>
                </div>

                {record.failureReason ? (
                  <div className="rounded border border-mist bg-white p-4">
                    <span className="text-14 font-semibold text-deep-navy">
                      Failure / expiry note
                    </span>
                    <p className="pt-1 text-16 text-ink">
                      {record.failureReason}
                    </p>
                  </div>
                ) : null}

                <Textarea
                  label="Verification review note (required for AuditLog)"
                  value={verNotesById[record.id] ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setVerNotesById((prev) => ({ ...prev, [record.id]: val }));
                    if (verError) {
                      setVerErrorsById((prev) => ({
                        ...prev,
                        [record.id]: undefined,
                      }));
                    }
                  }}
                  error={verError}
                  rows={2}
                  placeholder="Record KYC/POF document check, connector audit, or expiry/failure reason."
                />
              </CardContent>

              <CardFooter>
                {record.businessSlug ? (
                  <Button asChild variant="link">
                    <Link href={`/listings/${record.businessSlug}`}>
                      <span>Inspect listing</span>
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : (
                  <span className="text-14 text-slate">
                    ID: {record.id}
                  </span>
                )}

                <div className="flex flex-wrap gap-2">
                  {allowedTargets.includes("REVOKED") ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isBusy}
                      loading={isBusy && busyVerAction?.decision === "REVOKE"}
                      loadingLabel="Revoking..."
                      onClick={() =>
                        void submitVerificationDecision(record.id, "REVOKE")
                      }
                    >
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      <span>Revoke</span>
                    </Button>
                  ) : null}
                  {allowedTargets.includes("EXPIRED") ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isBusy}
                      loading={isBusy && busyVerAction?.decision === "EXPIRE"}
                      loadingLabel="Expiring..."
                      onClick={() =>
                        void submitVerificationDecision(record.id, "EXPIRE")
                      }
                    >
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>Mark expired</span>
                    </Button>
                  ) : null}
                  {allowedTargets.includes("FAILED") ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isBusy}
                      loading={isBusy && busyVerAction?.decision === "FAIL"}
                      loadingLabel="Failing..."
                      onClick={() =>
                        void submitVerificationDecision(record.id, "FAIL")
                      }
                    >
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      <span>Mark failed</span>
                    </Button>
                  ) : null}
                  {allowedTargets.includes("VERIFIED") ? (
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isBusy}
                      loading={isBusy && busyVerAction?.decision === "APPROVE"}
                      loadingLabel="Verifying..."
                      onClick={() =>
                        void submitVerificationDecision(record.id, "APPROVE")
                      }
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      <span>Approve &amp; verify</span>
                    </Button>
                  ) : null}
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  }

  function renderQueueList(
    items: SanitizedListingView[],
    emptyTitle: string,
    emptyDescription: string
  ) {
    if (loading) {
      return (
        <CardStateLoading
          title="Loading review queue"
          description="Fetching pending seller submissions and verification records."
        />
      );
    }
    if (fetchError) {
      return (
        <CardStateError
          message={fetchError}
          onRetry={() => void refreshQueue()}
        />
      );
    }
    if (items.length === 0) {
      return <CardStateEmpty title={emptyTitle} description={emptyDescription} />;
    }

    return (
      <div className="flex flex-col gap-6">
        {items.map((item) => {
          const isBusy = busyAction?.id === item.id;
          const noteError = fieldErrorsById[item.id];
          const canApprove =
            item.status === "PENDING_REVIEW" || item.status === "FLAGGED";
          const canFlag =
            item.status === "PENDING_REVIEW" || item.status === "APPROVED";
          const canReject =
            item.status === "PENDING_REVIEW" || item.status === "FLAGGED";
          const leaks =
            item.redactedName && item.redactedDomain
              ? detectConfidentialLeak(
                  {
                    teaserTitle: item.teaserTitle,
                    teaserSummary: item.teaserSummary,
                    reasonForSelling: item.reasonForSelling,
                    financialNarrative: item.financialNarrative,
                    risksSummary: item.risksSummary,
                    founderStory: item.founderStory,
                  },
                  {
                    redactedName: item.redactedName,
                    redactedDomain: item.redactedDomain,
                  }
                )
              : [];

          return (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      tone={statusChipTone(item.status)}
                      label={item.status.replace("_", " ")}
                    />
                    {item.isSampleData ? (
                      <StatusChip tone="neutral" label="Sample data" />
                    ) : null}
                  </div>
                  <span className="text-14 text-slate">
                    Seller: <strong className="text-ink">{item.sellerDisplayLabel}</strong>
                  </span>
                </div>

                <CardTitle as="h2" className="pt-2">
                  {item.teaserTitle}
                </CardTitle>
                <CardDescription>{item.teaserSummary}</CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-6">
                <div className="grid grid-cols-1 gap-4 rounded border border-mist bg-cloud p-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-14 text-slate">Asking price</span>
                    <span className="text-20 font-semibold text-deep-navy tabular-figures">
                      {formatCurrency(item.askingPrice, {
                        currency: item.currency,
                        compact: true,
                      })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-14 text-slate">Sector &amp; geography</span>
                    <span className="text-16 font-medium text-ink">
                      {item.sector} · {item.geography}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-14 text-slate">Metrics provenance</span>
                    <span className="text-16 font-medium text-ink tabular-figures">
                      {item.trustSummary.verifiedCount} verified /{" "}
                      {item.trustSummary.sellerReportedCount} seller-reported
                      {item.trustSummary.expiredOrFailedCount > 0
                        ? ` / ${item.trustSummary.expiredOrFailedCount} expired/failed`
                        : ""}
                    </span>
                  </div>
                </div>

                {/* Confidential identity visible exclusively to reviewers */}
                <div className="rounded border border-mist bg-white p-4">
                  <div className="flex items-center gap-2 pb-4">
                    <Lock className="h-4 w-4 text-trust-blue" aria-hidden="true" />
                    <span className="text-16 font-semibold text-deep-navy">
                      Confidential seller identity (Admin compliance view)
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <dt className="text-14 text-slate">Legal / brand name</dt>
                      <dd className="break-words text-16 font-medium text-ink">
                        {item.redactedName ?? "Not provided"}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-2">
                      <dt className="text-14 text-slate">Primary domain</dt>
                      <dd className="break-words text-16 font-medium text-ink">
                        {item.redactedDomain ?? "Not provided"}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-2">
                      <dt className="text-14 text-slate">Customers summary</dt>
                      <dd className="break-words text-16 text-ink">
                        {item.redactedCustomers ?? "Not provided"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Public narrative & automated leak inspection */}
                <div className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-14 font-semibold text-deep-navy">
                      Public narrative &amp; redaction check
                    </span>
                    <span className="text-14 font-medium text-ink">
                      {leaks.length > 0
                        ? `Leak detected: "${leaks[0]?.matchedTerm}" in ${leaks[0]?.field}`
                        : "Redaction check: no leaked brand/domain tokens detected"}
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <dt className="text-14 text-slate">Reason for selling</dt>
                      <dd className="text-16 text-ink">{item.reasonForSelling}</dd>
                    </div>
                    <div className="flex flex-col gap-2">
                      <dt className="text-14 text-slate">Disclosed risks</dt>
                      <dd className="text-16 text-ink">{item.risksSummary}</dd>
                    </div>
                    <div className="flex flex-col gap-2 md:col-span-2">
                      <dt className="text-14 text-slate">Financial narrative</dt>
                      <dd className="text-16 text-ink">{item.financialNarrative}</dd>
                    </div>
                  </dl>
                </div>

                {item.reviewerNote ? (
                  <div className="rounded border border-mist bg-cloud p-4">
                    <span className="text-14 font-semibold text-deep-navy">
                      Latest reviewer note
                    </span>
                    <p className="pt-2 text-16 text-ink">{item.reviewerNote}</p>
                  </div>
                ) : null}

                {item.auditLogs.length > 0 ? (
                  <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
                    <span className="text-14 font-semibold text-deep-navy">
                      Audit log ({item.auditLogs.length})
                    </span>
                    <ul className="flex flex-col gap-2">
                      {item.auditLogs.slice(0, 3).map((entry) => (
                        <li key={entry.id} className="text-14 text-slate">
                          <strong className="text-ink">{entry.action}</strong> by{" "}
                          {entry.actorLabel}
                          {entry.note ? ` — ${entry.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <Textarea
                  label="Reviewer decision note (required for AuditLog)"
                  value={notesById[item.id] ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNotesById((prev) => ({ ...prev, [item.id]: val }));
                    if (noteError) {
                      setFieldErrorsById((prev) => ({ ...prev, [item.id]: undefined }));
                    }
                  }}
                  error={noteError}
                  rows={2}
                  placeholder="Record verification checks completed, redaction review, or required seller edits."
                />
              </CardContent>

              <CardFooter>
                <Button asChild variant="link">
                  <Link href={`/listings/${item.slug}`}>
                    <span>Inspect public preview</span>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>

                <div className="flex flex-wrap gap-2">
                  {canReject ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isBusy}
                      loading={isBusy && busyAction?.decision === "REJECT"}
                      loadingLabel="Rejecting..."
                      onClick={() => void submitDecision(item.id, "REJECT")}
                    >
                      Reject listing
                    </Button>
                  ) : null}
                  {canFlag ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isBusy}
                      loading={isBusy && busyAction?.decision === "FLAG"}
                      loadingLabel="Flagging..."
                      onClick={() => void submitDecision(item.id, "FLAG")}
                    >
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      <span>Flag for edits</span>
                    </Button>
                  ) : null}
                  {canApprove ? (
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isBusy}
                      loading={isBusy && busyAction?.decision === "APPROVE"}
                      loadingLabel="Approving..."
                      onClick={() => void submitDecision(item.id, "APPROVE")}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>Approve listing</span>
                    </Button>
                  ) : null}
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Admin review queue
          </h1>
          <p className="max-w-[760px] text-16 text-slate">
            Inspect confidential seller identity, verify redaction hygiene, and approve,
            flag, or reject submissions. Every decision is written to the immutable audit
            log.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          loading={loading}
          loadingLabel="Refreshing..."
          onClick={() => void refreshQueue()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Refresh queue</span>
        </Button>
      </div>

      {feedback ? (
        <div
          role="status"
          className="rounded border border-mist bg-white p-4 text-16 font-medium text-deep-navy"
        >
          {feedback}
        </div>
      ) : null}

      <Tabs defaultValue="listings">
        <TabsList aria-label="Switch Admin review queue category">
          <TabsTrigger value="listings">
            Listings queue ({listings.length})
          </TabsTrigger>
          <TabsTrigger value="verifications">
            Verification queue ({pendingVerifications.length} pending)
          </TabsTrigger>
          <TabsTrigger value="disputes">
            Dispute queue ({openDisputes.length} open)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listings">
          <Tabs defaultValue="pending">
            <TabsList aria-label="Filter admin review queue by listing status">
              <TabsTrigger value="pending">
                Pending review ({pendingListings.length})
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved ({approvedListings.length})
              </TabsTrigger>
              <TabsTrigger value="flagged">
                Flagged &amp; rejected ({flaggedOrRejected.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              {renderQueueList(
                pendingListings,
                "No listings awaiting review",
                "New seller submissions will appear here for verification and approval."
              )}
            </TabsContent>

            <TabsContent value="approved">
              {renderQueueList(
                approvedListings,
                "No approved listings",
                "Approved listings appear live in the public directory and can still be flagged if verification fails."
              )}
            </TabsContent>

            <TabsContent value="flagged">
              {renderQueueList(
                flaggedOrRejected,
                "No flagged or rejected listings",
                "Flagged listings return to the seller with your reviewer note."
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="verifications">
          <Tabs defaultValue="ver-pending">
            <TabsList aria-label="Filter verification queue by status">
              <TabsTrigger value="ver-pending">
                Pending checks ({pendingVerifications.length})
              </TabsTrigger>
              <TabsTrigger value="ver-verified">
                Verified ({verifiedVerifications.length})
              </TabsTrigger>
              <TabsTrigger value="ver-inactive">
                Expired, failed &amp; revoked ({inactiveVerifications.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ver-pending">
              {renderVerificationList(
                pendingVerifications,
                "No pending KYC or Proof of Funds submissions",
                "Buyer KYC, Seller KYC, and Proof of Funds requests awaiting compliance review appear here.",
                "pending"
              )}
            </TabsContent>

            <TabsContent value="ver-verified">
              {renderVerificationList(
                verifiedVerifications,
                "No active verified records",
                "Active verified KYC, Proof of Funds, and payment/analytics connectors appear here.",
                "verified"
              )}
            </TabsContent>

            <TabsContent value="ver-inactive">
              {renderVerificationList(
                inactiveVerifications,
                "No expired, failed, or revoked verifications",
                "Connections or KYC checks that fail, expire, or get revoked appear here with their audit reason.",
                "inactive"
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="disputes">
          <Tabs defaultValue="disputes-open">
            <TabsList aria-label="Filter dispute queue by resolution status">
              <TabsTrigger value="disputes-open">
                Open disputes ({openDisputes.length})
              </TabsTrigger>
              <TabsTrigger value="disputes-resolved">
                Resolved &amp; closed ({resolvedDisputes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="disputes-open">
              {renderDisputeList(
                openDisputes,
                "No open escrow disputes",
                "Deal rooms flagged for missing asset transfers or escrow issues appear here for Reviewer resolution.",
                "open"
              )}
            </TabsContent>

            <TabsContent value="disputes-resolved">
              {renderDisputeList(
                resolvedDisputes,
                "No resolved or refunded disputes",
                "Completed dispute arbitrations and refunds remain auditable here.",
                "resolved"
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
