import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateLoading } from "@/components/ui/card";

export default function ListingDetailLoading() {
  return (
    <AppShell activeNav="listings">
      <div className="flex flex-col gap-6">
        <div className="h-10 w-80 rounded bg-pale-blue" aria-hidden="true" />
        <CardStateLoading
          title="Loading listing"
          description="Fetching business listing details and verification records."
        />
      </div>
    </AppShell>
  );
}
