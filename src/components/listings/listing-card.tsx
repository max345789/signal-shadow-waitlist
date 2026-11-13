"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, Copy, MapPin } from "lucide-react";
import type { SanitizedListingView } from "@/lib/domain/listings";
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

export function ListingCard({
  listing,
  titleAs = "h3",
}: {
  listing: SanitizedListingView;
  titleAs?: "h2" | "h3";
}) {
  const [copied, setCopied] = useState(false);
  const revenueMetric = listing.metrics.find((m) => m.key === "REVENUE");
  const profitMetric = listing.metrics.find((m) => m.key === "PROFIT");
  const hasVerified = listing.trustSummary.verifiedCount > 0;

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/listings/${listing.slug}`;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-14 font-medium text-slate">{listing.sector}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                title="Copy share link"
                aria-label="Copy share link"
                className="inline-flex items-center gap-1.5 px-2 py-1 text-12 font-medium text-slate hover:text-deep-navy border border-mist rounded bg-white hover:bg-cloud transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-forest-green" aria-hidden="true" />
                    <span className="text-forest-green">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Share</span>
                  </>
                )}
              </button>
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

          <CardDescription>{listing.teaserSummary}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 rounded border border-mist bg-cloud p-4 sm:grid-cols-3">
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
                Trailing revenue (
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
          </div>

          <div className="flex flex-wrap items-center gap-4 text-14 text-slate">
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{listing.geography}</span>
            </span>
            <span className="inline-flex items-center gap-2 tabular-figures">
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{listing.ownerHoursPerWeek} hrs/week owner load</span>
            </span>
          </div>
        </CardContent>
      </div>

      <CardFooter>
        <span className="text-14 text-slate tabular-figures">
          {listing.trustSummary.verifiedCount} verified /{" "}
          {listing.trustSummary.sellerReportedCount} seller-reported
          {listing.trustSummary.expiredOrFailedCount > 0
            ? ` / ${listing.trustSummary.expiredOrFailedCount} expired/failed`
            : ""}{" "}
          vitals
        </span>
        <Button asChild variant="action">
          <Link href={`/listings/${listing.slug}`}>
            <span>Inspect listing</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
