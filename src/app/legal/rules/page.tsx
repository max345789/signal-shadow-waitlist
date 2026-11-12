import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AlertTriangle, BookOpen } from "lucide-react";

export const metadata = {
  title: "Baton | Listing Rules — Marketplace publishing guidelines",
  description:
    "Listing Rules for Baton. Accuracy requirements, prohibited businesses, and disclosure rules for sellers.",
};

export default function ListingRulesPage() {
  return (
    <AppShell activeNav={undefined}>
      <div className="py-8">
        <div className="flex flex-col gap-8 max-w-3xl mx-auto">
          {/* C8 Required Legal Review Banner */}
          <div
            role="alert"
            className="flex items-start gap-3 rounded border border-amber bg-white p-4"
          >
            <AlertTriangle
              className="h-6 w-6 shrink-0 text-amber mt-0.5"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1 text-ink">
              <p className="text-16 font-semibold text-deep-navy">
                Needs legal review
              </p>
              <p className="text-14 text-slate">
                These terms are based on the Marketplace Legal Pack and must be
                approved by a qualified lawyer before production launch.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-36 font-semibold text-deep-navy">
              Listing Rules
            </h1>
            <p className="text-14 text-slate">
              Last updated: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
            </p>
          </div>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              1. Accuracy &amp; Truthfulness
            </h2>
            <p>
              All metrics, revenue figures, profit calculations, customer counts, and
              historical narratives submitted to Baton must be truthful and accurate.
              Sellers must clearly identify seller-reported figures and may not present
              projections or estimates as realized historical revenue.
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              2. Prohibited Listings
            </h2>
            <p>The following types of businesses and assets are strictly forbidden on Baton:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Businesses engaged in illegal goods, narcotics, or unregulated gambling.</li>
              <li>Plagiarized, cloned, or copyright-infringing software codebases.</li>
              <li>Websites built primarily on stolen content, spam, or manipulative traffic schemes.</li>
              <li>Entities subject to legal liens, bankruptcy, or disputed ownership title.</li>
              <li>Multi-level marketing (MLM) schemes or fraudulent investment programs.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              3. Verification Badges
            </h2>
            <p>
              Verification badges (Domain TXT, Stripe/Razorpay revenue, Google Analytics
              traffic) are strictly automated checks. Tampering with DNS records,
              submitting fictitious API tokens, or manipulating connected source data
              results in immediate listing termination and account suspension.
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              4. Review and Removal
            </h2>
            <p>
              Every new listing undergoes platform review prior to marketplace
              publication. Listings reported by users or discovered to violate these rules
              will be removed or hidden under our Report &amp; Takedown Policy.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
