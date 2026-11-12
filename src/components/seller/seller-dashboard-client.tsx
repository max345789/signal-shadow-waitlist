"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Edit3, PlusCircle } from "lucide-react";
import type { SanitizedListingView } from "@/lib/domain/listings";
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
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function statusTone(status: SanitizedListingView["status"]): StatusChipTone {
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

function statusLabel(status: SanitizedListingView["status"]): string {
  switch (status) {
    case "APPROVED":
      return "Approved";
    case "PENDING_REVIEW":
      return "Pending review";
    case "FLAGGED":
      return "Flagged — action needed";
    case "REJECTED":
      return "Rejected";
    case "DRAFT":
      return "Draft";
    case "ARCHIVED":
      return "Archived";
  }
}

export function SellerDashboardClient({
  initialListings,
}: {
  initialListings: SanitizedListingView[];
}) {
  const [listings, setListings] =
    React.useState<SanitizedListingView[]>(initialListings);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function refreshListings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/listings?scope=mine");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load your seller listings.");
        return;
      }
      setListings(data.listings ?? []);
    } catch {
      setError("Network error while refreshing seller dashboard.");
    } finally {
      setLoading(false);
    }
  }

  const draftsAndPending = listings.filter(
    (l) => l.status === "DRAFT" || l.status === "PENDING_REVIEW"
  );
  const approved = listings.filter((l) => l.status === "APPROVED");
  const flaggedOrRejected = listings.filter(
    (l) => l.status === "FLAGGED" || l.status === "REJECTED"
  );

  function renderListingRows(items: SanitizedListingView[], emptyTitle: string, emptyDescription: string) {
    if (loading) {
      return (
        <CardStateLoading
          title="Refreshing your listings"
          description="Checking current review statuses and verification records."
        />
      );
    }

    if (error) {
      return <CardStateError message={error} onRetry={() => void refreshListings()} />;
    }

    if (items.length === 0) {
      return (
        <CardStateEmpty
          title={emptyTitle}
          description={emptyDescription}
        />
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    tone={statusTone(item.status)}
                    label={statusLabel(item.status)}
                  />
                  {item.isSampleData ? (
                    <StatusChip tone="neutral" label="Sample data" />
                  ) : null}
                </div>
                <span className="text-14 text-slate tabular-figures">
                  Asking:{" "}
                  <strong className="font-semibold text-deep-navy">
                    {formatCurrency(item.askingPrice, {
                      currency: item.currency,
                      compact: true,
                    })}
                  </strong>
                </span>
              </div>
              <CardTitle className="pt-2">{item.teaserTitle}</CardTitle>
              <CardDescription>{item.teaserSummary}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 rounded border border-mist bg-cloud p-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <span className="text-14 text-slate">Confidential entity</span>
                  <span className="text-16 font-medium text-ink">
                    {item.redactedName ?? item.redactedPlaceholder}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-14 text-slate">Confidential domain</span>
                  <span className="text-16 font-medium text-ink">
                    {item.redactedDomain ?? item.redactedPlaceholder}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-14 text-slate">Metric verification</span>
                  <span className="text-16 font-medium text-ink tabular-figures">
                    {item.trustSummary.verifiedCount} verified /{" "}
                    {item.trustSummary.sellerReportedCount} seller-reported
                  </span>
                </div>
              </div>

              {item.reviewerNote ? (
                <div className="rounded border border-mist bg-white p-4">
                  <span className="text-14 font-semibold text-deep-navy">
                    Reviewer note
                  </span>
                  <p className="pt-2 text-16 text-ink">{item.reviewerNote}</p>
                </div>
              ) : null}
            </CardContent>

            <CardFooter>
              <Button asChild variant="secondary">
                <Link href={`/sell?listingId=${item.id}`}>
                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                  <span>Edit listing</span>
                </Link>
              </Button>
              <Button asChild variant="action">
                <Link href={`/listings/${item.slug}`}>
                  <span>Preview listing</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Seller dashboard
          </h1>
          <p className="max-w-[720px] text-16 text-slate">
            Track your listing review status, edit drafts, inspect reviewer notes, and
            preview how verified vs seller-reported metrics appear to buyers.
          </p>
        </div>

        <Button asChild variant="primary">
          <Link href="/sell">
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            <span>Create new listing</span>
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList aria-label="Filter your listings by status">
          <TabsTrigger value="pending">
            Drafts &amp; pending ({draftsAndPending.length})
          </TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="action-needed">
            Flagged &amp; rejected ({flaggedOrRejected.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {renderListingRows(
            draftsAndPending,
            "No drafts or pending submissions",
            "Create a guided business listing to submit it for Admin verification."
          )}
        </TabsContent>

        <TabsContent value="approved">
          {renderListingRows(
            approved,
            "No approved listings yet",
            "Listings approved by an Admin reviewer appear live in the public directory."
          )}
        </TabsContent>

        <TabsContent value="action-needed">
          {renderListingRows(
            flaggedOrRejected,
            "No flagged or rejected listings",
            "Any listings requiring edits or redaction fixes from Admin review appear here."
          )}
        </TabsContent>
      </Tabs>

      {/* Phase 2 / 4 clear roadmap empty states */}
      <section aria-label="Upcoming seller modules" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CardStateEmpty
          title="Matched buyers (Phase 2)"
          description="Ranked buyer matches with fit reasons and mismatches unlock once Phase 2 thesis matching is active."
        />
        <CardStateEmpty
          title="Active deal rooms (Phase 4)"
          description="NDA execution, watermarked documents, and buyer offers unlock in Phase 4 deal rooms."
        />
      </section>
    </div>
  );
}
