"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
} from "lucide-react";
import type { RankedThesisMatch } from "@/lib/domain/matching";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

export interface MatchResultCardProps {
  match: RankedThesisMatch;
  rank: number;
  selectedForCompare?: boolean;
  compareDisabled?: boolean;
  onToggleCompare?: (listingId: string) => void;
  titleAs?: "h2" | "h3";
}

export function MatchResultCard({
  match,
  rank,
  selectedForCompare = false,
  compareDisabled = false,
  onToggleCompare,
  titleAs = "h2",
}: MatchResultCardProps) {
  const { listing } = match;
  const revenueMetric = listing.metrics.find((m) => m.key === "REVENUE");
  const profitMetric = listing.metrics.find((m) => m.key === "PROFIT");
  const hasVerified = listing.trustSummary.verifiedCount > 0;
  const strongFit = match.score >= 70;

  return (
    <article aria-label={`#${rank} match: ${listing.teaserTitle}`}>
      <Card className={selectedForCompare ? "border-trust-blue" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded border border-mist bg-cloud px-2 py-2 text-14 font-semibold text-deep-navy tabular-figures">
              #{rank} match
            </span>
            <span
              className={
                strongFit
                  ? "inline-flex items-center rounded border border-verified-green bg-white px-2 py-2 text-14 font-semibold text-verified-green tabular-figures"
                  : "inline-flex items-center rounded border border-mist bg-cloud px-2 py-2 text-14 font-semibold text-deep-navy tabular-figures"
              }
            >
              {match.score} / 100 fit
            </span>
            <span className="text-14 font-medium text-slate">
              {listing.sector}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {listing.isSampleData ? (
              <StatusChip tone="neutral" label="Sample data" />
            ) : null}
            {hasVerified ? (
              <StatusChip
                tone="verified"
                emphasis="solid"
                label={`${listing.trustSummary.verifiedCount} verified`}
              />
            ) : (
              <StatusChip tone="seller-reported" label="Seller-reported" />
            )}
          </div>
        </div>

        <CardTitle as={titleAs} className="pt-2">
          <Link
            href={`/listings/${listing.slug}`}
            className="text-deep-navy no-underline hover:text-trust-blue hover:underline"
          >
            {listing.teaserTitle}
          </Link>
        </CardTitle>

        <CardDescription className="text-ink">{match.headline}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 rounded border border-mist bg-cloud p-4 sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <span className="text-14 text-slate">Asking price</span>
            <span className="text-20 font-semibold text-deep-navy tabular-figures">
              {formatCurrency(listing.askingPrice, {
                currency: listing.currency,
                compact: true,
              })}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-14 text-slate">
              Revenue (
              {revenueMetric?.trust.isVerified
                ? revenueMetric.sourceLabel
                : "Seller-reported"}
              )
            </span>
            <span className="text-20 font-semibold text-deep-navy tabular-figures">
              {revenueMetric
                ? formatCurrency(revenueMetric.value, {
                    currency: listing.currency,
                    compact: true,
                  })
                : "—"}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-14 text-slate">
              Net profit (
              {profitMetric?.trust.isVerified
                ? profitMetric.sourceLabel
                : "Seller-reported"}
              )
            </span>
            <span className="text-20 font-semibold text-deep-navy tabular-figures">
              {profitMetric
                ? formatCurrency(profitMetric.value, {
                    currency: listing.currency,
                    compact: true,
                  })
                : "—"}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-14 text-slate">Location &amp; load</span>
            <span className="inline-flex items-center gap-2 text-14 font-medium text-ink">
              <MapPin className="h-4 w-4 shrink-0 text-slate" aria-hidden="true" />
              <span>{listing.geography}</span>
            </span>
            <span className="inline-flex items-center gap-2 text-14 text-slate tabular-figures">
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{listing.ownerHoursPerWeek} hrs/week</span>
            </span>
          </div>
        </div>

        {/* Section 6: Always show BOTH 'Why this matches' and 'What doesn't fit' */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded border border-mist bg-white p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2
                className={
                  match.reasons.length > 0
                    ? "h-4 w-4 shrink-0 text-verified-green"
                    : "h-4 w-4 shrink-0 text-slate"
                }
                aria-hidden="true"
              />
              <span className="text-16 font-semibold text-deep-navy">
                Why this matches
              </span>
            </div>
            {match.reasons.length > 0 ? (
              <ul className="flex flex-col gap-2 pl-4 text-16 text-ink">
                {match.reasons.map((reason, idx) => (
                  <li key={idx} className="list-disc">
                    {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-16 text-slate">
                Minimal overlap with your stated criteria.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-deep-navy"
                aria-hidden="true"
              />
              <span className="text-16 font-semibold text-deep-navy">
                What doesn&apos;t fit
              </span>
            </div>
            {match.mismatches.length > 0 ? (
              <ul className="flex flex-col gap-2 pl-4 text-16 text-ink">
                {match.mismatches.map((mismatch, idx) => (
                  <li key={idx} className="list-disc">
                    {mismatch}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-16 text-ink">
                No criteria mismatches detected — still inspect seller-reported
                figures and disclosed risks before making an offer.
              </p>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <div className="flex flex-wrap items-center gap-4">
          {onToggleCompare ? (
            <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded border border-mist bg-white px-4 py-2 text-16 font-medium text-deep-navy">
              <input
                type="checkbox"
                checked={selectedForCompare}
                disabled={compareDisabled && !selectedForCompare}
                onChange={() => onToggleCompare(listing.id)}
                className="h-4 w-4 accent-trust-blue"
              />
              <span>
                {selectedForCompare
                  ? "Selected for compare"
                  : compareDisabled
                    ? "Compare limit reached (3)"
                    : "Select to compare"}
              </span>
            </label>
          ) : null}

          <span className="text-14 text-slate tabular-figures">
            {listing.trustSummary.verifiedCount} verified /{" "}
            {listing.trustSummary.sellerReportedCount} seller-reported vitals
          </span>
        </div>

        <Button asChild variant="action">
          <Link href={`/listings/${listing.slug}`}>
            <span>Inspect listing</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
    </article>
  );
}
