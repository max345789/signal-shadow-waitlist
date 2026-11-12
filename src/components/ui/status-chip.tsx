import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type StatusChipTone =
  | "verified"
  | "completed"
  | "pending"
  | "caution"
  | "risk"
  | "seller-reported"
  | "neutral";

export interface StatusChipProps {
  tone: StatusChipTone;
  label: string;
  emphasis?: "solid" | "outline";
  className?: string;
}

const TONE_CONFIG: Record<
  StatusChipTone,
  {
    solidClass: string;
    outlineClass: string;
    iconClass: string;
    Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  }
> = {
  verified: {
    solidClass: "bg-verified-green text-white border-verified-green",
    outlineClass: "bg-white text-verified-green border-verified-green",
    iconClass: "text-current",
    Icon: ShieldCheck,
  },
  completed: {
    solidClass: "bg-verified-green text-white border-verified-green",
    outlineClass: "bg-white text-verified-green border-verified-green",
    iconClass: "text-current",
    Icon: CheckCircle2,
  },
  // Amber (#B7791F) fails 4.5:1 text contrast with both White and Ink;
  // therefore pending/caution ALWAYS pairs Ink (#1F2933) text (14.76:1) on White (#FFFFFF)
  // with Amber (#B7791F) border and icon (3.64:1 WCAG 1.4.11 UI contrast).
  pending: {
    solidClass: "bg-white text-ink border-amber",
    outlineClass: "bg-white text-ink border-amber",
    iconClass: "text-amber",
    Icon: Clock,
  },
  caution: {
    solidClass: "bg-white text-ink border-amber",
    outlineClass: "bg-white text-ink border-amber",
    iconClass: "text-amber",
    Icon: AlertTriangle,
  },
  risk: {
    solidClass: "bg-brick-red text-white border-brick-red",
    outlineClass: "bg-white text-brick-red border-brick-red",
    iconClass: "text-current",
    Icon: XCircle,
  },
  "seller-reported": {
    solidClass: "bg-cloud text-ink border-mist",
    outlineClass: "bg-white text-slate border-mist",
    iconClass: "text-slate",
    Icon: FileText,
  },
  neutral: {
    solidClass: "bg-pale-blue text-deep-navy border-mist",
    outlineClass: "bg-white text-deep-navy border-mist",
    iconClass: "text-trust-blue",
    Icon: Info,
  },
};

const DEFAULT_TONE_LABELS: Record<StatusChipTone, string> = {
  verified: "Verified",
  completed: "Completed",
  pending: "Pending",
  caution: "Caution",
  risk: "Risk",
  "seller-reported": "Seller-reported",
  neutral: "Status",
};

/**
 * Status is NEVER colour alone: StatusChip always renders an icon AND a visible text label.
 */
export function StatusChip({
  tone,
  label,
  emphasis = "outline",
  className,
}: StatusChipProps) {
  const safeLabel = label.trim() || DEFAULT_TONE_LABELS[tone];
  const config = TONE_CONFIG[tone];
  const Icon = config.Icon;

  return (
    <span
      data-status-tone={tone}
      className={cn(
        "inline-flex items-center gap-2 rounded border px-2 py-2 text-14 font-medium leading-none state-transition",
        emphasis === "solid" ? config.solidClass : config.outlineClass,
        className
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", config.iconClass)} aria-hidden={true} />
      <span>{safeLabel}</span>
    </span>
  );
}
