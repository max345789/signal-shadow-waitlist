"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HomeThesisForm() {
  const router = useRouter();
  const [prompt, setPrompt] = React.useState("");
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = React.useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Describe the kind of business you want to buy before previewing.");
      return;
    }

    setError(undefined);
    setSubmitting(true);
    router.push(`/style-guide?thesisPrompt=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 sm:flex-row sm:items-start"
    >
      <div className="flex-1">
        <Input
          name="thesisPrompt"
          label="Acquisition thesis"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            if (error) setError(undefined);
          }}
          error={error}
          placeholder="e.g., B2B SaaS in India, ₹50L+ net profit, under 10 owner hours/week"
          helperText="Thesis matching launches in Phase 2. Submitting previews the Phase 0 component system."
          required
        />
      </div>
      <div className="sm:pt-8">
        <Button type="submit" variant="primary" size="md" loading={submitting} loadingLabel="Opening preview...">
          <span>Preview system</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
