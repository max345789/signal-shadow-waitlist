"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import type { VerificationTypeValue, VerificationStatusValue } from "@/lib/domain/verification";
import { BADGE_SPECIFICATIONS } from "@/lib/domain/verification";

export interface VerificationBadgeProps {
  type: VerificationTypeValue;
  status: VerificationStatusValue;
  provider?: string;
  lastVerifiedAt?: string | null;
  className?: string;
}

export function VerificationBadge({
  type,
  status,
  provider = "Source",
  lastVerifiedAt,
  className = "",
}: VerificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const typeKey = String(type).toUpperCase();
  const spec = BADGE_SPECIFICATIONS[typeKey] || {
    type: "REVENUE",
    title: "Verification",
    checksDescription: "automated check",
    defaultBadgeText: "Verified check",
    tooltipText:
      "This badge confirms only: automated check. It is not a guarantee of the business or its financials.",
  };

  const isVerified = status === "VERIFIED";
  const isFailedOrRevoked = status === "FAILED" || status === "REVOKED" || status === "EXPIRED";

  // C3 Tooltip rule
  const tooltipText = `This badge confirms only: ${spec.checksDescription.toLowerCase()}. It is not a guarantee of the business or its financials.`;

  // C3 Badge text logic
  let badgeLabel = spec.defaultBadgeText;
  if (isVerified) {
    if (typeKey === "REVENUE") {
      badgeLabel = `Revenue read directly from ${provider}.${lastVerifiedAt ? ` Last verified ${lastVerifiedAt}` : ""}`;
    } else if (typeKey === "TRAFFIC") {
      badgeLabel = `Traffic read directly from ${provider}.${lastVerifiedAt ? ` Last verified ${lastVerifiedAt}` : ""}`;
    } else if (typeKey === "DOMAIN") {
      badgeLabel = "Seller controls this domain";
    } else if (typeKey === "EMAIL") {
      badgeLabel = "Email address confirmed";
    } else if (typeKey === "PHONE") {
      badgeLabel = "Phone number confirmed";
    }
  } else if (isFailedOrRevoked) {
    badgeLabel = "Connection lost. Figures are now seller-reported";
  } else {
    badgeLabel = `Awaiting ${provider} verification`;
  }

  // Tone & colors
  const containerClasses = isVerified
    ? "bg-white text-verified-green border-verified-green"
    : isFailedOrRevoked
      ? "bg-white text-amber border-amber"
      : "bg-white text-slate border-mist";

  const Icon = isVerified
    ? CheckCircle2
    : isFailedOrRevoked
      ? AlertTriangle
      : ShieldCheck;

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      <span
        tabIndex={0}
        role="status"
        aria-label={`${spec.title}: ${badgeLabel}`}
        className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-12 font-medium whitespace-nowrap cursor-help transition-colors ${containerClasses}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{badgeLabel}</span>
      </span>

      {showTooltip && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded border border-mist bg-deep-navy px-3 py-2 text-12 leading-relaxed text-white pointer-events-none"
        >
          {tooltipText}
        </div>
      )}
    </div>
  );
}
