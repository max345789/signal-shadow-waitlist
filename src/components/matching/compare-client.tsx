"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  MapPin,
  X,
} from "lucide-react";
import type {
  EvaluatedMetricView,
  MetricKeyValue,
  SanitizedListingView,
} from "@/lib/domain/listings";
import type {
  MatchEvaluationResult,
  SavedThesisRecord,
} from "@/lib/domain/matching";
import {
  formatCount,
  formatCurrency,
  formatPercentage,
  type CurrencyCode,
} from "@/lib/format/currency";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardStateEmpty,
  CardStateError,
  CardStateLoading,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";

function formatMetricByUnit(
  metric: EvaluatedMetricView | undefined,
  fallbackCurrency: CurrencyCode
): string {
  if (!metric) return "—";
  switch (metric.unit) {
    case "CURRENCY":
      return formatCurrency(metric.value, {
        currency: metric.currency ?? fallbackCurrency,
        compact: true,
      });
    case "PERCENT":
      return formatPercentage(metric.value);
    case "COUNT":
      return formatCount(metric.value);
  }
}

function MetricCompareCell({
  listing,
  metricKey,
  label,
  allowCautionAccent,
  allowRiskAccent,
}: {
  listing: SanitizedListingView;
  metricKey: MetricKeyValue;
  label: string;
  allowCautionAccent: boolean;
  allowRiskAccent: boolean;
}) {
  const metric = listing.metrics.find((m) => m.key === metricKey);
  const formatted = formatMetricByUnit(metric, listing.currency);

  const chipTone = !metric
    ? "seller-reported"
    : metric.trust.isVerified
      ? "verified"
      : metric.trust.effectiveState === "expired" && allowCautionAccent
        ? "caution"
        : metric.trust.effectiveState === "failed" && allowRiskAccent
          ? "risk"
          : "seller-reported";

  return (
    <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
      <span className="text-14 font-medium text-slate">
        {listing.teaserTitle} — {label}
      </span>
      <span className="text-20 font-semibold text-deep-navy tabular-figures">
        {formatted}
      </span>
      {metric ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip
            tone={chipTone}
            emphasis={metric.trust.isVerified ? "solid" : "outline"}
            label={metric.trust.label}
          />
          <span className="text-14 text-slate">
            {metric.trust.isVerified
              ? `${metric.sourceLabel} · ${metric.trust.lastVerifiedLabel ?? "Verified"}`
              : metric.trust.detail}
          </span>
        </div>
      ) : (
        <span className="text-14 text-slate">Not provided</span>
      )}
    </div>
  );
}

