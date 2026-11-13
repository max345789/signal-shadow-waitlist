"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Info,
  Lock,
  MessageSquare,
  Mic,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type {
  ListingQuestionRecord,
  SanitizedListingView,
} from "@/lib/domain/listings";
import { formatCurrency } from "@/lib/format/currency";
import { MetricTile } from "@/components/domain/metric-tile";
import { FinancialChart } from "@/components/listings/financial-chart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardStateEmpty,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { ReportModal } from "@/components/reports/report-modal";

export function ListingDetailClient({
  initialListing,
  referenceNow,
  isAuthenticated,
  canOpenDealRoom = false,
  hasTwoFactorVerified = false,
  existingDealRoomId = null,
}: {
  initialListing: SanitizedListingView;
  referenceNow: string;
  isAuthenticated: boolean;
  canOpenDealRoom?: boolean;
  hasTwoFactorVerified?: boolean;
  existingDealRoomId?: string | null;
}) {
  const router = useRouter();
  const [listing, setListing] = React.useState<SanitizedListingView>(initialListing);
  const [effectiveNow, setEffectiveNow] = React.useState<string>(referenceNow);
  const [openingDealRoom, setOpeningDealRoom] = React.useState(false);
  const [dealRoomError, setDealRoomError] = React.useState<string | null>(null);
  const [questionText, setQuestionText] = React.useState("");
  const [questionError, setQuestionError] = React.useState<string | null>(null);
  const [questionSubmitting, setQuestionSubmitting] = React.useState(false);

  const [answerDrafts, setAnswerDrafts] = React.useState<Record<string, string>>({});
  const [answeringId, setAnsweringId] = React.useState<string | null>(null);
  const [answerErrorsById, setAnswerErrorsById] = React.useState<
    Record<string, string | undefined>
  >({});
  const [refreshingVitals, setRefreshingVitals] = React.useState(false);
  const [refreshStatusMessage, setRefreshStatusMessage] = React.useState<string | null>(null);

  const [detailRequestSent, setDetailRequestSent] = React.useState(false);
  const [detailRequestLoading, setDetailRequestLoading] = React.useState(false);
  const [confidentialityChecked, setConfidentialityChecked] = React.useState(false);
  const [sellerApproved, setSellerApproved] = React.useState(false);

  async function handleRequestFullDetails() {
    setDetailRequestLoading(true);
    try {
      await fetch(`/api/listings/${listing.id}/detail-request`, {
        method: "POST",
      });
      setDetailRequestSent(true);
    } catch {
      setDetailRequestSent(true);
    } finally {
      setDetailRequestLoading(false);
    }
  }

  const verifiedMetrics = listing.metrics.filter((m) => m.trust.isVerified);
  const unverifiedMetrics = listing.metrics.filter((m) => !m.trust.isVerified);
  const hasAnyVerified = verifiedMetrics.length > 0;
  const hasExpired = unverifiedMetrics.some(
    (m) => m.trust.effectiveState === "expired"
  );
  const hasFailed = unverifiedMetrics.some(
    (m) => m.trust.effectiveState === "failed"
  );
  const allowCautionAccent = !hasAnyVerified && !hasFailed;
  const allowRiskAccent = !hasAnyVerified && !hasExpired;

  async function handleOpenDealRoom() {
    if (existingDealRoomId) {
      router.push(`/deals/${existingDealRoomId}`);
      return;
    }
    setOpeningDealRoom(true);
    setDealRoomError(null);
    try {
      const res = await fetch("/api/deal-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: listing.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDealRoomError(data.error ?? "Unable to open deal room.");
        return;
      }
      router.push(`/deals/${data.dealRoom.id}`);
    } catch {
      setDealRoomError("Network error while opening deal room.");
    } finally {
      setOpeningDealRoom(false);
    }
  }

  async function handleRefreshVitals() {
    setRefreshingVitals(true);
    setRefreshStatusMessage(null);
    try {
      const refreshRes = await fetch("/api/verification/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: listing.id, force: true }),
      });
      const refreshData = await refreshRes.json();
      if (!refreshRes.ok) {
        setRefreshStatusMessage(
          refreshData.error ?? "Unable to refresh connected vitals."
        );
        return;
      }
      const listingRes = await fetch(`/api/listings/${listing.id}`);
      if (listingRes.ok) {
        const listingData = await listingRes.json();
        if (listingData.listing) {
          setListing(listingData.listing);
          setEffectiveNow(new Date().toISOString());
        }
      }
      setRefreshStatusMessage(
        `Sync complete: ${refreshData.refreshedCount ?? 0} refreshed, ${refreshData.expiredCount ?? 0} expired, ${refreshData.failedCount ?? 0} failed.`
      );
    } catch {
      setRefreshStatusMessage("Network error while refreshing vitals.");
    } finally {
      setRefreshingVitals(false);
    }
  }

  async function handleAskQuestion(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = questionText.trim();
    if (trimmed.length < 10) {
      setQuestionError("Enter a specific question of at least 10 characters.");
      return;
    }

    setQuestionSubmitting(true);
    setQuestionError(null);
    try {
      const res = await fetch(`/api/listings/${listing.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuestionError(data.error ?? "Could not post your question.");
        return;
      }
      const created: ListingQuestionRecord = data.question;
      setListing((prev) => ({
        ...prev,
        questions: [created, ...prev.questions],
      }));
      setQuestionText("");
    } catch {
      setQuestionError("Network error while posting question.");
    } finally {
      setQuestionSubmitting(false);
    }
  }

  async function handleAnswerQuestion(questionId: string) {
    const draft = (answerDrafts[questionId] ?? "").trim();
    if (draft.length < 5) {
      setAnswerErrorsById((prev) => ({
        ...prev,
        [questionId]: "Answer must be at least 5 characters.",
      }));
      return;
    }

    setAnsweringId(questionId);
    setAnswerErrorsById((prev) => ({ ...prev, [questionId]: undefined }));
    try {
      const res = await fetch(
        `/api/listings/${listing.id}/questions/${questionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: draft }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setAnswerErrorsById((prev) => ({
          ...prev,
          [questionId]: data.error ?? "Could not save answer.",
        }));
        return;
      }
      const updated: ListingQuestionRecord = data.question;
      setListing((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => (q.id === questionId ? updated : q)),
      }));
      setAnswerDrafts((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
    } catch {
      setAnswerErrorsById((prev) => ({
        ...prev,
        [questionId]: "Network error while saving answer.",
      }));
    } finally {
      setAnsweringId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Listing Header Summary */}
      <Card>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="neutral" label={listing.sector} />
              <StatusChip tone="neutral" label={listing.geography} />
              {listing.status !== "APPROVED" ? (
                <StatusChip
                  tone={
                    hasAnyVerified
                      ? "neutral"
                      : listing.status === "FLAGGED" || listing.status === "REJECTED"
                        ? "risk"
                        : "pending"
                  }
                  label={`Status: ${listing.status.replace("_", " ")}`}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {listing.canEdit ? (
                <Button asChild variant="secondary">
                  <Link href={`/sell?listingId=${listing.id}`}>Edit listing</Link>
                </Button>
              ) : null}

              {listing.status === "APPROVED" && !listing.canEdit ? (
                existingDealRoomId ? (
                  <Button asChild variant="primary">
                    <Link href={`/deals/${existingDealRoomId}`}>
                      <span>Enter deal room</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : canOpenDealRoom && hasTwoFactorVerified ? (
                  <Button
                    type="button"
                    variant="primary"
                    loading={openingDealRoom}
                    loadingLabel="Opening room..."
                    onClick={() => void handleOpenDealRoom()}
                  >
                    <span>Open deal room</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : isAuthenticated && hasTwoFactorVerified && !canOpenDealRoom ? (
                  <StatusChip
                    tone="neutral"
                    label="Buyer account required for deal room"
                  />
                ) : (
                  <Button asChild variant="action">
                    <Link href="/auth/signin">
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {isAuthenticated
                          ? "Verify 2FA to open deal room"
                          : "Sign in & 2FA for deal room"}
                      </span>
                    </Link>
                  </Button>
                )
              ) : null}
            </div>
          </div>

          {dealRoomError ? (
            <div
              role="alert"
              className={
                allowRiskAccent
                  ? "rounded border border-brick-red bg-white p-4 text-16 font-medium text-brick-red"
                  : "rounded border border-deep-navy bg-white p-4 text-16 font-medium text-deep-navy"
              }
            >
              {dealRoomError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-2 lg:col-span-2">
              <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
                {listing.teaserTitle}
              </h1>
              <p className="text-16 text-ink">{listing.teaserSummary}</p>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded border border-mist bg-cloud p-4">
              <div className="flex flex-col gap-2">
                <span className="text-14 font-medium text-slate">
                  Asking price ({listing.currency})
                </span>
                <span className="text-28 font-semibold text-deep-navy tabular-figures sm:text-40">
                  {formatCurrency(listing.askingPrice, {
                    currency: listing.currency,
                    compact: true,
                  })}
                </span>
                <span className="text-14 text-slate tabular-figures">
                  Exact: {formatCurrency(listing.askingPrice, { currency: listing.currency })}
                </span>
              </div>

              {listing.valuationLow && listing.valuationHigh ? (
                <div className="border-t border-mist pt-4 text-14 text-slate tabular-figures">
                  Guided estimate range:{" "}
                  <strong className="font-medium text-ink">
                    {formatCurrency(listing.valuationLow, {
                      currency: listing.currency,
                      compact: true,
                    })}{" "}
                    –{" "}
                    {formatCurrency(listing.valuationHigh, {
                      currency: listing.currency,
                      compact: true,
                    })}
                  </strong>
                </div>
              ) : null}
            </div>
          </div>

          {/* Redaction / Confidential Details Gate */}
          <div className="rounded border border-mist bg-cloud p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-trust-blue" aria-hidden="true" />
                <span className="text-16 font-semibold text-deep-navy">
                  {listing.sensitiveDetailsUnlocked || sellerApproved
                    ? listing.canEdit || listing.canReview
                      ? "Confidential details (visible only to listing owner & reviewers)"
                      : "Confidential details (unlocked upon seller approval)"
                    : "Confidential details redacted until seller approval"}
                </span>
              </div>
              <span className="text-14 text-slate">
                Owner workload: {listing.ownerHoursPerWeek} hrs/week
              </span>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <dt className="text-14 font-medium text-slate">Legal / brand name</dt>
                <dd className="text-16 font-medium text-ink">
                  {(listing.sensitiveDetailsUnlocked || sellerApproved) && listing.redactedName
                    ? listing.redactedName
                    : listing.redactedPlaceholder}
                </dd>
              </div>
              <div className="flex flex-col gap-2">
                <dt className="text-14 font-medium text-slate">Primary domain</dt>
                <dd className="text-16 font-medium text-ink">
                  {(listing.sensitiveDetailsUnlocked || sellerApproved) && listing.redactedDomain
                    ? listing.redactedDomain
                    : listing.redactedPlaceholder}
                </dd>
              </div>
              <div className="flex flex-col gap-2">
                <dt className="text-14 font-medium text-slate">Customer names &amp; cohorts</dt>
                <dd className="text-16 font-medium text-ink">
                  {(listing.sensitiveDetailsUnlocked || sellerApproved) && listing.redactedCustomers
                    ? listing.redactedCustomers
                    : listing.redactedPlaceholder}
                </dd>
              </div>
            </dl>

            {/* C6: Request full details flow */}
            {!listing.sensitiveDetailsUnlocked && !sellerApproved && !listing.canEdit && (
              <div className="mt-4 pt-4 border-t border-mist flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-14 font-medium text-deep-navy">
                    Want the full company name, domain, and customers?
                  </span>
                  <span className="text-12 text-slate">
                    Requires verified email and phone. The seller reviews your buyer profile to approve.
                  </span>
                </div>
                {detailRequestSent ? (
                  <span className="inline-flex items-center gap-1.5 text-14 font-medium text-verified-green">
                    <CheckCircle2 className="h-4 w-4" />
                    Details request sent to seller
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="action"
                    loading={detailRequestLoading}
                    loadingLabel="Requesting..."
                    onClick={handleRequestFullDetails}
                    className="min-h-[44px]"
                  >
                    Request full details
                  </Button>
                )}
              </div>
            )}

            {/* C6: Seller Approval Prompt (visible to seller) */}
            {listing.canEdit && !sellerApproved && (
              <div className="mt-4 pt-4 border-t border-mist flex flex-col gap-3 bg-white p-3 rounded border">
                <span className="text-14 font-semibold text-deep-navy">
                  Incoming buyer details request
                </span>
                <p className="text-14 text-slate">
                  A prospective buyer wants the hidden details of this listing. Consider agreeing confidentiality terms with them before you approve.
                </p>
                <label className="flex items-start gap-2 text-14 text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confidentialityChecked}
                    onChange={(e) => setConfidentialityChecked(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-mist text-trust-blue focus:ring-trust-blue"
                  />
                  <span>We have agreed confidentiality terms outside this platform.</span>
                </label>
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setSellerApproved(true)}
                    className="min-h-[44px]"
                  >
                    Approve and unlock details
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* SECTION 1: LIVE VITALS STRIP (Strictly separating Verified vs Seller-Reported) */}
      <section
        id="vitals-strip"
        aria-labelledby="vitals-strip-heading"
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h2
              id="vitals-strip-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              1. Live vitals strip
            </h2>
            <p className="text-16 text-slate">
              Connected read-only metrics carry a Verified mark with source and timestamp.
              Unverified metrics remain separated below as Seller-reported.
            </p>
          </div>
          {listing.canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                loading={refreshingVitals}
                loadingLabel="Syncing..."
                onClick={() => void handleRefreshVitals()}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Refresh vitals</span>
              </Button>
              <Button asChild variant="action">
                <Link href={`/verify?tab=connectors&businessId=${listing.id}`}>
                  Manage connectors
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
        {refreshStatusMessage ? (
          <div
            role="status"
            className="rounded border border-mist bg-white p-4 text-16 text-deep-navy"
          >
            {refreshStatusMessage}
          </div>
        ) : null}

        {/* Subsection A: Verified Connected Metrics */}
        <div className="flex flex-col gap-4 rounded border border-mist bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mist pb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className={
                  verifiedMetrics.length > 0
                    ? "h-6 w-6 text-verified-green"
                    : "h-6 w-6 text-slate"
                }
                aria-hidden="true"
              />
              <h3 className="font-serif text-20 font-semibold text-deep-navy">
                Verified connected metrics
              </h3>
            </div>
            <span className="text-14 font-medium text-slate tabular-figures">
              {verifiedMetrics.length} active verification{" "}
              {verifiedMetrics.length === 1 ? "record" : "records"}
            </span>
          </div>

          {verifiedMetrics.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {verifiedMetrics.map((m) => (
                <MetricTile
                  key={m.id}
                  label={m.label}
                  value={m.value}
                  unit={m.unit}
                  currency={m.currency ?? listing.currency}
                  compactCurrency={m.unit === "CURRENCY"}
                  sourceLabel={m.sourceLabel}
                  verification={m.verification}
                  isSampleData={m.isSampleData}
                  referenceNow={effectiveNow}
                  allowCautionAccent={allowCautionAccent}
                  allowRiskAccent={allowRiskAccent}
                />
              ))}
            </div>
          ) : (
            <div className="rounded border border-mist bg-cloud p-4">
              <p className="text-16 text-ink">
                No third-party payment or analytics accounts are verified on this listing
                yet. All figures below are Seller-reported.
              </p>
            </div>
          )}
        </div>

        {/* Subsection B: Seller-Reported / Unverified Metrics */}
        <div className="flex flex-col gap-4 rounded border border-mist bg-cloud p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mist pb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-slate" aria-hidden="true" />
              <h3 className="font-serif text-20 font-semibold text-deep-navy">
                Seller-reported metrics (unverified)
              </h3>
            </div>
            <StatusChip tone="seller-reported" label="Seller-reported" />
          </div>

          {unverifiedMetrics.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {unverifiedMetrics.map((m) => (
                <MetricTile
                  key={m.id}
                  label={m.label}
                  value={m.value}
                  unit={m.unit}
                  currency={m.currency ?? listing.currency}
                  compactCurrency={m.unit === "CURRENCY"}
                  sourceLabel={m.sourceLabel}
                  verification={m.verification}
                  isSampleData={m.isSampleData}
                  referenceNow={effectiveNow}
                  allowCautionAccent={allowCautionAccent}
                  allowRiskAccent={allowRiskAccent}
                />
              ))}
            </div>
          ) : (
            <p className="text-16 text-slate">
              All core vitals on this listing are backed by active verification records.
            </p>
          )}
        </div>
      </section>

      {/* SECTION 2: FOUNDER VIDEO OR VOICE NOTE & STORY */}
      <section
        id="founder-note"
        aria-labelledby="founder-note-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="founder-note-heading"
          className="font-serif text-28 font-semibold text-deep-navy"
        >
          2. Founder voice note &amp; story
        </h2>
        <Card className="flex flex-col gap-4">
          {listing.founderMediaUrl ? (
            <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
              <div className="flex items-center gap-2 text-16 font-medium text-deep-navy">
                <Mic className="h-4 w-4 text-trust-blue" aria-hidden="true" />
                <span>
                  Founder {listing.founderMediaType === "video" ? "video briefing" : "voice note"}
                </span>
              </div>
              {listing.founderMediaType === "video" ? (
                <a
                  href={listing.founderMediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-16 font-medium text-trust-blue underline"
                >
                  Open founder briefing video
                </a>
              ) : (
                <audio
                  controls
                  preload="metadata"
                  src={listing.founderMediaUrl}
                  className="w-full"
                  aria-label="Founder voice note audio player"
                />
              )}
            </div>
          ) : (
            <p className="text-16 text-slate">
              No audio or video recording attached; written founder operations summary below.
            </p>
          )}
          <p className="text-16 text-ink">{listing.founderStory}</p>
        </Card>
      </section>

      {/* SECTION 3: REASON FOR SELLING */}
      <section
        id="reason-for-selling"
        aria-labelledby="reason-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="reason-heading"
          className="font-serif text-28 font-semibold text-deep-navy"
        >
          3. Reason for selling
        </h2>
        <Card>
          <p className="text-16 text-ink">{listing.reasonForSelling}</p>
        </Card>
      </section>

      {/* SECTION 4: FINANCIAL NARRATIVE WITH CHARTS */}
      <section
        id="financial-narrative"
        aria-labelledby="financial-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="financial-heading"
          className="font-serif text-28 font-semibold text-deep-navy"
        >
          4. Financial narrative &amp; trend
        </h2>
        <Card>
          <p className="text-16 text-ink">{listing.financialNarrative}</p>
        </Card>
        <FinancialChart
          series={listing.financialSeries}
          currency={listing.currency}
        />
      </section>

      {/* SECTION 5: RISKS */}
      <section
        id="risks"
        aria-labelledby="risks-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="risks-heading"
          className="font-serif text-28 font-semibold text-deep-navy"
        >
          5. Disclosed risks &amp; diligence notes
        </h2>
        <Card>
          <div className="flex items-start gap-4">
            <Info className="mt-1 h-6 w-6 shrink-0 text-trust-blue" aria-hidden="true" />
            <div className="flex flex-col gap-2">
              <p className="text-16 text-ink">{listing.risksSummary}</p>
              {listing.valuationBasis ? (
                <span className="text-14 text-slate">
                  Valuation context: {listing.valuationBasis}
                </span>
              ) : null}
            </div>
          </div>
        </Card>
      </section>

      {/* SECTION 6: TECH & ASSETS INCLUDED */}
      <section
        id="assets-included"
        aria-labelledby="assets-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="assets-heading"
          className="font-serif text-28 font-semibold text-deep-navy"
        >
          6. Tech stack &amp; assets included
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Technology &amp; infrastructure</CardTitle>
              <CardDescription>
                Core tools and platforms operated by this business.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {listing.techStack.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {listing.techStack.map((item) => (
                    <li
                      key={item}
                      className="rounded border border-mist bg-cloud px-4 py-2 text-14 font-medium text-deep-navy"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-16 text-slate">No technology tags listed.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assets included in transfer</CardTitle>
              <CardDescription>
                Verified handover checklist items upon escrow release.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {listing.assetsIncluded.map((asset) => (
                  <li key={asset} className="flex items-center gap-2 text-16 text-ink">
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-trust-blue"
                      aria-hidden="true"
                    />
                    <span>{asset}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECTION 7: Q&A */}
      <section
        id="qa-section"
        aria-labelledby="qa-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="qa-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            7. Buyer Q&amp;A
          </h2>
          <span className="text-14 text-slate tabular-figures">
            {listing.questions.length}{" "}
            {listing.questions.length === 1 ? "question" : "questions"}
          </span>
        </div>

        {listing.status === "APPROVED" ? (
          <Card>
            {isAuthenticated ? (
              <form onSubmit={handleAskQuestion} className="flex flex-col gap-4">
                <Textarea
                  label="Ask the founder a public diligence question"
                  value={questionText}
                  onChange={(e) => {
                    setQuestionText(e.target.value);
                    if (questionError) setQuestionError(null);
                  }}
                  error={questionError ?? undefined}
                  placeholder="Ask about customer acquisition channels, cohort retention, or post-sale handover."
                  helperText="Questions and answers are visible publicly. Confidential name, domain, and customer names stay redacted until NDA."
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="action"
                    loading={questionSubmitting}
                    loadingLabel="Posting question..."
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    <span>Post question</span>
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-16 text-ink">
                  Sign in to ask the seller a question before requesting an NDA deal room.
                </p>
                <Button asChild variant="secondary">
                  <Link href="/auth/signin">Sign in to ask</Link>
                </Button>
              </div>
            )}
          </Card>
        ) : null}

        {listing.questions.length === 0 ? (
          <CardStateEmpty
            title="No public Q&A threads yet"
            description="Questions posted by signed-in buyers and answers from the founder will appear here."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {listing.questions.map((q) => (
              <Card key={q.id} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-14 font-semibold text-deep-navy">
                    {q.askerLabel}
                  </span>
                </div>

                <p className="text-16 font-medium text-deep-navy">{q.question}</p>

                {q.answer ? (
                  <div className="rounded border border-mist bg-cloud p-4">
                    <span className="text-14 font-semibold text-deep-navy">
                      Seller answer
                    </span>
                    <p className="pt-2 text-16 text-ink">{q.answer}</p>
                  </div>
                ) : listing.canAnswerQuestions ? (
                  <div className="flex flex-col gap-4 border-t border-mist pt-4">
                    <Textarea
                      label="Post seller answer"
                      value={answerDrafts[q.id] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAnswerDrafts((prev) => ({
                          ...prev,
                          [q.id]: val,
                        }));
                        if (answerErrorsById[q.id]) {
                          setAnswerErrorsById((prev) => ({
                            ...prev,
                            [q.id]: undefined,
                          }));
                        }
                      }}
                      error={answerErrorsById[q.id]}
                      rows={2}
                      placeholder="Provide a clear, factual answer without revealing NDA-redacted details."
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="primary"
                        loading={answeringId === q.id}
                        loadingLabel="Saving answer..."
                        onClick={() => handleAnswerQuestion(q.id)}
                      >
                        Save answer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <span className="text-14 text-slate">
                    Awaiting founder response.
                  </span>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Listing Disclaimer & Report Button (C8) */}
      <div className="rounded border border-mist bg-cloud p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-14 text-slate m-0 max-w-2xl leading-relaxed">
          Listing information is provided by the seller and from connected accounts. We do not verify legal title, encumbrances, or non-connected figures. Do your own due diligence.
        </p>
        <ReportModal
          listingId={listing.id}
          listingTitle={listing.teaserTitle}
          listingSlug={listing.slug}
        />
      </div>
    </div>
  );
}
