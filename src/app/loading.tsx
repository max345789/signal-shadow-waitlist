import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateLoading } from "@/components/ui/card";

export default function AppLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <CardStateLoading
          title="Loading Trust Marketplace"
          description="Checking verification records and preparing the screen."
        />
      </div>
    </AppShell>
  );
}