export function CompareClient({
  initialListings,
  availableListings,
  initialThesis,
  initialEvaluationsByBusinessId,
  savedTheses,
  initialTooManyError,
  initialExcludedCount = 0,
}: {
  initialListings: SanitizedListingView[];
  availableListings: SanitizedListingView[];
  initialThesis: SavedThesisRecord | null;
  initialEvaluationsByBusinessId: Record<string, MatchEvaluationResult>;
  savedTheses: SavedThesisRecord[];
  initialTooManyError?: string | null;
  initialExcludedCount?: number;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = React.useState<string[]>(() =>
    initialListings.map((l) => l.id)
  );
  const [selectedListings, setSelectedListings] =
    React.useState<SanitizedListingView[]>(initialListings);
  const [selectedThesisId, setSelectedThesisId] = React.useState<string>(
    initialThesis?.id ?? ""
  );
  const [activeThesis, setActiveThesis] = React.useState<SavedThesisRecord | null>(
    initialThesis
  );
  const [evaluations, setEvaluations] = React.useState<
    Record<string, MatchEvaluationResult>
  >(initialEvaluationsByBusinessId);
  const [excludedCount, setExcludedCount] = React.useState<number>(initialExcludedCount);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(
    initialTooManyError ?? null
  );
  const requestSeqRef = React.useRef(0);

  const hasAnyVerified = selectedListings.some(
    (l) => l.trustSummary.verifiedCount > 0
  );
  const hasExpired = selectedListings.some((l) =>
    l.metrics.some((m) => m.trust.effectiveState === "expired")
  );
  const hasFailed = selectedListings.some((l) =>
    l.metrics.some((m) => m.trust.effectiveState === "failed")
  );
  const allowCautionAccent = !hasAnyVerified && !hasFailed;
  const allowRiskAccent = !hasAnyVerified && !hasExpired;

  async function syncSelection(nextIds: string[], nextThesisId: string) {
    if (nextIds.length > 3) {
      setError("You can compare up to 3 businesses side by side.");
      return;
    }

    const reqSeq = ++requestSeqRef.current;
    setSelectedIds(nextIds);
    setExcludedCount(0);

    // Optimistically reflect selection immediately from availableListings
    const availableById = new Map(availableListings.map((l) => [l.id, l]));
    const optimisticListings = nextIds
      .map((id) => availableById.get(id))
      .filter((x): x is SanitizedListingView => Boolean(x));
    setSelectedListings(optimisticListings);

    const params = new URLSearchParams();
    if (nextIds.length > 0) params.set("ids", nextIds.join(","));
    if (nextThesisId) params.set("thesisId", nextThesisId);
    const qs = params.toString();
    router.replace(qs ? `/compare?${qs}` : "/compare", { scroll: false });

    if (nextIds.length === 0) {
      setSelectedListings([]);
      setEvaluations({});
      setActiveThesis(
        nextThesisId ? savedTheses.find((t) => t.id === nextThesisId) ?? null : null
      );
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compare?${params.toString()}`);
      const data = await res.json();
      if (reqSeq !== requestSeqRef.current) return;
      if (!res.ok) {
        setError(data.error ?? "Could not load businesses for comparison.");
        return;
      }
      const nextListings: SanitizedListingView[] = data.listings ?? [];
      setSelectedListings(nextListings);
      setSelectedIds(nextListings.map((l) => l.id));
      setExcludedCount(Number(data.excludedCount ?? 0));
      setActiveThesis(data.thesis ?? null);
      setEvaluations(data.evaluationsByBusinessId ?? {});
    } catch {
      if (reqSeq !== requestSeqRef.current) return;
      setError("Network error while refreshing comparison.");
    } finally {
      if (reqSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }

  function handleToggleListing(listingId: string) {
    if (selectedIds.includes(listingId)) {
      const next = selectedIds.filter((id) => id !== listingId);
      void syncSelection(next, selectedThesisId);
    } else if (selectedIds.length < 3) {
      const next = [...selectedIds, listingId];
      void syncSelection(next, selectedThesisId);
    }
  }

  function handleThesisChange(nextThesisId: string) {
    setSelectedThesisId(nextThesisId);
    void syncSelection(selectedIds, nextThesisId);
  }

  function handleCompareTopThree() {
    const topIds = availableListings.slice(0, 3).map((l) => l.id);
    void syncSelection(topIds, selectedThesisId);
  }

  const gridColsClass =
    selectedListings.length === 1
      ? "grid-cols-1"
      : selectedListings.length === 2
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1 md:grid-cols-3";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <StatusChip tone="neutral" label="Phase 2: Side-by-Side Compare" className="w-fit" />
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Compare businesses side by side
          </h1>
          <p className="max-w-[760px] text-16 text-slate">
            Compare up to 3 approved businesses across asking price, verified vs
            seller-reported vitals, owner hours, disclosed risks, and optional thesis
            mismatches.
          </p>
        </div>

        <Button asChild variant="secondary">
          <Link href="/matches">Back to matches</Link>
        </Button>
      </div>

      {/* Selector Panel */}
      {excludedCount > 0 ? (
        <div
          role="status"
          className="rounded border border-mist bg-white p-4 text-16 text-deep-navy"
        >
          {excludedCount}{" "}
          {excludedCount === 1
            ? "requested listing was excluded because only Admin-approved listings can be compared."
            : "requested listings were excluded because only Admin-approved listings can be compared."}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle as="h2">Select up to 3 approved businesses</CardTitle>
            <span className="text-14 font-medium text-deep-navy tabular-figures">
              {selectedIds.length} / 3 selected
            </span>
          </div>
          <CardDescription>
            {selectedIds.length >= 3
              ? "Maximum 3 businesses selected. Uncheck one to compare another listing."
              : "Pick up to 3 businesses below, or load the first 3 approved listings automatically."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {savedTheses.length > 0 ? (
            <div className="max-w-[440px]">
              <Select
                label="Overlay thesis fit & mismatches (optional)"
                value={selectedThesisId}
                onChange={(e) => handleThesisChange(e.target.value)}
              >
                <option value="">No thesis overlay</option>
                {savedTheses.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {availableListings.length === 0 ? (
            <CardStateEmpty
              title="No approved listings available to compare"
              description="Approved listings will appear here once Admin review is complete."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {availableListings.map((item) => {
                const isChecked = selectedIds.includes(item.id);
                const disabled = !isChecked && selectedIds.length >= 3;
                return (
                  <label
                    key={item.id}
                    className={
                      isChecked
                        ? "flex min-h-12 cursor-pointer items-start gap-3 rounded border border-trust-blue bg-cloud p-4 text-16 text-ink"
                        : disabled
                          ? "flex min-h-12 cursor-not-allowed items-start gap-3 rounded border border-mist bg-cloud p-4 text-16 text-slate"
                          : "flex min-h-12 cursor-pointer items-start gap-3 rounded border border-mist bg-white p-4 text-16 text-ink hover:border-trust-blue"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => handleToggleListing(item.id)}
                      className="mt-1 h-4 w-4 shrink-0 accent-trust-blue"
                    />
                    <div className="flex flex-1 flex-col gap-2">
                      <span className="font-medium text-deep-navy">
                        {item.teaserTitle}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-14 text-slate tabular-figures">
                        <span>{item.sector}</span>
                        <span>·</span>
                        <span>
                          {formatCurrency(item.askingPrice, {
                            currency: item.currency,
                            compact: true,
                          })}
                        </span>
                        <span>·</span>
                        <span>{item.trustSummary.verifiedCount} verified</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Comparison Output */}
      {loading ? (
        <CardStateLoading
          title="Loading side-by-side comparison"
          description="Checking verified vs seller-reported metrics and NDA redaction status."
        />
      ) : error ? (
        <CardStateError
          title="Comparison limit or loading error"
          message={error}
          retryLabel="Reset comparison"
          onRetry={() => void syncSelection([], selectedThesisId)}
        />
      ) : selectedListings.length === 0 ? (
        <CardStateEmpty
          title="No businesses selected for comparison"
          description="Choose 1 to 3 approved listings above to compare verified vitals, asking price, owner workload, and risks side by side."
          actionLabel={
            availableListings.length > 0 ? "Compare top 3 listings" : undefined
          }
          onAction={
            availableListings.length > 0 ? handleCompareTopThree : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* 1. Overview & Asking Price */}
          <section aria-labelledby="compare-overview-heading">
            <Card>
              <CardHeader>
                <CardTitle id="compare-overview-heading" as="h2">
                  1. Overview, asking price &amp; NDA redaction
                </CardTitle>
                <CardDescription>
                  Confidential brand names and domains remain hidden until an NDA is
                  signed.
                </CardDescription>
              </CardHeader>
              <CardContent className={`grid gap-4 ${gridColsClass}`}>
                {selectedListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex flex-col justify-between gap-4 rounded border border-mist bg-white p-4"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-14 font-medium text-slate">
                          {listing.sector}
                        </span>
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => handleToggleListing(listing.id)}
                          aria-label={`Remove ${listing.teaserTitle} from comparison`}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                          <span>Remove</span>
                        </Button>
                      </div>

                      <h3 className="font-serif text-20 font-semibold text-deep-navy">
                        <Link
                          href={`/listings/${listing.slug}`}
                          className="text-deep-navy no-underline hover:text-trust-blue hover:underline"
                        >
                          {listing.teaserTitle}
                        </Link>
                      </h3>

                      <div className="flex flex-wrap gap-2">
                        {listing.trustSummary.verifiedCount > 0 ? (
                          <StatusChip
                            tone="verified"
                            emphasis="solid"
                            label={`${listing.trustSummary.verifiedCount} verified`}
                          />
                        ) : (
                          <StatusChip
                            tone="seller-reported"
                            label="Seller-reported only"
                          />
                        )}
                      </div>

                      <div className="rounded border border-mist bg-cloud p-4">
                        <span className="text-14 text-slate">Asking price</span>
                        <div className="text-28 font-semibold text-deep-navy tabular-figures">
                          {formatCurrency(listing.askingPrice, {
                            currency: listing.currency,
                            compact: true,
                          })}
                        </div>
                        {listing.valuationLow && listing.valuationHigh ? (
                          <span className="text-14 text-slate tabular-figures">
                            Guided range:{" "}
                            {formatCurrency(listing.valuationLow, {
                              currency: listing.currency,
                              compact: true,
                            })}{" "}
                            –{" "}
                            {formatCurrency(listing.valuationHigh, {
                              currency: listing.currency,
                              compact: true,
                            })}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 text-14 text-slate">
                        <Lock className="h-4 w-4 shrink-0 text-trust-blue" aria-hidden="true" />
                        <span>{listing.redactedPlaceholder}</span>
                      </div>
                    </div>

                    <Button asChild variant="action">
                      <Link href={`/listings/${listing.slug}`}>
                        <span>Inspect listing</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {/* 2. Thesis Fit & Mismatches (when active thesis selected) */}
          {activeThesis ? (
            <section aria-labelledby="compare-thesis-fit-heading">
              <Card>
                <CardHeader>
                  <CardTitle id="compare-thesis-fit-heading" as="h2">
                    2. Fit against &ldquo;{activeThesis.title}&rdquo;
                  </CardTitle>
                  <CardDescription>
                    Comparing fit scores, matching reasons, and explicit mismatches side by
                    side.
                  </CardDescription>
                </CardHeader>
                <CardContent className={`grid gap-4 ${gridColsClass}`}>
                  {selectedListings.map((listing) => {
                    const ev = evaluations[listing.id];
                    return (
                      <div
                        key={listing.id}
                        className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-14 font-medium text-slate">
                            {listing.sector}
                          </span>
                          <span className="rounded border border-deep-navy bg-white px-2 py-2 text-14 font-semibold text-deep-navy tabular-figures">
                            {ev ? `${ev.score} / 100 fit` : "—"}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-trust-blue"
                              aria-hidden="true"
                            />
                            <span className="text-16 font-semibold text-deep-navy">
                              Why this matches
                            </span>
                          </div>
                          {ev && ev.reasons.length > 0 ? (
                            <ul className="flex flex-col gap-2 pl-4 text-16 text-ink">
                              {ev.reasons.map((r, i) => (
                                <li key={i} className="list-disc">
                                  {r}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-16 text-slate">No matching reasons.</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 border-t border-mist pt-4">
                          <div className="flex items-center gap-2">
                            <AlertTriangle
                              className="h-4 w-4 shrink-0 text-deep-navy"
                              aria-hidden="true"
                            />
                            <span className="text-16 font-semibold text-deep-navy">
                              What doesn&apos;t fit
                            </span>
                          </div>
                          {ev && ev.mismatches.length > 0 ? (
                            <ul className="flex flex-col gap-2 pl-4 text-16 text-ink">
                              {ev.mismatches.map((m, i) => (
                                <li key={i} className="list-disc">
                                  {m}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-16 text-ink">
                              No hard-criteria mismatches flagged.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {/* 3. Financial Vitals (Verified vs Seller-reported) */}
          <section aria-labelledby="compare-vitals-heading">
            <Card>
              <CardHeader>
                <CardTitle id="compare-vitals-heading" as="h2">
                  {activeThesis ? "3." : "2."} Verified vs seller-reported financial vitals
                </CardTitle>
                <CardDescription>
                  Verified green marks render only from active third-party verification
                  records.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h3 className="font-serif text-20 font-semibold text-deep-navy">
                    Trailing 12m revenue
                  </h3>
                  <div className={`grid gap-4 ${gridColsClass}`}>
                    {selectedListings.map((listing) => (
                      <MetricCompareCell
                        key={listing.id}
                        listing={listing}
                        metricKey="REVENUE"
                        label="Revenue"
                        allowCautionAccent={allowCautionAccent}
                        allowRiskAccent={allowRiskAccent}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-serif text-20 font-semibold text-deep-navy">
                    Trailing 12m net profit
                  </h3>
                  <div className={`grid gap-4 ${gridColsClass}`}>
                    {selectedListings.map((listing) => (
                      <MetricCompareCell
                        key={listing.id}
                        listing={listing}
                        metricKey="PROFIT"
                        label="Net profit"
                        allowCautionAccent={allowCautionAccent}
                        allowRiskAccent={allowRiskAccent}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-serif text-20 font-semibold text-deep-navy">
                    Annual growth &amp; monthly churn
                  </h3>
                  <div className={`grid gap-4 ${gridColsClass}`}>
                    {selectedListings.map((listing) => (
                      <div key={listing.id} className="flex flex-col gap-4">
                        <MetricCompareCell
                          listing={listing}
                          metricKey="GROWTH"
                          label="Annual growth"
                          allowCautionAccent={allowCautionAccent}
                          allowRiskAccent={allowRiskAccent}
                        />
                        <MetricCompareCell
                          listing={listing}
                          metricKey="CHURN"
                          label="Monthly churn"
                          allowCautionAccent={allowCautionAccent}
                          allowRiskAccent={allowRiskAccent}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-serif text-20 font-semibold text-deep-navy">
                    Monthly traffic &amp; active customers
                  </h3>
                  <div className={`grid gap-4 ${gridColsClass}`}>
                    {selectedListings.map((listing) => (
                      <div key={listing.id} className="flex flex-col gap-4">
                        <MetricCompareCell
                          listing={listing}
                          metricKey="TRAFFIC"
                          label="Monthly visitors"
                          allowCautionAccent={allowCautionAccent}
                          allowRiskAccent={allowRiskAccent}
                        />
                        <MetricCompareCell
                          listing={listing}
                          metricKey="CUSTOMERS"
                          label="Active customers"
                          allowCautionAccent={allowCautionAccent}
                          allowRiskAccent={allowRiskAccent}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 4. Operations, Risks & Assets */}
          <section aria-labelledby="compare-operations-heading">
            <Card>
              <CardHeader>
                <CardTitle id="compare-operations-heading" as="h2">
                  {activeThesis ? "4." : "3."} Owner workload, risks &amp; included assets
                </CardTitle>
              </CardHeader>
              <CardContent className={`grid gap-4 ${gridColsClass}`}>
                {selectedListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4"
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-14 font-medium text-slate">
                        {listing.teaserTitle}
                      </span>
                      <div className="flex items-center gap-2 text-16 font-semibold text-deep-navy tabular-figures">
                        <Clock className="h-4 w-4 text-trust-blue" aria-hidden="true" />
                        <span>{listing.ownerHoursPerWeek} hrs/week owner workload</span>
                      </div>
                      <div className="flex items-center gap-2 text-16 text-ink">
                        <MapPin className="h-4 w-4 text-slate" aria-hidden="true" />
                        <span>{listing.geography}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-mist pt-4">
                      <span className="text-14 font-semibold text-deep-navy">
                        Disclosed risks
                      </span>
                      <p className="text-16 text-ink">{listing.risksSummary}</p>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-mist pt-4">
                      <span className="text-14 font-semibold text-deep-navy">
                        Tech stack &amp; assets ({listing.assetsIncluded.length})
                      </span>
                      <p className="text-16 text-ink">
                        {listing.techStack.length > 0
                          ? listing.techStack.join(", ")
                          : "Operational asset transfer"}
                      </p>
                      <p className="text-16 text-slate">
                        Includes: {listing.assetsIncluded.join("; ")}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
