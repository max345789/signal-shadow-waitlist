import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — Trust Marketplace",
  description: "Privacy Policy skeleton for Trust Marketplace. Needs qualified legal review before go-live.",
};

export default function PrivacyPolicyPage() {
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
              This document is a skeleton template only. It has not been reviewed
              by a qualified attorney. It must not be published as a binding
              privacy policy until reviewed and approved by qualified counsel for
              each applicable jurisdiction.
            </p>
          </div>
        </div>

        <h1 className="font-serif text-40 font-semibold text-deep-navy">
          Privacy Policy
        </h1>

        <p className="text-16 text-slate">Last updated: [DATE — pending legal review]</p>

        <section aria-labelledby="overview-heading" className="flex flex-col gap-4">
          <h2
            id="overview-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            1. Overview
          </h2>
          <p className="text-16 text-ink">
            Trust Marketplace (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting
            your personal data. This Privacy Policy describes how we collect,
            use, store, and disclose information when you use our Platform.
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Full overview and data controller details to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="data-collected-heading" className="flex flex-col gap-4">
          <h2
            id="data-collected-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            2. Data We Collect
          </h2>
          <p className="text-16 text-ink">
            We may collect the following categories of personal data:
          </p>
          <ul className="flex flex-col gap-2 text-16 text-ink list-disc pl-4">
            <li>Identity data (name, email address, company registration details)</li>
            <li>Financial data (escrow transaction details, deal values — processed by licensed third-party escrow providers)</li>
            <li>Verification data (identity verification results, proof of funds documentation)</li>
            <li>Usage data (pages visited, features used, session information)</li>
            <li>Communication data (messages in deal rooms, documents uploaded to vault)</li>
          </ul>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Full data inventory to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="legal-basis-heading" className="flex flex-col gap-4">
          <h2
            id="legal-basis-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            3. Legal Basis for Processing
          </h2>
          <div className="rounded border border-mist bg-cloud p-4">
            <h3 className="font-serif text-20 font-semibold text-deep-navy mb-2">
              Regulatory Checklist Note
            </h3>
            <ul className="flex flex-col gap-2 text-16 text-ink list-disc pl-4">
              <li>GDPR (EU) — lawful basis must be established for each processing activity</li>
              <li>India DPDP Act 2023 — consent framework and data principal rights to be implemented</li>
              <li>CCPA (California) — do-not-sell rights, data subject requests, and opt-out mechanisms</li>
              <li>Financial data handling: special obligations under applicable financial regulations</li>
              <li>Cross-border data transfers: standard contractual clauses or adequacy decisions required</li>
              <li>KYC/AML data retention: mandatory retention periods vary by jurisdiction</li>
            </ul>
          </div>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Legal bases for each processing activity to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="data-sharing-heading" className="flex flex-col gap-4">
          <h2
            id="data-sharing-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            4. Data Sharing &amp; Third Parties
          </h2>
          <p className="text-16 text-ink">
            We share data with licensed third-party escrow providers (Escrow.com,
            Castler Escrow) solely for the purpose of facilitating secure
            transactions. We do not sell personal data to third parties.
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Third-party data sharing agreements and data processing addenda to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="rights-heading" className="flex flex-col gap-4">
          <h2
            id="rights-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            5. Your Rights
          </h2>
          <p className="text-16 text-ink">
            Depending on your jurisdiction, you may have rights including: access,
            rectification, erasure, portability, restriction of processing, and
            objection.
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Data subject rights procedures and contact mechanisms to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="retention-heading" className="flex flex-col gap-4">
          <h2
            id="retention-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            6. Data Retention
          </h2>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Retention schedule by data category, including mandatory regulatory retention periods for KYC/AML records, to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="contact-heading" className="flex flex-col gap-4">
          <h2
            id="contact-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            7. Contact &amp; Data Protection Officer
          </h2>
          <p className="text-16 text-ink">
            [PLACEHOLDER — DPO contact details and complaints procedure to be drafted by qualified counsel.]
          </p>
        </section>

        <div className="flex flex-col gap-2 border-t border-mist pt-6">
          <p className="text-16 text-slate">
            Related legal documents:{" "}
            <Link
              href="/legal/terms"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              Terms of Service
            </Link>
            {" · "}
            <Link
              href="/legal/nda-template"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              NDA Template
            </Link>
            {" · "}
            <Link
              href="/legal/purchase-agreement-template"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              Purchase Agreement Template
            </Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
