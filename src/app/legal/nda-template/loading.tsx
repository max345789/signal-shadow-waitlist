import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateLoading } from "@/components/ui/card";

export default function LegalNdaLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-[800px]">
        <div className="h-10 w-64 rounded bg-pale-blue" aria-hidden="true" />
        <CardStateLoading
          title="Loading NDA Template"
          description="Fetching legal document content."
        />
      </div>
    </AppShell>
  );
}
