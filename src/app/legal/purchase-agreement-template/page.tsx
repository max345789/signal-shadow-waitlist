import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Purchase Agreement Template — Trust Marketplace",
  description: "Purchase Agreement template for Trust Marketplace deal rooms. Needs qualified legal review.",
};

export default function PurchaseAgreementTemplatePage() {
  return (
    <AppShell activeNav={undefined}>
      <div className="flex flex-col gap-8 max-w-[800px]">
        {/* Legal review disclaimer banner */}
        <div
          role="alert"
          className="flex items-start gap-3 rounded border border-amber bg-warning-bg p-4"
        >
          <AlertTriangle
            className="h-6 w-6 shrink-0 text-amber mt-0.5"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1">
            <p className="text-16 font-semibold text-ink">
              Needs legal review — not yet reviewed by qualified counsel
            </p>
            <p className="text-16 text-ink">
              This Purchase Agreement template is a skeleton only. It has not been
              reviewed by a qualified attorney. All parties must obtain independent
              legal advice before executing any purchase agreement. This template
              does not constitute legal advice.
            </p>
          </div>
        </div>

        <h1 className="font-serif text-40 font-semibold text-deep-navy">
          Business Purchase Agreement Template
        </h1>

        <p className="text-16 text-slate">
          Template version: [DATE — pending legal review] ·{" "}
          <Link
            href="/deals"
            className="text-trust-blue underline hover:text-deep-navy"
          >
            Download from your Deal Room vault
          </Link>
        </p>

        <section aria-labelledby="pa-parties-heading" className="flex flex-col gap-4">
          <h2
            id="pa-parties-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            1. Parties &amp; Recitals
          </h2>
          <p className="text-16 text-ink">
            This Business Purchase Agreement (&quot;Agreement&quot;) is entered into as of
            [CLOSING DATE] between:
          </p>
          <ul className="flex flex-col gap-2 text-16 text-ink list-disc pl-4">
            <li>
              <strong>Seller</strong>: [SELLER LEGAL NAME], registered at [REGISTERED ADDRESS]
            </li>
            <li>
              <strong>Buyer</strong>: [BUYER LEGAL NAME], registered at [REGISTERED ADDRESS]
            </li>
          </ul>
          <p className="text-16 text-ink">
            Seller wishes to sell and Buyer wishes to purchase [BUSINESS NAME]
            (&quot;Business&quot;) on the terms and conditions set out in this Agreement.
          </p>
        </section>

        <section aria-labelledby="purchase-price-heading" className="flex flex-col gap-4">
          <h2
            id="purchase-price-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            2. Purchase Price &amp; Escrow
          </h2>
          <p className="text-16 text-ink">
            The total purchase price is [AMOUNT] [CURRENCY] (&quot;Purchase Price&quot;),
            to be paid via licensed third-party escrow in accordance with escrow
            instructions agreed between the parties.
          </p>
          <p className="text-16 text-ink">
            Trust Marketplace does not hold funds. All consideration is held by
            the designated licensed escrow provider until transfer conditions are
            met.
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Payment mechanics, milestones, and conditions to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="assets-heading" className="flex flex-col gap-4">
          <h2
            id="assets-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            3. Assets Transferred
          </h2>
          <p className="text-16 text-ink">
            The assets to be transferred include: [TO BE SPECIFIED — domain names,
            code repositories, customer lists, contracts, intellectual property,
            equipment, etc.].
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Full asset schedule and excluded assets to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="representations-heading" className="flex flex-col gap-4">
          <h2
            id="representations-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            4. Representations &amp; Warranties
          </h2>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Representations and warranties of Seller and Buyer, including disclosure obligations and financial data accuracy, to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="conditions-heading" className="flex flex-col gap-4">
          <h2
            id="conditions-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            5. Conditions to Closing
          </h2>
          <div className="rounded border border-mist bg-cloud p-4">
            <h3 className="font-serif text-20 font-semibold text-deep-navy mb-2">
              Regulatory Checklist Note
            </h3>
            <ul className="flex flex-col gap-2 text-16 text-ink list-disc pl-4">
              <li>Escrow licensing: confirm provider is licensed in buyer&apos;s and seller&apos;s jurisdictions</li>
              <li>KYC/AML: both parties may need to complete identity and source-of-funds verification</li>
              <li>Financial data handling: customer data transfer must comply with applicable data protection laws and may require customer notification</li>
              <li>Competition/antitrust clearance: may be required for transactions above jurisdictional thresholds</li>
              <li>Stamp duty and taxes: applicable taxes on asset transfer vary by jurisdiction and asset type</li>
              <li>Regulatory approvals: sector-specific licences may need to be transferred or reapplied for</li>
            </ul>
          </div>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Conditions precedent to closing to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="governing-law-heading" className="flex flex-col gap-4">
          <h2
            id="governing-law-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            6. Governing Law &amp; Dispute Resolution
          </h2>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Governing law, jurisdiction, and dispute resolution mechanism (litigation/arbitration) to be drafted by qualified counsel per applicable jurisdiction.]
          </p>
        </section>

        <div className="flex flex-col gap-2 border-t border-mist pt-6">
          <p className="text-16 text-slate">
            Related documents:{" "}
            <Link
              href="/legal/nda-template"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              NDA Template
            </Link>
            {" · "}
            <Link
              href="/legal/terms"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              Terms of Service
            </Link>
            {" · "}
            <Link
              href="/legal/privacy"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
