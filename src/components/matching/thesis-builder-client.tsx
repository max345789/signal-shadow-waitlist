"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, Lock, Search, Sparkles } from "lucide-react";
import type { AuthSession } from "@/lib/auth/types";
import {
  extractThesisHintsFromPrompt,
  THESIS_GEOGRAPHY_OPTIONS,
  type RankedThesisMatch,
  type SavedThesisRecord,
} from "@/lib/domain/matching";
import { BUSINESS_SECTORS } from "@/lib/domain/valuation";
import type { CurrencyCode } from "@/lib/format/currency";
import { MatchResultCard } from "@/components/matching/match-result-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardStateEmpty,
  CardStateError,
  CardStateLoading,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";

function toNumericOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function ThesisBuilderClient({
  session,
  initialPrompt,
  editingThesis,
  editingLoadError,
}: {
  session: AuthSession | null;
  initialPrompt?: string;
  editingThesis: SavedThesisRecord | null;
  editingLoadError?: string | null;
}) {
  const router = useRouter();
  const hints = React.useMemo(
    () =>
      initialPrompt && !editingThesis
        ? extractThesisHintsFromPrompt(initialPrompt)
        : null,
    [initialPrompt, editingThesis]
  );

  const canSaveThesis = Boolean(
    session && (session.roles.includes("BUYER") || session.roles.includes("ADMIN"))
  );

  const [title, setTitle] = React.useState<string>(
    editingThesis?.title ?? hints?.title ?? ""
  );
  const [sector, setSector] = React.useState<string>(
    editingThesis?.sector ?? hints?.sector ?? "ALL"
  );
  const [currency, setCurrency] = React.useState<CurrencyCode>(
    editingThesis?.currency ?? "INR"
  );
  const [geography, setGeography] = React.useState<string>(
    editingThesis?.geography ?? hints?.geography ?? "ALL"
  );
  const [minRevenue, setMinRevenue] = React.useState<string>(
    editingThesis?.minRevenue != null ? String(editingThesis.minRevenue) : ""
  );
  const [maxRevenue, setMaxRevenue] = React.useState<string>(
    editingThesis?.maxRevenue != null ? String(editingThesis.maxRevenue) : ""
  );
  const [minProfit, setMinProfit] = React.useState<string>(
    editingThesis?.minProfit != null
      ? String(editingThesis.minProfit)
      : hints?.minProfit != null
        ? String(hints.minProfit)
        : ""
  );
  const [maxOwnerHours, setMaxOwnerHours] = React.useState<string>(
    editingThesis?.maxOwnerHours != null
      ? String(editingThesis.maxOwnerHours)
      : hints?.maxOwnerHours != null
        ? String(hints.maxOwnerHours)
        : ""
  );
  const [minPrice, setMinPrice] = React.useState<string>(
    editingThesis?.minPrice != null ? String(editingThesis.minPrice) : ""
  );
  const [maxPrice, setMaxPrice] = React.useState<string>(
    editingThesis?.maxPrice != null
      ? String(editingThesis.maxPrice)
      : hints?.maxPrice != null
        ? String(hints.maxPrice)
        : ""
  );
  const [freeText, setFreeText] = React.useState<string>(
    editingThesis?.freeText ?? hints?.freeText ?? ""
  );
  const [alertsEnabled, setAlertsEnabled] = React.useState<boolean>(
    editingThesis?.alertsEnabled ?? true
  );

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const [previewState, setPreviewState] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewMatches, setPreviewMatches] = React.useState<RankedThesisMatch[]>([]);
  const [previewedKey, setPreviewedKey] = React.useState<string | null>(null);
  const [selectedCompareIds, setSelectedCompareIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState<boolean>(false);

  const currentCriteriaKey = JSON.stringify({
    sector,
    currency,
    geography,
    minRevenue,
    maxRevenue,
    minProfit,
    maxOwnerHours,
    minPrice,
    maxPrice,
    freeText,
  });
  const previewIsStale =
    previewState === "ready" &&
    previewedKey !== null &&
    previewedKey !== currentCriteriaKey;

  const currencySymbol =
    currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";

  function buildPayload(requireTitle: boolean): {
    ok: true;
    payload: {
      title: string;
      sector: string | null;
      minRevenue: number | null;
      maxRevenue: number | null;
      minProfit: number | null;
      maxOwnerHours: number | null;
      geography: string | null;
      minPrice: number | null;
      maxPrice: number | null;
      currency: CurrencyCode;
      freeText: string;
      alertsEnabled: boolean;
    };
  } | {
    ok: false;
  } {
    const errors: Record<string, string | undefined> = {};
    const parsedMinRev = toNumericOrNull(minRevenue);
    const parsedMaxRev = toNumericOrNull(maxRevenue);
    const parsedMinProfit = toNumericOrNull(minProfit);
    const parsedMaxHours = toNumericOrNull(maxOwnerHours);
    const parsedMinPrice = toNumericOrNull(minPrice);
    const parsedMaxPrice = toNumericOrNull(maxPrice);

    const derivedTitle =
      title.trim() ||
      (sector !== "ALL" ? `${sector} acquisition thesis` : freeText.trim().slice(0, 64));

    if (requireTitle && derivedTitle.trim().length < 3) {
      errors.title = "Enter a thesis title of at least 3 characters.";
    } else if (derivedTitle.trim().length > 120) {
      errors.title = "Thesis title cannot exceed 120 characters.";
    }
    if (minRevenue.trim() && parsedMinRev === null) {
      errors.minRevenue = "Enter a valid minimum annual revenue.";
    } else if (parsedMinRev !== null && parsedMinRev < 0) {
      errors.minRevenue = "Minimum revenue cannot be negative.";
    }
    if (maxRevenue.trim() && parsedMaxRev === null) {
      errors.maxRevenue = "Enter a valid maximum annual revenue.";
    } else if (parsedMaxRev !== null && parsedMaxRev < 0) {
      errors.maxRevenue = "Maximum revenue cannot be negative.";
    } else if (
      parsedMinRev !== null &&
      parsedMaxRev !== null &&
      parsedMinRev > parsedMaxRev
    ) {
      errors.maxRevenue = "Maximum revenue must be >= minimum revenue.";
    }
    if (minProfit.trim() && parsedMinProfit === null) {
      errors.minProfit = "Enter a valid minimum net profit.";
    }
    if (maxOwnerHours.trim() && (parsedMaxHours === null || !Number.isInteger(parsedMaxHours) || parsedMaxHours < 0 || parsedMaxHours > 168)) {
      errors.maxOwnerHours = "Owner hours must be a whole number between 0 and 168.";
    }
    if (minPrice.trim() && parsedMinPrice === null) {
      errors.minPrice = "Enter a valid minimum asking price.";
    } else if (parsedMinPrice !== null && parsedMinPrice < 0) {
      errors.minPrice = "Minimum price cannot be negative.";
    }
    if (maxPrice.trim() && parsedMaxPrice === null) {
      errors.maxPrice = "Enter a valid maximum asking price.";
    } else if (parsedMaxPrice !== null && parsedMaxPrice < 0) {
      errors.maxPrice = "Maximum price cannot be negative.";
    } else if (
      parsedMinPrice !== null &&
      parsedMaxPrice !== null &&
      parsedMinPrice > parsedMaxPrice
    ) {
      errors.maxPrice = "Maximum price must be >= minimum price.";
    }

    const hasStructured =
      sector !== "ALL" ||
      geography !== "ALL" ||
      parsedMinRev !== null ||
      parsedMaxRev !== null ||
      parsedMinProfit !== null ||
      parsedMaxHours !== null ||
      parsedMinPrice !== null ||
      parsedMaxPrice !== null;

    if (!hasStructured && freeText.trim().length < 3) {
      errors.freeText =
        "Provide at least one filter above or 3+ characters of free-text criteria.";
    }

    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      setFormError("Check the highlighted thesis fields below.");
      // Clear previous preview results so Brick Red validation errors never coexist with Verified Green cards
      setPreviewState("idle");
      setPreviewMatches([]);
      setPreviewedKey(null);
      return { ok: false };
    }

    setFieldErrors({});
    setFormError(null);

    return {
      ok: true,
      payload: {
        title: derivedTitle || "Custom acquisition thesis",
        sector: sector === "ALL" ? null : sector,
        minRevenue: parsedMinRev,
        maxRevenue: parsedMaxRev,
        minProfit: parsedMinProfit,
        maxOwnerHours: parsedMaxHours,
        geography: geography === "ALL" ? null : geography,
        minPrice: parsedMinPrice,
        maxPrice: parsedMaxPrice,
        currency,
        freeText: freeText.trim(),
        alertsEnabled,
      },
    };
  }

  async function handlePreviewMatches() {
    const built = buildPayload(false);
    if (!built.ok) return;

    setPreviewState("loading");
    setPreviewError(null);
    try {
      const res = await fetch("/api/matches/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error ?? "Could not preview thesis matches.");
        setPreviewState("error");
        return;
      }
      setPreviewMatches(data.matches ?? []);
      setPreviewedKey(currentCriteriaKey);
      setPreviewState("ready");
    } catch {
      setPreviewError("Network error while scoring approved listings.");
      setPreviewState("error");
    }
  }

  async function handleSaveThesis(event: React.FormEvent) {
    event.preventDefault();
    if (!canSaveThesis) {
      setPreviewState("idle");
      setPreviewMatches([]);
      setPreviewedKey(null);
      setFormError(
        "Sign in with a Buyer account to save your thesis and enable new-listing alerts. You can still preview ranked matches below."
      );
      return;
    }

    const built = buildPayload(true);
    if (!built.ok) return;

    setSaving(true);
    setFormError(null);
    try {
      const url = editingThesis ? `/api/theses/${editingThesis.id}` : "/api/theses";
      const method = editingThesis ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewState("idle");
        setPreviewMatches([]);
        setPreviewedKey(null);
        setFormError(data.error ?? "Could not save your acquisition thesis.");
        return;
      }
      const savedId: string = data.thesis?.id ?? editingThesis?.id ?? "";
      router.push(
        savedId ? `/matches?thesisId=${encodeURIComponent(savedId)}` : "/matches"
      );
    } catch {
      setPreviewState("idle");
      setPreviewMatches([]);
      setPreviewedKey(null);
      setFormError("Network error while saving acquisition thesis.");
    } finally {
      setSaving(false);
    }
  }

  function toggleCompare(listingId: string) {
    setSelectedCompareIds((prev) => {
      if (prev.includes(listingId)) {
        return prev.filter((id) => id !== listingId);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, listingId];
    });
  }

  if (editingLoadError) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <StatusChip tone="neutral" label="Phase 2: Thesis Builder" className="w-fit" />
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Thesis unavailable
          </h1>
        </div>
        <CardStateError
          title="Could not open acquisition thesis for editing"
          message={editingLoadError}
        />
        <div className="flex flex-wrap gap-4">
          <Button asChild variant="primary">
            <Link href="/thesis/new">Create a new thesis</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/matches">Back to saved matches</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="neutral" label="Phase 2: Thesis Builder" />
          {hints ? (
            <StatusChip tone="neutral" label="Pre-filled from Home prompt" />
          ) : null}
        </div>
        <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
          {editingThesis ? "Edit acquisition thesis" : "Build your acquisition thesis"}
        </h1>
        <p className="max-w-[760px] text-16 text-slate">
          Combine structured criteria (sector, revenue, profit, owner hours, geography,
          and price) with free-text priorities. Every match explains both why it fits and
          what doesn&apos;t fit.
        </p>
      </div>

      {!canSaveThesis ? (
        <Card className="bg-cloud">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Lock className="mt-1 h-5 w-5 shrink-0 text-trust-blue" aria-hidden="true" />
              <div className="flex flex-col gap-2">
                <p className="text-16 font-semibold text-deep-navy">
                  {session
                    ? "Buyer role required to save theses & receive alerts"
                    : "Sign in as a Buyer to save this thesis & enable alerts"}
                </p>
                <p className="text-16 text-ink">
                  You can preview ranked matches right now without signing in, or sign in
                  with a Buyer account to save theses and trigger alerts on new listings.
                </p>
              </div>
            </div>
            <Button asChild variant="secondary">
              <Link href="/auth/signin">Sign in as Buyer</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <form onSubmit={handleSaveThesis} noValidate className="flex flex-col gap-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle as="h2">Structured &amp; free-text criteria</CardTitle>
            <CardDescription>
              Leave any optional numeric bound blank if you want wider results; every
              specified rule contributes to weighted fit scoring.
            </CardDescription>
          </CardHeader>

          {formError ? (
            <div
              role="alert"
              className="rounded border border-brick-red bg-white p-4 text-16 font-medium text-brick-red"
            >
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Input
                label="Thesis title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={fieldErrors.title}
                placeholder="e.g., Profitable B2B SaaS in India under 12 hrs/week"
                helperText="Used to organize your saved theses and match alerts."
              />
            </div>

            <Select
              label="Industry / Sector"
              name="sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              <option value="ALL">Any sector</option>
              {BUSINESS_SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>

            <Select
              label="Target geography"
              name="geography"
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
            >
              <option value="ALL">Any geography</option>
              {THESIS_GEOGRAPHY_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>

            <Select
              label="Thesis currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              helperText="Cross-currency listings are normalized automatically."
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </Select>

            <Input
              label="Max owner hours per week"
              name="maxOwnerHours"
              type="number"
              min={0}
              max={168}
              value={maxOwnerHours}
              onChange={(e) => setMaxOwnerHours(e.target.value)}
              error={fieldErrors.maxOwnerHours}
              suffixText="hrs/wk"
              placeholder="e.g., 12"
            />

            <Input
              label="Minimum annual revenue"
              name="minRevenue"
              type="number"
              min={0}
              value={minRevenue}
              onChange={(e) => setMinRevenue(e.target.value)}
              error={fieldErrors.minRevenue}
              prefixText={currencySymbol}
              placeholder="e.g., 5000000"
            />

            <Input
              label="Maximum annual revenue"
              name="maxRevenue"
              type="number"
              min={0}
              value={maxRevenue}
              onChange={(e) => setMaxRevenue(e.target.value)}
              error={fieldErrors.maxRevenue}
              prefixText={currencySymbol}
              placeholder="e.g., 25000000"
            />

            <Input
              label="Minimum annual net profit"
              name="minProfit"
              type="number"
              value={minProfit}
              onChange={(e) => setMinProfit(e.target.value)}
              error={fieldErrors.minProfit}
              prefixText={currencySymbol}
              placeholder="e.g., 3000000"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Minimum asking price"
                name="minPrice"
                type="number"
                min={0}
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                error={fieldErrors.minPrice}
                prefixText={currencySymbol}
                placeholder="Optional"
              />
              <Input
                label="Maximum asking price"
                name="maxPrice"
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                error={fieldErrors.maxPrice}
                prefixText={currencySymbol}
                placeholder="e.g., 20000000"
              />
            </div>

            <div className="md:col-span-2">
              <Textarea
                label="Free-text thesis & soft priorities"
                name="freeText"
                rows={4}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                error={fieldErrors.freeText}
                placeholder="e.g., Recurring B2B compliance or workflow SaaS, verified Stripe revenue, annual plans, low churn."
                helperText="Soft criteria and connector terms (e.g. Stripe, Razorpay, GA4, verified) are scored against public listing disclosures."
              />
            </div>

            <div className="md:col-span-2">
              <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded border border-mist bg-cloud px-4 py-2 text-16 text-ink">
                <input
                  type="checkbox"
                  checked={alertsEnabled}
                  onChange={(e) => setAlertsEnabled(e.target.checked)}
                  className="h-4 w-4 accent-trust-blue"
                />
                <Bell className="h-4 w-4 shrink-0 text-trust-blue" aria-hidden="true" />
                <span>
                  Alert me when newly approved listings match this thesis (fit score 70+)
                </span>
              </label>
            </div>
          </div>

          <CardFooter className="px-0 pb-0">
            <Button
              type="button"
              variant="action"
              onClick={() => void handlePreviewMatches()}
              loading={previewState === "loading"}
              loadingLabel="Scoring listings..."
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Preview ranked matches</span>
            </Button>

            <Button
              type="submit"
              variant="primary"
              loading={saving}
              loadingLabel="Saving thesis..."
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>
                {editingThesis ? "Save thesis changes" : "Save thesis & open matches"}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Live Preview Results */}
      {previewState === "loading" ? (
        <CardStateLoading
          title="Scoring approved listings"
          description="Evaluating hard financial bounds, owner workload, free-text keywords, and verification records."
        />
      ) : previewState === "error" ? (
        <CardStateError
          title="Could not preview thesis matches"
          message={previewError ?? "An unexpected error occurred."}
          onRetry={() => void handlePreviewMatches()}
        />
      ) : previewState === "ready" ? (
        <section aria-labelledby="preview-matches-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="preview-matches-heading"
                className="font-serif text-28 font-semibold text-deep-navy"
              >
                Previewed matches ({previewMatches.length})
              </h2>
              <p className="text-16 text-slate">
                Ranked by weighted fit score. Both matching reasons and mismatches are shown
                for every business.
              </p>
            </div>

            {selectedCompareIds.length > 0 ? (
              <Button asChild variant="action">
                <Link href={`/compare?ids=${selectedCompareIds.join(",")}`}>
                  <span>Compare selected ({selectedCompareIds.length}/3)</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>

          {previewIsStale ? (
            <div
              role="status"
              className="rounded border border-mist bg-white p-4 text-16 text-deep-navy"
            >
              Criteria changed since your last preview — select{" "}
              <strong>Preview ranked matches</strong> above to refresh fit scores.
            </div>
          ) : null}

          {previewMatches.length === 0 ? (
            <CardStateEmpty
              title="No approved listings available to score yet"
              description="Listings become eligible for matching after completing Admin review."
            />
          ) : (
            <div className="flex flex-col gap-6">
              {previewMatches.map((match, idx) => (
                <MatchResultCard
                  key={match.listing.id}
                  match={match}
                  rank={idx + 1}
                  titleAs="h3"
                  selectedForCompare={selectedCompareIds.includes(match.listing.id)}
                  compareDisabled={selectedCompareIds.length >= 3}
                  onToggleCompare={toggleCompare}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
