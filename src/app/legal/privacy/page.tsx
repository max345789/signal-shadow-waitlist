import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageContainer } from "@/components/layout/page-container";
import { AlertTriangle, Lock } from "lucide-react";

export const metadata = {
  title: "Baton | Privacy Policy — Data protection and privacy practices",
  description:
    "Privacy Policy for Baton. Outlines handling of user information, read-only analytics/payment connections, and data protection.",
};

export default function PrivacyPolicyPage() {
  return (
    <AppShell activeNav={undefined}>
      <PageContainer className="py-8">
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
              Privacy Policy
            </h1>
            <p className="text-14 text-slate">
              Last updated: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
            </p>
          </div>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              1. Information We Collect
            </h2>
            <p>
              We collect information provided directly by you when creating an account,
              submitting a business listing, requesting full listing details, or
              messaging a counterparty in a Connect room. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Contact details (name, email address, phone number).</li>
              <li>Business metrics and financial narratives submitted by sellers.</li>
              <li>Investment criteria and thesis preferences submitted by buyers.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              2. Read-Only Integrations &amp; Financial Data
            </h2>
            <p>
              When a seller connects Stripe, Razorpay, Google Analytics, or Plausible,
              we request strictly read-only OAuth or restricted API token permissions.
              We never receive or store customer payment methods, full credit card
              numbers, bank account credentials, or transactional passwords.
            </p>
            <p>
              Imported metrics are stored in our protected database to populate
              automatic vitals badges. If a connection fails or expires, the Verified
              mark is dropped immediately and figures revert to seller-reported.
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              3. Redaction and Data Sharing
            </h2>
            <p>
              Public listings display redacted legal names, domains, and customer
              identities. These confidential fields remain hidden until the seller
              explicitly approves a verified buyer&apos;s request for full details.
            </p>
          </section>

          <section className="flex flex-col gap-4 text-ink text-16 leading-relaxed">
            <h2 className="font-serif text-24 font-semibold text-deep-navy">
              4. Data Retention &amp; Rights
            </h2>
            <p>
              You may request export or deletion of your account and listing data at any
              time by contacting support@baton.local. We adhere to applicable data
              protection legislation in each territory of operation.
            </p>
          </section>
        </div>
      </PageContainer>
    </AppShell>
  );
}
