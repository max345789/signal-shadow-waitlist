import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateLoading } from "@/components/ui/card";

export default function AdminReviewLoading() {
  return (
    <AppShell activeNav="admin">
      <div className="flex flex-col gap-6">
        <div className="h-10 w-64 rounded bg-pale-blue" aria-hidden="true" />
        <CardStateLoading
          title="Loading review queue"
          description="Fetching pending verification submissions and dispute items."
        />
      </div>
    </AppShell>
  );
}
