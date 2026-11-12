"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Lock,
  Sparkles,
} from "lucide-react";
import type { AuthSession } from "@/lib/auth/types";
import type { SanitizedListingView } from "@/lib/domain/listings";
import {
  BUSINESS_SECTORS,
  COMMON_ASSETS_INCLUDED,
  COMMON_TECH_STACK,
  GEOGRAPHY_OPTIONS,
  buildAutoListingDraft,
  calculateGuidedValuation,
  detectConfidentialLeak,
} from "@/lib/domain/valuation";
import { formatCurrency, type CurrencyCode } from "@/lib/format/currency";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";

const STEPS = [
  { id: 1, title: "1. Business & redaction" },
  { id: 2, title: "2. Financials & valuation" },
  { id: 3, title: "3. Trust & assets" },
  { id: 4, title: "4. Review & submit" },
] as const;

function getMetricValue(
  listing: SanitizedListingView | null,
  key: string,
  fallback: number
): number {
  const found = listing?.metrics.find((m) => m.key === key);
  return found ? found.value : fallback;
}

export function SellerOnboardingClient({
  session,
  editingListing,
}: {
  session: AuthSession | null;
  editingListing: SanitizedListingView | null;
}) {
  const router = useRouter();
  const isAuthorizedSeller = Boolean(
    session && (session.roles.includes("SELLER") || session.roles.includes("ADMIN"))
  );

  const [step, setStep] = React.useState<number>(1);

  // Step 1: Business & confidential NDA-gated fields
  const [sector, setSector] = React.useState<string>(
    editingListing?.sector ?? "B2B SaaS"
  );
  const [geography, setGeography] = React.useState<string>(
    editingListing?.geography ?? "India (Bengaluru)"
  );
  const [currency, setCurrency] = React.useState<CurrencyCode>(
    editingListing?.currency ?? "INR"
  );
  const [redactedName, setRedactedName] = React.useState<string>(
    editingListing?.redactedName ?? ""
  );
  const [redactedDomain, setRedactedDomain] = React.useState<string>(
    editingListing?.redactedDomain ?? ""
  );
  const [redactedCustomers, setRedactedCustomers] = React.useState<string>(
    editingListing?.redactedCustomers ?? ""
  );

  // Step 2: Financials & Valuation
  const [annualRevenue, setAnnualRevenue] = React.useState<string>(
    String(getMetricValue(editingListing, "REVENUE", 6_000_000))
  );
  const [annualProfit, setAnnualProfit] = React.useState<string>(
    String(getMetricValue(editingListing, "PROFIT", 2_400_000))
  );
  const [growthPercent, setGrowthPercent] = React.useState<string>(
    String(getMetricValue(editingListing, "GROWTH", 25))
  );
  const [churnPercent, setChurnPercent] = React.useState<string>(
    String(getMetricValue(editingListing, "CHURN", 2.5))
  );
  const [monthlyTraffic, setMonthlyTraffic] = React.useState<string>(
    String(getMetricValue(editingListing, "TRAFFIC", 15_000))
  );
  const [customerCount, setCustomerCount] = React.useState<string>(
    String(getMetricValue(editingListing, "CUSTOMERS", 120))
  );
  const [ownerHoursPerWeek, setOwnerHoursPerWeek] = React.useState<string>(
    String(editingListing?.ownerHoursPerWeek ?? 12)
  );
  const [askingPrice, setAskingPrice] = React.useState<string>(
    editingListing ? String(editingListing.askingPrice) : ""
  );

  // Step 3: Reason for selling, tech stack, assets
  const [reasonForSelling, setReasonForSelling] = React.useState<string>(
    editingListing?.reasonForSelling ?? ""
  );
  const [techStack, setTechStack] = React.useState<string[]>(
    editingListing?.techStack ?? ["TypeScript", "PostgreSQL"]
  );
  const [assetsIncluded, setAssetsIncluded] = React.useState<string[]>(
    editingListing?.assetsIncluded ?? [
      "Primary domain & DNS transfer",
      "Production source code repository",
      "30-day post-close founder transition support",
    ]
  );

  // Step 4: Auto-built public listing narrative
  const [teaserTitle, setTeaserTitle] = React.useState<string>(
    editingListing?.teaserTitle ?? ""
  );
  const [teaserSummary, setTeaserSummary] = React.useState<string>(
    editingListing?.teaserSummary ?? ""
  );
  const [founderStory, setFounderStory] = React.useState<string>(
    editingListing?.founderStory ?? ""
  );
  const [founderMediaUrl, setFounderMediaUrl] = React.useState<string>(
    editingListing?.founderMediaUrl ?? ""
  );
  const [founderMediaType, setFounderMediaType] = React.useState<"audio" | "video">(
    editingListing?.founderMediaType ?? "audio"
  );
  const [financialNarrative, setFinancialNarrative] = React.useState<string>(
    editingListing?.financialNarrative ?? ""
  );
  const [risksSummary, setRisksSummary] = React.useState<string>(
    editingListing?.risksSummary ?? ""
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successListing, setSuccessListing] =
    React.useState<SanitizedListingView | null>(null);

  const revNum = Number(annualRevenue) || 0;
  const profNum = Number(annualProfit) || 0;
  const growthNum = Number(growthPercent) || 0;
  const churnNum = Number(churnPercent) || 0;
  const trafficNum = Math.max(0, Math.round(Number(monthlyTraffic) || 0));
  const customerNum = Math.max(0, Math.round(Number(customerCount) || 0));
  const hoursNum = Math.min(168, Math.max(0, Math.round(Number(ownerHoursPerWeek) || 0)));

  const valuation = React.useMemo(
    () =>
      calculateGuidedValuation({
        sector,
        annualRevenue: revNum,
        annualProfit: profNum,
        ownerHoursPerWeek: hoursNum,
        growthPercent: growthNum,
        currency,
      }),
    [sector, revNum, profNum, hoursNum, growthNum, currency]
  );

  const effectiveAskingPrice =
    askingPrice.trim().length > 0 && Number(askingPrice) > 0
      ? Number(askingPrice)
      : valuation.suggestedAskingPrice;

  const leakFindings = React.useMemo(
    () =>
      detectConfidentialLeak(
        {
          teaserTitle,
          teaserSummary,
          financialNarrative,
          risksSummary,
          founderStory,
        },
        {
          redactedName,
          redactedDomain,
        }
      ),
    [
      teaserTitle,
      teaserSummary,
      financialNarrative,
      risksSummary,
      founderStory,
      redactedName,
      redactedDomain,
    ]
  );

  function applyAutoBuildDraft(overwriteExisting = false) {
    const draft = buildAutoListingDraft({
      sector,
      geography,
      currency,
      annualRevenue: revNum,
      annualProfit: profNum,
      growthPercent: growthNum,
      churnPercent: churnNum,
      monthlyTraffic: trafficNum,
      customerCount: customerNum,
      ownerHoursPerWeek: hoursNum,
      reasonForSelling,
      techStack,
      assetsIncluded,
    });

    if (overwriteExisting || !teaserTitle.trim()) setTeaserTitle(draft.teaserTitle);
    if (overwriteExisting || !teaserSummary.trim()) setTeaserSummary(draft.teaserSummary);
    if (overwriteExisting || !financialNarrative.trim())
      setFinancialNarrative(draft.financialNarrative);
    if (overwriteExisting || !risksSummary.trim()) setRisksSummary(draft.risksSummary);
    if (overwriteExisting || !founderStory.trim()) setFounderStory(draft.founderStory);
    if ((overwriteExisting || !askingPrice.trim()) && valuation.suggestedAskingPrice > 0) {
      setAskingPrice(String(valuation.suggestedAskingPrice));
    }
  }

  function handleAdvanceStep(targetStep: number) {
    setError(null);
    if (targetStep === 4) {
      applyAutoBuildDraft(false);
    }
    setStep(targetStep);
  }

  function toggleSelection(
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    value: string
  ) {
    setList((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  }

  async function handleSaveListing(submitForReview: boolean) {
    setError(null);

    if (!isAuthorizedSeller) {
      setError(
        "Sign in with a Seller account before saving or submitting a listing."
      );
      return;
    }

    if (submitForReview && leakFindings.length > 0) {
      const first = leakFindings[0]!;
      setError(
        `Remove confidential identifier "${first.matchedTerm}" from "${first.field}" before submitting for Admin review.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        teaserTitle: teaserTitle.trim(),
        teaserSummary: teaserSummary.trim(),
        redactedName: redactedName.trim(),
        redactedDomain: redactedDomain.trim(),
        redactedCustomers: redactedCustomers.trim() || null,
        sector,
        geography,
        askingPrice: effectiveAskingPrice,
        currency,
        ownerHoursPerWeek: hoursNum,
        reasonForSelling: reasonForSelling.trim(),
        founderStory: founderStory.trim(),
        founderMediaUrl: founderMediaUrl.trim() || null,
        founderMediaType: founderMediaUrl.trim() ? founderMediaType : null,
        financialNarrative: financialNarrative.trim(),
        risksSummary: risksSummary.trim(),
        techStack,
        assetsIncluded,
        annualRevenue: revNum,
        annualProfit: profNum,
        growthPercent: growthNum,
        churnPercent: churnNum,
        monthlyTraffic: trafficNum,
        customerCount: customerNum,
        submitForReview,
      };

      const endpoint = editingListing
        ? `/api/listings/${editingListing.id}`
        : "/api/listings";
      const method = editingListing ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save listing. Check required fields.");
        return;
      }

      setSuccessListing(data.listing);
      router.refresh();
    } catch {
      setError("Network error while saving your listing.");
    } finally {
      setSubmitting(false);
    }
  }

  if (successListing) {
    return (
      <Card className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-6 w-6 text-verified-green"
              aria-hidden="true"
            />
            <h1 className="font-serif text-28 font-semibold text-deep-navy">
              {successListing.status === "PENDING_REVIEW"
                ? "Listing submitted for Admin review"
                : "Listing draft saved"}
            </h1>
          </div>
          <StatusChip
            tone={successListing.status === "PENDING_REVIEW" ? "neutral" : "seller-reported"}
            label={
              successListing.status === "PENDING_REVIEW"
                ? "Submitted for review"
                : "Draft saved"
            }
          />
        </div>

        <p className="text-16 text-ink">
          {successListing.status === "PENDING_REVIEW"
            ? "A platform reviewer will inspect your redacted identity fields and financial narrative before publishing. All figures remain marked Seller-reported until connected accounts are verified."
            : "Your draft is saved privately in your Seller dashboard. You can edit and submit it for Admin review whenever ready."}
        </p>

        <div className="rounded border border-mist bg-cloud p-4">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <dt className="text-14 text-slate">Teaser title</dt>
              <dd className="text-16 font-medium text-deep-navy">
                {successListing.teaserTitle}
              </dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="text-14 text-slate">Asking price</dt>
              <dd className="text-16 font-semibold text-deep-navy tabular-figures">
                {formatCurrency(successListing.askingPrice, {
                  currency: successListing.currency,
                  compact: true,
                })}
              </dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="text-14 text-slate">Metric verification</dt>
              <dd className="text-16 font-medium text-ink">
                0 verified / {successListing.trustSummary.sellerReportedCount}{" "}
                seller-reported
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button asChild variant="primary">
            <Link href="/seller">Open Seller dashboard</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/listings/${successListing.slug}`}>
              Preview listing as owner
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
          {editingListing ? "Edit business listing" : "Seller onboarding & listing builder"}
        </h1>
        <p className="max-w-[760px] text-16 text-slate">
          Complete the guided valuation, keep confidential identifiers gated behind an
          NDA, and review your auto-built listing before Admin approval.
        </p>
      </div>

      {!isAuthorizedSeller ? (
        <Card className="border-trust-blue bg-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-16 font-semibold text-deep-navy">
                {session
                  ? `Signed in as ${session.name} (${session.roles.join(", ")}) — Seller role required to publish`
                  : "Sign in with a Seller account to save or submit"}
              </span>
              <p className="text-16 text-slate">
                You can preview the guided valuation calculator right now. Sign in as a
                Seller to save a draft or submit for Admin review.
              </p>
            </div>
            <Button asChild variant="action">
              <Link href="/auth/signin">Sign in as Seller</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Stepper */}
      <nav aria-label="Onboarding steps" className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        {STEPS.map((item) => {
          const isCurrent = step === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleAdvanceStep(item.id)}
              aria-current={isCurrent ? "step" : undefined}
              className={
                isCurrent
                  ? "min-h-12 rounded border border-trust-blue bg-white px-4 py-2 text-left text-16 font-semibold text-deep-navy"
                  : "min-h-12 rounded border border-mist bg-cloud px-4 py-2 text-left text-16 font-medium text-slate hover:bg-white hover:text-deep-navy"
              }
            >
              {item.title}
            </button>
          );
        })}
      </nav>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded border border-brick-red bg-white p-4 text-16 font-medium text-brick-red"
        >
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* STEP 1 */}
      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Step 1: Business profile &amp; NDA redaction</CardTitle>
            <CardDescription>
              Public buyers only see your sector, geography, and anonymized metrics until
              they sign an NDA.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Select
                label="Sector"
                required
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              >
                {BUSINESS_SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>

              <Select
                label="Geography"
                required
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
              >
                {GEOGRAPHY_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>

              <Select
                label="Primary reporting currency"
                required
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                <option value="INR">INR (Indian Rupee)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </Select>
            </div>

            <div className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-trust-blue" aria-hidden="true" />
                <span className="text-16 font-semibold text-deep-navy">
                  Confidential fields (redacted until buyer signs NDA)
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Legal or brand business name"
                  required
                  value={redactedName}
                  onChange={(e) => setRedactedName(e.target.value)}
                  placeholder="e.g., Acme Ledger Solutions Pvt Ltd"
                  helperText="Only shown to Admin reviewers and buyers after NDA completion."
                />
                <Input
                  label="Primary domain"
                  required
                  value={redactedDomain}
                  onChange={(e) => setRedactedDomain(e.target.value)}
                  placeholder="e.g., acmeledger.in"
                  helperText="Automatically checked against public teaser fields to prevent leaks."
                />
              </div>

              <Textarea
                label="Top customer names & concentration summary (NDA-gated)"
                value={redactedCustomers}
                onChange={(e) => setRedactedCustomers(e.target.value)}
                rows={2}
                placeholder="e.g., 140 SMB distributors; largest single account is 4% of annual revenue."
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              type="button"
              variant="primary"
              onClick={() => handleAdvanceStep(2)}
            >
              <span>Continue to financials</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {/* STEP 2 */}
      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Step 2: Seller-reported vitals &amp; guided valuation</CardTitle>
            <CardDescription>
              Enter your trailing 12-month performance. These figures will be labelled
              Seller-reported until connected read-only accounts verify them.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input
                label="Trailing 12m revenue"
                type="number"
                required
                min={0}
                prefixText={currency}
                value={annualRevenue}
                onChange={(e) => setAnnualRevenue(e.target.value)}
              />
              <Input
                label="Trailing 12m net profit"
                type="number"
                required
                prefixText={currency}
                value={annualProfit}
                onChange={(e) => setAnnualProfit(e.target.value)}
              />
              <Input
                label="Owner hours per week"
                type="number"
                required
                min={0}
                max={168}
                suffixText="hrs/wk"
                value={ownerHoursPerWeek}
                onChange={(e) => setOwnerHoursPerWeek(e.target.value)}
              />
              <Input
                label="Annual revenue growth"
                type="number"
                required
                suffixText="%"
                value={growthPercent}
                onChange={(e) => setGrowthPercent(e.target.value)}
              />
              <Input
                label="Monthly churn"
                type="number"
                step="0.1"
                required
                min={0}
                max={100}
                suffixText="%"
                value={churnPercent}
                onChange={(e) => setChurnPercent(e.target.value)}
              />
              <Input
                label="Monthly visitors"
                type="number"
                required
                min={0}
                value={monthlyTraffic}
                onChange={(e) => setMonthlyTraffic(e.target.value)}
              />
              <Input
                label="Active paying customers"
                type="number"
                required
                min={0}
                value={customerCount}
                onChange={(e) => setCustomerCount(e.target.value)}
              />
              <div className="md:col-span-2">
                <Input
                  label="Your asking price"
                  type="number"
                  required
                  min={1}
                  prefixText={currency}
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(e.target.value)}
                  helperText={
                    valuation.suggestedAskingPrice > 0
                      ? `Guided midpoint suggestion: ${formatCurrency(
                          valuation.suggestedAskingPrice,
                          { currency, compact: true }
                        )}`
                      : "Enter positive revenue or profit to compute a guided range."
                  }
                />
              </div>
            </div>

            {/* Guided Valuation Box */}
            <div className="flex flex-col gap-4 rounded border border-mist bg-cloud p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-16 font-semibold text-deep-navy">
                  Conservative guided valuation estimate
                </span>
                <StatusChip tone="seller-reported" label="Estimate from seller inputs" />
              </div>

              {valuation.mode !== "INSUFFICIENT_DATA" ? (
                <div className="flex flex-col gap-2">
                  <div className="text-28 font-semibold text-deep-navy tabular-figures">
                    {formatCurrency(valuation.low, { currency, compact: true })} –{" "}
                    {formatCurrency(valuation.high, { currency, compact: true })}
                  </div>
                  <p className="text-16 text-ink">{valuation.basis}</p>
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setAskingPrice(String(valuation.suggestedAskingPrice))
                      }
                    >
                      Use midpoint ({formatCurrency(valuation.suggestedAskingPrice, {
                        currency,
                        compact: true,
                      })})
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-16 text-slate">{valuation.basis}</p>
              )}

              <span className="text-14 text-slate">{valuation.disclaimer}</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAdvanceStep(1)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => handleAdvanceStep(3)}
            >
              <span>Continue to trust &amp; assets</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {/* STEP 3 */}
      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Step 3: Account verification status &amp; included assets</CardTitle>
            <CardDescription>
              Read-only payment and analytics connectors roll out in Phase 3. Until
              connected, every figure below renders honestly as Seller-reported.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate" aria-hidden="true" />
                  <span className="text-16 font-semibold text-deep-navy">
                    Account connections (Phase 3 readiness)
                  </span>
                </div>
                <StatusChip tone="seller-reported" label="Seller-reported mode" />
              </div>
              <p className="text-16 text-ink">
                In Phase 1, your published listing displays all 6 metrics in the
                Seller-reported section without a green Verified mark. Once Phase 3
                read-only connectors (Stripe, Razorpay, GA4) launch, verified metrics
                will upgrade automatically with a timestamp.
              </p>
            </div>

            <Textarea
              label="Reason for selling"
              required
              rows={3}
              value={reasonForSelling}
              onChange={(e) => setReasonForSelling(e.target.value)}
              placeholder="Explain plainly why you are selling (e.g., focusing on another venture, relocation, retirement)."
            />

            <div className="flex flex-col gap-2">
              <span className="text-16 font-medium text-deep-navy">
                Technology &amp; operations stack
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {COMMON_TECH_STACK.map((tech) => {
                  const checked = techStack.includes(tech);
                  return (
                    <label
                      key={tech}
                      className="flex min-h-12 cursor-pointer items-center gap-2 rounded border border-mist bg-white px-4 py-2 text-16 text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelection(techStack, setTechStack, tech)}
                        className="h-4 w-4 accent-trust-blue"
                      />
                      <span>{tech}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-16 font-medium text-deep-navy">
                Assets included in the transfer (at least 1 required)
              </span>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {COMMON_ASSETS_INCLUDED.map((asset) => {
                  const checked = assetsIncluded.includes(asset);
                  return (
                    <label
                      key={asset}
                      className="flex min-h-12 cursor-pointer items-center gap-2 rounded border border-mist bg-white px-4 py-2 text-16 text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleSelection(assetsIncluded, setAssetsIncluded, asset)
                        }
                        className="h-4 w-4 accent-trust-blue"
                      />
                      <span>{asset}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAdvanceStep(2)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => handleAdvanceStep(4)}
            >
              <span>Auto-build &amp; review listing</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {/* STEP 4 */}
      {step === 4 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle as="h2">Step 4: Auto-built listing review &amp; submit</CardTitle>
                <CardDescription>
                  Review and refine the generated teaser copy. Never include your real
                  brand name or domain in public fields.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => applyAutoBuildDraft(true)}
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Regenerate draft text</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            {leakFindings.length > 0 ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded border border-brick-red bg-white p-4 text-brick-red"
              >
                <span className="text-16 font-semibold">
                  Confidential redaction warning
                </span>
                <p className="text-16 text-ink">
                  Found confidential name or domain token (&ldquo;
                  {leakFindings[0]?.matchedTerm}&rdquo;) inside public field &ldquo;
                  {leakFindings[0]?.field}&rdquo;. Remove it before submitting for Admin
                  review.
                </p>
              </div>
            ) : null}

            <Input
              label="Public teaser title"
              required
              value={teaserTitle}
              onChange={(e) => setTeaserTitle(e.target.value)}
              placeholder="Profitable B2B SaaS in Bengaluru"
              helperText="Shown publicly before NDA — keep business name and domain omitted."
            />

            <Textarea
              label="Public teaser summary"
              required
              rows={2}
              value={teaserSummary}
              onChange={(e) => setTeaserSummary(e.target.value)}
            />

            <Textarea
              label="Founder story & operations note"
              required
              rows={3}
              value={founderStory}
              onChange={(e) => setFounderStory(e.target.value)}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Select
                label="Founder media format (optional)"
                value={founderMediaType}
                onChange={(e) =>
                  setFounderMediaType(e.target.value as "audio" | "video")
                }
              >
                <option value="audio">Voice note (audio)</option>
                <option value="video">Founder briefing (video)</option>
              </Select>
              <div className="md:col-span-2">
                <Input
                  label="Founder audio/video link (optional, https://)"
                  value={founderMediaUrl}
                  onChange={(e) => setFounderMediaUrl(e.target.value)}
                  placeholder="https://media.example.com/founder-intro.mp3"
                  helperText="Optional secure HTTPS URL to a founder voice note or intro video."
                />
              </div>
            </div>

            <Textarea
              label="Financial narrative"
              required
              rows={4}
              value={financialNarrative}
              onChange={(e) => setFinancialNarrative(e.target.value)}
            />

            <Textarea
              label="Key risks & buyer diligence disclosures"
              required
              rows={3}
              value={risksSummary}
              onChange={(e) => setRisksSummary(e.target.value)}
            />
          </CardContent>

          <CardFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAdvanceStep(3)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back</span>
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                loading={submitting}
                loadingLabel="Saving..."
                onClick={() => void handleSaveListing(false)}
              >
                Save as draft
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={submitting}
                loading={submitting}
                loadingLabel="Submitting..."
                onClick={() => void handleSaveListing(true)}
              >
                Submit for Admin review
              </Button>
            </div>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}
