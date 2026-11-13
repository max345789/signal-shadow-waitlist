import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Baton | Report & Takedown — Integrity and takedown policy",
  description:
    "Report and Takedown Policy for Baton. Procedures for reporting fraudulent figures, copyright claims, and platform rule breaches.",
};

export default function TakedownPolicyPage() {
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
              Report &amp; Takedown Policy
            </h1>
            <p className="text-14 text-slate">
              Last updated: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
            </p>
          </div>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              1. Reporting a Listing
            </h2>
            <p>
              Any registered user or affected third party can submit a formal report
              directly from any listing detail page using the &quot;Report this listing&quot; button,
              or by emailing takedown@baton.local.
            </p>
            <p>Valid grounds for reporting include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fake metrics, altered statements, or misattributed revenue figures.</li>
              <li>Unauthorized sale of intellectual property, trademarks, or copyrighted assets.</li>
              <li>Impersonation of corporate founders or unauthorized brokering without authority.</li>
              <li>Fraudulent, abusive, or scam activity within Connect rooms.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              2. Review Procedure &amp; Timelines
            </h2>
            <p>
              Upon receiving a report, our operations team logs a formal case in the Admin
              Review queue. Reports progress through four defined stages:
            </p>
            <ol className="list-decimal pl-6 space-y-2">
              <li><strong>New:</strong> Initial intake and evidence logging.</li>
              <li><strong>In Review:</strong> Staff contact the seller and request corroborating evidence.</li>
              <li><strong>Action Taken:</strong> If verified, the listing is hidden, removed, or the seller account suspended.</li>
              <li><strong>No Action:</strong> If the claim is unsubstantiated, the report is closed with recorded administrative notes.</li>
            </ol>
            <p>
              We aim to complete initial triage within 24 hours of report submission.
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              3. Counter-Notice &amp; Seller Appeals
            </h2>
            <p>
              Sellers whose listings have been flagged or suspended may submit counter-evidence
              or audited financial statements to appeal the decision. Appeals are evaluated
              independently by senior staff.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
