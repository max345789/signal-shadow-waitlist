"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DEAL_STAGE_DEFINITIONS,
  type DealStageType,
  type StageOwnerRole,
  type StageStatusValue,
} from "@/lib/domain/deal-stages";
import {
  Card,
  CardStateEmpty,
  CardStateError,
  CardStateLoading,
} from "@/components/ui/card";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";

export interface StageTrackerItem {
  stage: DealStageType;
  status: StageStatusValue;
  ownerRole: StageOwnerRole;
  requiredAction: string;
  timestampLabel?: string | null;
}

export interface StageTrackerProps {
  stages: StageTrackerItem[];
  selectedStage?: DealStageType;
  onSelectStage?: (stage: DealStageType) => void;
  state?: "ready" | "loading" | "empty" | "error";
  errorMessage?: string;
  onRetry?: () => void;
}

const OWNER_LABELS: Record<StageOwnerRole, string> = {
  BUYER: "Buyer",
  SELLER: "Seller",
  BOTH: "Buyer & Seller",
  ADMIN: "Platform Reviewer",
};

const STATUS_META: Record<
  StageStatusValue,
  {
    label: string;
    chipTone: StatusChipTone;
    borderClass: string;
    surfaceClass: string;
    Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    iconClass: string;
  }
> = {
  COMPLETED: {
    label: "Completed",
    chipTone: "completed",
    borderClass: "border-verified-green",
    surfaceClass: "bg-white",
    Icon: CheckCircle2,
    iconClass: "text-verified-green",
  },
  ACTIVE: {
    label: "In progress",
    chipTone: "neutral",
    borderClass: "border-trust-blue",
    surfaceClass: "bg-pale-blue",
    Icon: CircleDot,
    iconClass: "text-trust-blue",
  },
  PENDING: {
    label: "Pending",
    chipTone: "pending",
    borderClass: "border-mist",
    surfaceClass: "bg-white",
    Icon: Clock,
    iconClass: "text-slate",
  },
  BLOCKED: {
    label: "Blocked",
    chipTone: "risk",
    borderClass: "border-brick-red",
    surfaceClass: "bg-white",
    Icon: AlertTriangle,
    iconClass: "text-brick-red",
  },
};

export function StageTracker({
  stages,
  selectedStage,
  onSelectStage,
  state = "ready",
  errorMessage,
  onRetry,
}: StageTrackerProps) {
  const defaultFocusedStage =
    selectedStage ??
    stages.find((s) => s.status === "ACTIVE")?.stage ??
    stages[0]?.stage;

  const [internalSelected, setInternalSelected] = React.useState<
    DealStageType | undefined
  >(defaultFocusedStage);

  const activeSelection = selectedStage ?? internalSelected;
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  if (state === "loading") {
    return (
      <CardStateLoading
        title="Loading deal stages"
        description="Fetching stage owners, timestamps, and required actions."
      />
    );
  }

  if (state === "error") {
    return (
      <CardStateError
        title="Unable to load deal tracker"
        message={errorMessage ?? "Deal room stage state could not be verified."}
        onRetry={onRetry}
      />
    );
  }

  if (state === "empty" || stages.length === 0) {
    return (
      <CardStateEmpty
        title="No deal stages initialized"
        description="Stages appear here once an introduction is opened with a seller."
      />
    );
  }

  const inspectedItem =
    stages.find((s) => s.stage === activeSelection) ?? stages[0]!;
  const inspectedMeta = STATUS_META[inspectedItem.status];
  const inspectedDef = DEAL_STAGE_DEFINITIONS[inspectedItem.stage];

  const handleSelect = (stage: DealStageType) => {
    setInternalSelected(stage);
    onSelectStage?.(stage);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % stages.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + stages.length) % stages.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = stages.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const targetStage = stages[nextIndex];
      if (targetStage) {
        handleSelect(targetStage.stage);
        buttonRefs.current[nextIndex]?.focus();
      }
    }
  };

  return (
    <Card className="flex flex-col gap-6" aria-label="Deal room stage tracker">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-serif text-20 font-semibold text-deep-navy">
            Deal progression
          </h3>
          <p className="text-16 text-slate">
            Buyer and seller see the same verified stage sequence and next action.
          </p>
        </div>
        <span className="text-14 font-medium text-slate tabular-figures">
          {stages.filter((s) => s.status === "COMPLETED").length} of {stages.length} completed
        </span>
      </div>

      {/* Responsive 7-stage list: vertical stack on 360px mobile, grid on desktop */}
      <ol className="grid grid-cols-1 gap-2 xl:grid-cols-7">
        {stages.map((item, idx) => {
          const def = DEAL_STAGE_DEFINITIONS[item.stage];
          const meta = STATUS_META[item.status];
          const Icon = meta.Icon;
          const isSelected = inspectedItem.stage === item.stage;
          const isCurrent = item.status === "ACTIVE";

          return (
            <li key={item.stage} className="min-w-0">
              <button
                ref={(el) => {
                  buttonRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => handleSelect(item.stage)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                aria-current={isCurrent ? "step" : undefined}
                aria-pressed={isSelected}
                className={cn(
                  "flex min-h-12 w-full flex-col items-start justify-between gap-2 rounded border p-4 text-left state-transition",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trust-blue",
                  meta.borderClass,
                  isSelected ? "bg-pale-blue" : meta.surfaceClass
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-14 font-semibold text-slate tabular-figures">
                    0{idx + 1}
                  </span>
                  <Icon
                    className={cn("h-4 w-4 shrink-0", meta.iconClass)}
                    aria-hidden={true}
                  />
                </div>
                <span className="text-16 font-semibold text-deep-navy">
                  {def.label}
                </span>
                <span className="text-14 text-slate">{meta.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Active / Selected stage detail panel */}
      <div
        className="flex flex-col gap-4 rounded border border-mist bg-cloud p-4"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-14 font-medium text-slate">
              Selected stage
            </span>
            <h4 className="font-serif text-20 font-semibold text-deep-navy">
              {inspectedDef.label}
            </h4>
          </div>
          <StatusChip tone={inspectedMeta.chipTone} label={inspectedMeta.label} />
        </div>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <dt className="text-14 font-medium text-slate">Stage owner</dt>
            <dd className="text-16 font-medium text-ink">
              {OWNER_LABELS[inspectedItem.ownerRole]}
            </dd>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <dt className="text-14 font-medium text-slate">What happens next</dt>
            <dd className="text-16 text-ink">{inspectedItem.requiredAction}</dd>
          </div>
        </dl>

        <div className="border-t border-mist pt-4 text-14 text-slate tabular-figures">
          {inspectedItem.timestampLabel
            ? `Recorded: ${inspectedItem.timestampLabel}`
            : "No completion timestamp recorded yet."}
        </div>
      </div>
    </Card>
  );
}
