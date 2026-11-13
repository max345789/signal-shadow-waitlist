"use client";

import * as React from "react";
import Link from "next/link";
import {
  APPROVED_TEXT_PAIRS,
  APPROVED_UI_INDICATOR_PAIRS,
  COLOR_METADATA,
  SECTION_4_COLORS,
  TYPE_SCALE,
  type Section4ColorName,
} from "@/styles/tokens";
import { contrastRatio, meetsWcagAA } from "@/lib/design/contrast";
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
import { Input, Textarea } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/ui/tooltip";
import {
  StageTracker,
  type StageTrackerItem,
} from "@/components/domain/stage-tracker";
import { MetricTile } from "@/components/domain/metric-tile";

type ViewState = "ready" | "loading" | "empty" | "error";

const SAMPLE_STAGES: StageTrackerItem[] = [
  {
    stage: "INTRO",
    status: "COMPLETED",
    ownerRole: "BOTH",
    requiredAction: "Mutual fit confirmed by buyer and seller.",
    timestampLabel: "10 Nov 2026, 14:15 IST",
  },
  {
    stage: "NDA",
    status: "COMPLETED",
    ownerRole: "BUYER",
    requiredAction: "Buyer identity, proof of funds, and NDA signature completed.",
    timestampLabel: "11 Nov 2026, 09:40 IST",
  },
  {
    stage: "DATA_ACCESS",
    status: "ACTIVE",
    ownerRole: "SELLER",
    requiredAction: "Upload watermarked Q3 bank statements and respond to customer cohort questions.",
    timestampLabel: "Active since 11 Nov 2026, 10:05 IST",
  },
  {
    stage: "OFFER",
    status: "PENDING",
    ownerRole: "BOTH",
    requiredAction: "Submit initial written offer with payment milestones.",
    timestampLabel: null,
  },
  {
    stage: "DUE_DILIGENCE",
    status: "PENDING",
    ownerRole: "BUYER",
    requiredAction: "Verify code repository, cloud infrastructure, and tax filings.",
    timestampLabel: null,
  },
  {
    stage: "ESCROW",
    status: "PENDING",
    ownerRole: "BUYER",
    requiredAction: "Fund regulated third-party escrow before asset handover.",
    timestampLabel: null,
  },
  {
    stage: "TRANSFER",
    status: "PENDING",
    ownerRole: "BOTH",
    requiredAction: "Confirm two-sided transfer of domain, code, cloud, and payment accounts.",
    timestampLabel: null,
  },
];

const REFERENCE_NOW = "2026-11-12T10:00:00.000Z";

