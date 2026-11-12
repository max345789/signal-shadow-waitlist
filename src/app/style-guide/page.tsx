import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { StyleGuideClient } from "@/components/style-guide/style-guide-client";

export default async function StyleGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ thesisPrompt?: string }>;
}) {
  const params = await searchParams;
  const thesisPrompt =
    typeof params.thesisPrompt === "string" && params.thesisPrompt.trim().length > 0
      ? params.thesisPrompt.trim()
      : undefined;

  return (
    <AppShell
      activeNav="style-guide"
      trustBanner={{
        canTrustAnswer:
          "Every token and component below strictly enforces Section 4 solid colors and WCAG AA >= 4.5:1 text contrast.",
        nextStepAnswer:
          "Use the state preview toggles (Ready / Loading / Empty / Error) and keyboard Tab navigation to audit each component.",
      }}
    >
      <StyleGuideClient thesisPrompt={thesisPrompt} />
    </AppShell>
  );
}
