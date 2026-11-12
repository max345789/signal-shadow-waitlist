import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Terms of Service — Trust Marketplace",
  description: "Terms of Service skeleton for Trust Marketplace. Needs qualified legal review before go-live.",
};

export default function TermsOfServicePage() {
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
              by a qualified attorney. It must not be used as a legal agreement
              until reviewed and approved by qualified counsel for the applicable
              jurisdiction(s).
            </p>
          </div>
        </div>

        <h1 className="font-serif text-40 font-semibold text-deep-navy">
          Terms of Service
        </h1>

        <p className="text-16 text-slate">Last updated: [DATE — pending legal review]</p>

        <section aria-labelledby="intro-heading" className="flex flex-col gap-4">
          <h2
            id="intro-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            1. Introduction
          </h2>
          <p className="text-16 text-ink">
            Welcome to Trust Marketplace (&quot;Platform&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By
            accessing or using this Platform, you agree to be bound by these
            Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do
            not use the Platform.
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Full introduction to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="services-heading" className="flex flex-col gap-4">
          <h2
            id="services-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            2. Services Provided
          </h2>
          <p className="text-16 text-ink">
            Trust Marketplace provides a platform for buyers and sellers to
            connect in connection with potential business acquisitions. The
            Platform does not hold funds and does not act as a broker, agent, or
            financial intermediary. All escrow services are provided by licensed
            third-party escrow providers.
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Full services description to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="eligibility-heading" className="flex flex-col gap-4">
          <h2
            id="eligibility-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            3. Eligibility &amp; KYC/AML Requirements
          </h2>
          <p className="text-16 text-ink">
            You must be of legal age in your jurisdiction to use this Platform.
            Depending on the nature of transactions and applicable regulations,
            users may be required to complete Know Your Customer (KYC) and
            Anti-Money Laundering (AML) verification.
          </p>
          <div className="rounded border border-mist bg-cloud p-4">
            <h3 className="font-serif text-20 font-semibold text-deep-navy mb-2">
              Regulatory Checklist Note
            </h3>
            <ul className="flex flex-col gap-2 text-16 text-ink list-disc pl-4">
              <li>Escrow licensing requirements vary by jurisdiction (DFPI, RBI, FCA, etc.)</li>
              <li>KYC/AML obligations depend on transaction size and jurisdiction</li>
              <li>Financial data handling must comply with applicable data protection laws (GDPR, DPDP Act, CCPA, etc.)</li>
              <li>Securities laws may apply depending on nature of business assets</li>
              <li>Cross-border transactions may trigger additional regulatory requirements</li>
            </ul>
          </div>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Eligibility requirements and KYC/AML framework to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="user-obligations-heading" className="flex flex-col gap-4">
          <h2
            id="user-obligations-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            4. User Obligations
          </h2>
          <p className="text-16 text-ink">
            [PLACEHOLDER — User obligations and prohibited activities to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="liability-heading" className="flex flex-col gap-4">
          <h2
            id="liability-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            5. Limitation of Liability
          </h2>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Liability limitations to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="governing-heading" className="flex flex-col gap-4">
          <h2
            id="governing-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            6. Governing Law &amp; Dispute Resolution
          </h2>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Governing law and dispute resolution mechanism to be drafted by qualified counsel per applicable jurisdiction.]
          </p>
        </section>

        <div className="flex flex-col gap-2 border-t border-mist pt-6">
          <p className="text-16 text-slate">
            Related legal documents:{" "}
            <Link
              href="/legal/privacy"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              Privacy Policy
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
