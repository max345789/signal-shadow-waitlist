import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { SITE_CONFIG } from "@/lib/config/site";

export const metadata = {
  title: "Baton | Terms of Service — Platform terms and user conditions",
  description:
    "Terms of Service for Baton. Platform-only listing and introduction terms based on the Marketplace Legal Pack.",
};

export default function TermsOfServicePage() {
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
              Terms of Service
            </h1>
            <p className="text-14 text-slate">
              Last updated: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
            </p>
          </div>

          {/* C2 Platform Role Invariant */}
          <section className="flex flex-col gap-4 rounded border border-mist bg-cloud p-5">
            <div className="flex items-center gap-2 text-deep-navy font-semibold text-16">
              <ShieldCheck className="h-5 w-5 text-trust-blue" />
              <span>Platform Role &amp; Limitation of Liability</span>
            </div>
            <p className="text-14 text-ink leading-relaxed">
              {SITE_CONFIG.platformRole}
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              1. Platform Nature and Scope
            </h2>
            <p>
              Baton (&quot;we&quot;, &quot;us&quot;, or &quot;the platform&quot;) operates solely as an
              information directory, listing catalog, and direct introduction facility
              for prospective buyers and sellers of digital businesses, software assets,
              and online commercial properties.
            </p>
            <p>
              Baton is not a business broker, investment bank, escrow agent, custodian,
              financial advisor, tax consultant, or law firm. We do not represent either
              party in any commercial transaction.
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              2. User Due Diligence &amp; No Guarantee
            </h2>
            <p>
              Listing badges (such as Email, Phone, Domain, Revenue, and Traffic)
              certify exclusively the single automated technical test specified by each badge
              at the time of verification. They do not constitute an audit, valuation,
              title confirmation, or financial guarantee.
            </p>
            <p>
              Buyers and sellers bear total independent responsibility for executing
              their own legal, technical, financial, and tax due diligence before
              transferring any assets or funds outside the platform.
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              3. Flat Fees and Zero Commission
            </h2>
            <p>
              Baton charges upfront flat fees for listing publication, optional featured
              discovery placement, and buyer early match alerts. Baton never takes a
              percentage cut or success commission upon closing.
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              4. Code of Conduct &amp; Prohibited Activities
            </h2>
            <p>
              Users may not post fabricated metrics, engage in fraudulent communications,
              impersonate business owners, or upload infringing intellectual property.
              Violations are subject to immediate removal under our Listing Rules and
              Report and Takedown Policy.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
