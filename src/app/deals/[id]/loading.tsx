import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CardStateLoading } from "@/components/ui/card";

export default function DealRoomLoading() {
  return (
    <AppShell activeNav="deals">
      <div className="flex flex-col gap-6">
        <div className="h-10 w-72 rounded bg-pale-blue" aria-hidden="true" />
        <CardStateLoading
          title="Loading deal room"
          description="Retrieving deal room records, documents, and audit trail."
        />
      </div>
    </AppShell>
  );
}