export function StyleGuideClient({ thesisPrompt }: { thesisPrompt?: string }) {
  const [componentState, setComponentState] = React.useState<ViewState>("ready");
  const [samplePriceInput, setSamplePriceInput] = React.useState("12500000");
  const [inputErrorPreview, setInputErrorPreview] = React.useState(false);
  const [buttonLoading, setButtonLoading] = React.useState(false);
  const loadingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, []);

  const colorEntries = Object.entries(COLOR_METADATA) as Array<
    [Section4ColorName, (typeof COLOR_METADATA)[Section4ColorName]]
  >;

  return (
    <div className="flex flex-col gap-8">
      {thesisPrompt ? (
        <Card highlighted>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-14 font-semibold text-deep-navy">
                Previewing submitted Home thesis prompt (Phase 0 shell)
              </span>
              <p className="text-16 text-ink">&ldquo;{thesisPrompt}&rdquo;</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Page intro + interactive state toggle */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="neutral" label="Phase 0 Style Page" />
              <StatusChip tone="verified" label="WCAG AA Audited" />
            </div>
            <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
              Baton Design System
            </h1>
            <p className="max-w-[760px] text-16 text-slate">
              Flat, solid Section 4 colors only. Zero gradients, zero neon, zero glow
              effects.
            </p>
          </div>

          <div
            className="flex flex-col gap-2"
            role="group"
            aria-label="Inspect loading, empty, and error states"
          >
            <span className="text-14 font-medium text-slate">
              Preview dynamic component states
            </span>
            <div className="flex flex-wrap gap-2">
              {(["ready", "loading", "empty", "error"] as const).map((mode) => (
                <Button
                  key={mode}
                  variant={componentState === mode ? "primary" : "secondary"}
                  onClick={() => setComponentState(mode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs to verify both Full Component Matrix and Focused 3-Color View Rule */}
      <Tabs defaultValue="all-components">
        <TabsList aria-label="Style guide view sections">
          <TabsTrigger value="all-components">All Components</TabsTrigger>
          <TabsTrigger value="tokens-contrast">Tokens &amp; WCAG Contrast</TabsTrigger>
          <TabsTrigger value="focused-three-color">
            Focused 3-Color Rule Check
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all-components" className="flex flex-col gap-8">
          {/* 1. Buttons */}
          <section aria-labelledby="buttons-heading" className="flex flex-col gap-4">
            <h2
              id="buttons-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              1. Buttons
            </h2>
            <Card>
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="primary">Primary (Deep Navy)</Button>
                <Button variant="action">Action (Trust Blue)</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="link">Link Action</Button>
                <Button variant="danger">Danger (Brick Red)</Button>
                <Button
                  variant="primary"
                  loading={buttonLoading}
                  loadingLabel="Saving..."
                  onClick={() => {
                    setButtonLoading(true);
                    if (loadingTimerRef.current) {
                      clearTimeout(loadingTimerRef.current);
                    }
                    loadingTimerRef.current = setTimeout(() => {
                      setButtonLoading(false);
                    }, 800);
                  }}
                >
                  Test Loading State
                </Button>
                <Button variant="secondary" disabled>
                  Disabled
                </Button>
              </div>
            </Card>
          </section>

          {/* 2. Inputs */}
          <section aria-labelledby="inputs-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2
                id="inputs-heading"
                className="font-serif text-28 font-semibold text-deep-navy"
              >
                2. Inputs &amp; Form Controls
              </h2>
              <Button
                variant="secondary"
                onClick={() => setInputErrorPreview((prev) => !prev)}
              >
                {inputErrorPreview ? "Clear validation error" : "Simulate error state"}
              </Button>
            </div>
            <Card>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Input
                  label="Target Asking Price"
                  prefixText="₹"
                  suffixText="INR"
                  value={samplePriceInput}
                  onChange={(e) => setSamplePriceInput(e.target.value)}
                  helperText="Enter whole integer amount in INR (16px minimum mobile input)."
                  error={
                    inputErrorPreview
                      ? "Asking price must be verified against trailing 12-month revenue."
                      : undefined
                  }
                  required
                />
                <Input
                  label="Disabled Reference Field"
                  value="Stripe Read-Only Token"
                  disabled
                  helperText="Read-only connector reference."
                />
                <div className="md:col-span-2">
                  <Textarea
                    label="Acquisition Criteria Notes"
                    placeholder="Describe acceptable risks, tech stack preferences, and handover expectations."
                    helperText="Used in Phase 2 thesis matching alongside structured filters."
                  />
                </div>
              </div>
            </Card>
          </section>

          {/* 3. Status Chips */}
          <section aria-labelledby="chips-heading" className="flex flex-col gap-4">
            <h2
              id="chips-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              3. Status Chips (Icon + Text Label Always)
            </h2>
            <Card>
              <div className="flex flex-wrap gap-4">
                <StatusChip tone="verified" emphasis="solid" label="Verified" />
                <StatusChip tone="completed" emphasis="outline" label="Completed" />
                <StatusChip tone="pending" label="Pending review" />
                <StatusChip tone="caution" label="Verification expired" />
                <StatusChip tone="risk" emphasis="solid" label="Flagged risk" />
                <StatusChip tone="seller-reported" label="Seller-reported" />
                <StatusChip tone="neutral" label="Verified Badge" />
              </div>
            </Card>
          </section>

          {/* 4. Metric Tiles (Hero Numbers & Zero Fake Trust) */}
          <section aria-labelledby="metrics-heading" className="flex flex-col gap-4">
            <h2
              id="metrics-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              4. Metric Tiles (Verified vs Seller-reported vs Expired)
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Trailing 12m Revenue"
                value={18_400_000}
                unit="CURRENCY"
                currency="INR"
                compactCurrency
                sourceLabel="Stripe"
                isSampleData
                referenceNow={REFERENCE_NOW}
                state={componentState}
                onRetry={() => setComponentState("ready")}
                verification={{
                  id: "sample-ver-1",
                  provider: "Stripe",
                  status: "VERIFIED",
                  verifiedAt: "2026-11-12T08:00:00.000Z",
                  expiresAt: "2026-11-19T08:00:00.000Z",
                }}
              />
              <MetricTile
                label="Net Profit"
                value={5_600_000}
                unit="CURRENCY"
                currency="INR"
                compactCurrency
                sourceLabel="Seller-reported"
                isSampleData
                referenceNow={REFERENCE_NOW}
                state={componentState}
                onRetry={() => setComponentState("ready")}
                verification={null}
              />
              <MetricTile
                label="Monthly Visitors"
                value={84_200}
                unit="COUNT"
                sourceLabel="GA4"
                isSampleData
                referenceNow={REFERENCE_NOW}
                state={componentState}
                onRetry={() => setComponentState("ready")}
                verification={{
                  id: "sample-ver-expired",
                  provider: "GA4",
                  status: "VERIFIED",
                  verifiedAt: "2026-10-01T08:00:00.000Z",
                  expiresAt: "2026-11-01T08:00:00.000Z",
                }}
              />
              <MetricTile
                label="Monthly Churn"
                value={2.4}
                unit="PERCENT"
                sourceLabel="Razorpay"
                isSampleData
                referenceNow={REFERENCE_NOW}
                state={componentState}
                onRetry={() => setComponentState("ready")}
                verification={{
                  id: "sample-ver-failed",
                  provider: "Razorpay",
                  status: "FAILED",
                  verifiedAt: null,
                  expiresAt: null,
                  failureReason: "OAuth read-only token revoked",
                }}
              />
            </div>
          </section>

          {/* 5. Stage Tracker */}
          <section aria-labelledby="tracker-heading" className="flex flex-col gap-4">
            <h2
              id="tracker-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              5. Deal Room Stage Tracker (7 Stages)
            </h2>
            <StageTracker
              stages={SAMPLE_STAGES}
              state={componentState}
              onRetry={() => setComponentState("ready")}
            />
          </section>

          {/* 6. Cards & Accessible Radix Dialog / Tooltip */}
          <section aria-labelledby="cards-heading" className="flex flex-col gap-4">
            <h2
              id="cards-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              6. Cards, Modals &amp; Disclosures
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>Standard Card Surface</CardTitle>
                    <InfoTooltip
                      label="Explain verification standard"
                      explanation="A green Verified mark only renders when a non-expired provider verification record exists."
                    />
                  </div>
                  <CardDescription>
                    White surface (#FFFFFF) with 1px Mist border (#CBD2D9) and 8px radius.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="secondary">Open Accessible Dialog</Button>
                    </DialogTrigger>
                    <DialogContent
                      title="Confirm Deal Room Requirements"
                      description="Before opening a deal room, verify your identity and two-factor session."
                    >
                      <div className="flex flex-col gap-4">
                        <p className="text-16 text-ink">
                          Focus stays trapped cleanly inside this Radix dialog. Press
                          Escape or activate Close to return focus.
                        </p>
                        <div className="flex justify-end gap-2">
                          <DialogClose asChild>
                            <Button variant="primary">Acknowledge</Button>
                          </DialogClose>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card highlighted>
                <CardHeader>
                  <CardTitle>Highlighted Callout Card</CardTitle>
                  <CardDescription>
                    Pale Blue (#E8EEF6) surface reserved for selected rows and key
                    next-step callouts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-16 text-ink">
                    Body text uses Ink (#1F2933) on Pale Blue (12.64:1 contrast).
                  </p>
                </CardContent>
                <CardFooter>
                  <span className="text-14 text-slate">8px spacing grid</span>
                  <StatusChip tone="neutral" label="Selected state" />
                </CardFooter>
              </Card>

              <CardStateLoading />
              <CardStateEmpty
                title="Empty State Card"
                description="No matching businesses found for the current filters."
                actionLabel="Reset filters"
                onAction={() => setComponentState("ready")}
              />
              <div className="md:col-span-2">
                <CardStateError
                  message="Bank verification service timed out. No partial verification was saved."
                  onRetry={() => setComponentState("ready")}
                />
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="tokens-contrast" className="flex flex-col gap-8">
          {/* Colour Swatches */}
          <section aria-labelledby="palette-heading" className="flex flex-col gap-4">
            <h2
              id="palette-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              Section 4 Colour Palette (11 Solid Tokens)
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {colorEntries.map(([key, meta]) => (
                <Card key={key} className="flex flex-col gap-4 p-4">
                  <div
                    className="h-16 w-full rounded border border-mist"
                    style={{ backgroundColor: meta.hex }}
                    aria-label={`${meta.label} color swatch ${meta.hex}`}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-16 font-semibold text-deep-navy">
                      {meta.label}
                    </span>
                    <code className="rounded border border-mist bg-cloud px-2 py-2 text-14 text-ink tabular-figures">
                      {meta.hex}
                    </code>
                  </div>
                  <span className="text-14 text-slate">{meta.role}</span>
                </Card>
              ))}
            </div>
          </section>

          {/* Contrast Audit Table */}
          <section aria-labelledby="contrast-heading" className="flex flex-col gap-4">
            <h2
              id="contrast-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              WCAG AA Contrast Verification
            </h2>
            <Card className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-mist">
                    <th className="py-2 pr-4 text-14 font-semibold text-deep-navy">
                      Pairing
                    </th>
                    <th className="py-2 pr-4 text-14 font-semibold text-deep-navy">
                      Preview
                    </th>
                    <th className="py-2 pr-4 text-14 font-semibold text-deep-navy">
                      Ratio
                    </th>
                    <th className="py-2 text-14 font-semibold text-deep-navy">
                      Standard
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {APPROVED_TEXT_PAIRS.map((pair) => {
                    const ratio = contrastRatio(pair.fg, pair.bg);
                    const passes = meetsWcagAA(pair.fg, pair.bg);
                    return (
                      <tr key={pair.name} className="border-b border-mist">
                        <td className="py-2 pr-4 text-16 text-ink">{pair.name}</td>
                        <td className="py-2 pr-4">
                          <span
                            className="inline-block rounded border border-mist px-2 py-2 text-14 font-medium"
                            style={{ color: pair.fg, backgroundColor: pair.bg }}
                          >
                            Sample Text
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-16 font-medium text-deep-navy tabular-figures">
                          {ratio}:1
                        </td>
                        <td className="py-2">
                          <StatusChip
                            tone={passes ? "verified" : "risk"}
                            label={passes ? "Pass AA (>=4.5:1)" : "Fail"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {APPROVED_UI_INDICATOR_PAIRS.map((pair) => {
                    const ratio = contrastRatio(pair.fg, pair.bg);
                    const passes = meetsWcagAA(pair.fg, pair.bg, {
                      isUiComponentOrLargeText: true,
                    });
                    return (
                      <tr key={pair.name} className="border-b border-mist">
                        <td className="py-2 pr-4 text-16 text-ink">{pair.name}</td>
                        <td className="py-2 pr-4">
                          <span
                            className="inline-block rounded px-2 py-2 text-14 font-medium"
                            style={{
                              color:
                                pair.bg === SECTION_4_COLORS.deepNavy
                                  ? SECTION_4_COLORS.white
                                  : SECTION_4_COLORS.ink,
                              backgroundColor: pair.bg,
                              border: `2px solid ${pair.fg}`,
                            }}
                          >
                            Border / Icon UI
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-16 font-medium text-deep-navy tabular-figures">
                          {ratio}:1
                        </td>
                        <td className="py-2">
                          <StatusChip
                            tone={passes ? "caution" : "risk"}
                            label={passes ? "Pass UI 1.4.11 (>=3:1)" : "Fail"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>

          {/* Typography & Tabular Figures */}
          <section aria-labelledby="typography-heading" className="flex flex-col gap-4">
            <h2
              id="typography-heading"
              className="font-serif text-28 font-semibold text-deep-navy"
            >
              Typography Scale (14 / 16 / 20 / 28 / 40) &amp; Tabular Figures
            </h2>
            <Card className="flex flex-col gap-6">
              {Object.entries(TYPE_SCALE).map(([size, info]) => (
                <div
                  key={size}
                  className="flex flex-col gap-2 border-b border-mist pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-14 text-slate">
                    <span className="font-semibold text-deep-navy tabular-figures">
                      {info.px}px ({info.rem})
                    </span>
                    <span>{info.usage}</span>
                  </div>
                  <div
                    style={{ fontSize: `${info.px}px`, lineHeight: info.lineHeight }}
                    className={
                      info.px >= 20
                        ? "font-serif font-semibold text-deep-navy"
                        : "font-sans text-ink"
                    }
                  >
                    {info.px >= 28
                      ? "Verified financials build buyer confidence."
                      : "Every screen answers: Can I trust this? What happens next?"}
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-2 rounded border border-mist bg-cloud p-4">
                <span className="text-14 font-medium text-slate">
                  Tabular Figures Alignment (Default Currency: INR)
                </span>
                <div className="flex flex-col gap-2 font-sans text-20 font-semibold text-deep-navy tabular-figures">
                  <span>{formatCurrency(12_500_000, { currency: "INR" })}</span>
                  <span>{formatCurrency(4_250_000, { currency: "INR" })}</span>
                  <span>{formatCurrency(890_000, { currency: "INR" })}</span>
                </div>
              </div>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="focused-three-color" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Focused 3-Accent View Verification</CardTitle>
              <CardDescription>
                Product screens combine neutrals (Cloud, White, Ink, Slate, Mist) with
                at most 3 non-neutral Section 4 colors: Deep Navy, Trust Blue, and
                Verified Green.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetricTile
                  label="Verified MRR (Sample)"
                  value={1_450_000}
                  unit="CURRENCY"
                  currency="INR"
                  sourceLabel="Stripe"
                  isSampleData
                  referenceNow={REFERENCE_NOW}
                  verification={{
                    id: "focused-sample-01",
                    provider: "Stripe",
                    status: "VERIFIED",
                    verifiedAt: "2026-11-12T08:00:00.000Z",
                    expiresAt: "2026-11-19T08:00:00.000Z",
                  }}
                />
                <Card className="flex flex-col justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <h3 className="font-serif text-20 font-semibold text-deep-navy">
                      Next step for Buyer
                    </h3>
                    <p className="text-16 text-ink">
                      Complete NDA e-signature to unlock redacted business name and
                      customer breakdown.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary">Proceed to NDA</Button>
                    <Button variant="action">Inspect Verification</Button>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
