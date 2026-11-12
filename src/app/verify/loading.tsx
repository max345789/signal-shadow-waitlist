import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateLoading } from "@/components/ui/card";

export default function VerifyLoading() {
  return (
    <AppShell activeNav="verify">
      <div className="flex flex-col gap-6">
        <div className="h-10 w-64 rounded bg-pale-blue" aria-hidden="true" />
        <CardStateLoading
          title="Loading verification centre"
          description="Fetching verification records and connector status."
        />
      </div>
    </AppShell>
  );
}
