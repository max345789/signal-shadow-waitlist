"use client";

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateError } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell
      trustBanner={{
        canTrustAnswer:
          "An unexpected error interrupted loading. No partial or unverified state was saved.",
        nextStepAnswer:
          "Select Try again to reload the view cleanly, or navigate back using the header.",
      }}
    >
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
          Unable to load page
        </h1>
        <CardStateError
          title="Something went wrong"
          message={
            error.message ||
            "Could not load requested marketplace records. Try again shortly."
          }
          onRetry={reset}
        />
      </div>
    </AppShell>
  );
}
