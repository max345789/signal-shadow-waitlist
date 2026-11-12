import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <AppShell>
      <div className="flex flex-col items-start gap-8 max-w-[640px]">
        <div className="flex items-center gap-3">
          <Search className="h-10 w-10 text-trust-blue" aria-hidden="true" />
          <span className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            404
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="font-serif text-28 font-semibold text-deep-navy sm:text-40">
            Page not found
          </h1>
          <p className="text-16 text-ink">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Listings, deal rooms, and verification records are accessed through
            the navigation above.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button asChild variant="primary">
            <Link href="/listings">Return to listings</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Go to home</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
