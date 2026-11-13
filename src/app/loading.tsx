import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateLoading } from "@/components/ui/card";

export default function AppLoading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
          Loading marketplace
        </h1>
        <CardStateLoading
          title="Loading Baton"
          description="Checking verification records and preparing the screen."
        />
      </div>
    </AppShell>
  );
}
