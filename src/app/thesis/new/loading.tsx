import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateLoading } from "@/components/ui/card";

export default function ThesisLoading() {
  return (
    <AppShell activeNav="thesis">
      <div className="flex flex-col gap-6">
        <div className="h-10 w-64 rounded bg-pale-blue" aria-hidden="true" />
        <CardStateLoading
          title="Loading thesis builder"
          description="Preparing your acquisition thesis and match criteria."
        />
      </div>
    </AppShell>
  );
}
