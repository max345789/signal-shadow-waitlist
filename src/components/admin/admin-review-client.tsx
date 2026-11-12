"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, Lock } from "lucide-react";
import type { AdminReviewDecision, SanitizedListingView } from "@/lib/domain/listings";
import { formatCurrency } from "@/lib/format/currency";
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

export function AdminReviewClient({
  initialListings,
}: {
  initialListings: SanitizedListingView[];
}) {
  const [listings, setListings] =
    React.useState<SanitizedListingView[]>(initialListings);
  const [notesById, setNotesById] = React.useState<Record<string, string>>({});
  const [fieldErrorsById, setFieldErrorsById] = React.useState<
    Record<string, string | undefined>
  >({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  async function refreshQueue() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/listings");
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.error ?? "Could not load Admin review queue.");
        return;
      }
      setListings(data.listings ?? []);
    } catch {
      setFetchError("Network error while refreshing review queue.");
    } finally {
      setLoading(false);
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

    setBusyId(id);
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
      setBusyId(null);
    }
  }

  const pendingListings = listings.filter((l) => l.status === "PENDING_REVIEW");
  const approvedListings = listings.filter((l) => l.status === "APPROVED");
  const flaggedOrRejected = listings.filter(
    (l) => l.status === "FLAGGED" || l.status === "REJECTED"
  );

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
          const isBusy = busyId === item.id;
          const noteError = fieldErrorsById[item.id];
          const canApprove =
            item.status === "PENDING_REVIEW" || item.status === "FLAGGED";
          const canFlag =
            item.status === "PENDING_REVIEW" || item.status === "APPROVED";
          const canReject =
            item.status === "PENDING_REVIEW" || item.status === "FLAGGED";

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
                      <dd className="text-16 font-medium text-ink">
                        {item.redactedName ?? "Not provided"}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-2">
                      <dt className="text-14 text-slate">Primary domain</dt>
                      <dd className="text-16 font-medium text-ink">
                        {item.redactedDomain ?? "Not provided"}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-2">
                      <dt className="text-14 text-slate">Customers summary</dt>
                      <dd className="text-16 text-ink">
                        {item.redactedCustomers ?? "Not provided"}
                      </dd>
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
                      loading={isBusy}
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

      {feedback ? (
        <div
          role="status"
          className="rounded border border-mist bg-white p-4 text-16 font-medium text-deep-navy"
        >
          {feedback}
        </div>
      ) : null}

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
    </div>
  );
}
