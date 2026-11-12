"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export function InfoTooltip({
  label,
  explanation,
  align = "right",
}: {
  label: string;
  explanation: string;
  align?: "left" | "right";
}) {
  const [pinned, setPinned] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const tooltipId = React.useId();

  const isOpen = pinned || hovered;

  React.useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setHovered(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPinned(false);
        setHovered(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
        onClick={() => setPinned((prev) => !prev)}
        onFocus={() => setHovered(true)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setHovered(false);
          }
        }}
        className="inline-flex min-h-12 min-w-12 items-center justify-center rounded border border-mist bg-white text-trust-blue state-transition hover:bg-pale-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trust-blue"
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          id={tooltipId}
          role="tooltip"
          className={cn(
            "absolute z-50 mt-2 w-[280px] max-w-[calc(100vw-80px)] rounded border border-mist bg-deep-navy p-4 text-16 text-white",
            align === "right" ? "right-0" : "left-0"
          )}
          style={{ top: "100%" }}
        >
          {explanation}
        </div>
      ) : null}
    </div>
  );
}
