"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { HelpCircle } from "lucide-react";

export function InfoTooltip({
  label,
  explanation,
}: {
  label: string;
  explanation: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded border border-mist bg-white text-trust-blue hover:bg-pale-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trust-blue"
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={8}
            className="z-50 max-w-[320px] rounded border border-mist bg-deep-navy p-4 text-14 text-white"
          >
            {explanation}
            <TooltipPrimitive.Arrow className="fill-deep-navy" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
