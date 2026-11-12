import * as React from "react";
import { cn } from "@/lib/cn";
import {
  formatCount,
  formatCurrency,
  formatPercentage,
  type CurrencyCode,
} from "@/lib/format/currency";
import {
  evaluateVerification,
  type VerificationRecord,
} from "@/lib/domain/verification";
import {
  Card,
  CardStateEmpty,
  CardStateError,
  CardStateLoading,
} from "@/components/ui/card";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";

export type MetricUnitType = "CURRENCY" | "PERCENT" | "COUNT";

export interface MetricTileProps {
  label: string;
  value: number | null;
  unit: MetricUnitType;
  currency?: CurrencyCode;
  compactCurrency?: boolean;
  sourceLabel: string;
  verification?: VerificationRecord | null;
  isSampleData?: boolean;
  referenceNow?: Date | string;
  allowCautionAccent?: boolean;
  allowRiskAccent?: boolean;
  state?: "ready" | "loading" | "empty" | "error";
  errorMessage?: string;
  onRetry?: () => void;
  className?: string;
}

function formatMetricValue(
  value: number,
  unit: MetricUnitType,
  currency?: CurrencyCode,
  compact?: boolean
): string {
  switch (unit) {
    case "CURRENCY":
      return formatCurrency(value, { currency, compact });
    case "PERCENT":
      return formatPercentage(value);
    case "COUNT":
      return formatCount(value);
  }
}

function getChipTone(
  effectiveState: ReturnType<typeof evaluateVerification>["effectiveState"],
  allowCautionAccent: boolean,
  allowRiskAccent: boolean
): StatusChipTone {
  switch (effectiveState) {
    case "verified":
      return "verified";
    case "pending":
      return allowCautionAccent ? "pending" : "seller-reported";
    case "expired":
      return allowCautionAccent ? "caution" : "seller-reported";
    case "failed":
      return allowRiskAccent ? "risk" : "seller-reported";
    case "seller-reported":
    default:
      return "seller-reported";
  }
}

export function MetricTile({
  label,
  value,
  unit,
  currency,
  compactCurrency = false,
  sourceLabel,
  verification = null,
  isSampleData = false,
  referenceNow,
  allowCautionAccent = true,
  allowRiskAccent = true,
  state = "ready",
  errorMessage,
  onRetry,
  className,
}: MetricTileProps) {
  if (state === "loading") {
    return (
      <CardStateLoading
        title={`Refreshing ${label}`}
        description="Reading latest verified metric from connector."
      />
    );
  }

  if (state === "error") {
    return (
      <CardStateError
        title={`${label} unavailable`}
        message={errorMessage ?? "Could not fetch metric from connected source."}
        onRetry={onRetry}
      />
    );
  }

  if (state === "empty" || value === null) {
    return (
      <CardStateEmpty
        title={label}
        description="No figure has been provided or connected for this metric yet."
      />
    );
  }

  const nowDate =
    typeof referenceNow === "string"
      ? new Date(referenceNow)
      : (referenceNow ?? new Date());

  const trust = evaluateVerification(verification, nowDate);
  const chipTone = getChipTone(
    trust.effectiveState,
    allowCautionAccent,
    allowRiskAccent
  );
  const formattedValue = formatMetricValue(value, unit, currency, compactCurrency);

  return (
    <Card
      className={cn(
        "flex flex-col justify-between gap-4",
        trust.isVerified ? "border-verified-green" : "border-mist",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-16 font-medium text-slate">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          {isSampleData ? (
            <StatusChip tone="neutral" label="Sample data" />
          ) : null}
          <StatusChip
            tone={chipTone}
            label={trust.label}
            emphasis={trust.isVerified ? "solid" : "outline"}
          />
        </div>
      </div>

      <div className="text-28 font-semibold text-deep-navy tabular-figures sm:text-40">
        {formattedValue}
      </div>

      <div className="flex flex-col gap-2 border-t border-mist pt-4 text-14 text-slate">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Source:{" "}
            <strong className="font-medium text-ink">
              {trust.isVerified && verification ? verification.provider : sourceLabel}
            </strong>
          </span>
        </div>
        <span>
          {trust.lastVerifiedLabel ?? trust.detail}
        </span>
      </div>
    </Card>
  );
}
