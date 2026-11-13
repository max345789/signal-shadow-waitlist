import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export const metadata = {
  title: "NDA Template — Baton",
  description: "Non-Disclosure Agreement template for Baton deal rooms. Needs qualified legal review.",
};

export default function NdaTemplatePage() {
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
              This NDA template is a skeleton only. It has not been reviewed by
              a qualified attorney. Parties must seek independent legal advice
              before signing or relying on any NDA. This template does not
              constitute legal advice.
            </p>
          </div>
        </div>

        <h1 className="font-serif text-40 font-semibold text-deep-navy">
          Non-Disclosure Agreement Template
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

        <section aria-labelledby="parties-heading" className="flex flex-col gap-4">
          <h2
            id="parties-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            1. Parties
          </h2>
          <p className="text-16 text-ink">
            This Non-Disclosure Agreement (&quot;Agreement&quot;) is entered into as of
            [DATE] between:
          </p>
          <ul className="flex flex-col gap-2 text-16 text-ink list-disc pl-4">
            <li>
              <strong>Disclosing Party</strong>: [SELLER LEGAL NAME], a company
              incorporated in [JURISDICTION] (&quot;Seller&quot;)
            </li>
            <li>
              <strong>Receiving Party</strong>: [BUYER LEGAL NAME], a company
              incorporated in [JURISDICTION] (&quot;Buyer&quot;)
            </li>
          </ul>
        </section>

        <section aria-labelledby="confidential-info-heading" className="flex flex-col gap-4">
          <h2
            id="confidential-info-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            2. Confidential Information
          </h2>
          <p className="text-16 text-ink">
            &quot;Confidential Information&quot; means any and all information disclosed
            by the Disclosing Party to the Receiving Party in connection with
            the potential acquisition of [BUSINESS NAME], including but not
            limited to: financial records, customer lists, technical
            specifications, business strategies, and trade secrets.
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Full definition of Confidential Information, exclusions, and carve-outs to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="obligations-heading" className="flex flex-col gap-4">
          <h2
            id="obligations-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            3. Obligations of Receiving Party
          </h2>
          <p className="text-16 text-ink">
            The Receiving Party agrees to: (a) hold the Confidential Information
            in strict confidence; (b) use it solely to evaluate a potential
            acquisition; (c) limit disclosure to its advisors on a need-to-know
            basis; (d) promptly return or destroy all Confidential Information
            upon request or termination of discussions.
          </p>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Full obligations, exceptions, and standard of care to be drafted by qualified counsel.]
          </p>
        </section>

        <section aria-labelledby="term-heading" className="flex flex-col gap-4">
          <h2
            id="term-heading"
            className="font-serif text-28 font-semibold text-deep-navy"
          >
            4. Term &amp; Jurisdiction
          </h2>
          <div className="rounded border border-mist bg-cloud p-4">
            <h3 className="font-serif text-20 font-semibold text-deep-navy mb-2">
              Regulatory Checklist Note
            </h3>
            <ul className="flex flex-col gap-2 text-16 text-ink list-disc pl-4">
              <li>NDA enforceability varies significantly by jurisdiction</li>
              <li>Non-compete and non-solicitation clauses may be restricted or void in some jurisdictions (e.g. California)</li>
              <li>Financial data: additional obligations may apply under data protection laws</li>
              <li>Cross-border deals: choice-of-law clause must be reviewed for enforceability</li>
              <li>Digital signatures: verify e-signature validity under applicable law (IT Act 2000, eIDAS, ESIGN Act)</li>
            </ul>
          </div>
          <p className="text-16 text-ink">
            [PLACEHOLDER — Term, governing law, and jurisdiction to be drafted by qualified counsel.]
          </p>
        </section>

        <div className="flex flex-col gap-2 border-t border-mist pt-6">
          <p className="text-16 text-slate">
            In-platform NDA signing is available in your{" "}
            <Link
              href="/deals"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              Deal Room
            </Link>
            . Related documents:{" "}
            <Link
              href="/legal/purchase-agreement-template"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              Purchase Agreement Template
            </Link>
            {" · "}
            <Link
              href="/legal/terms"
              className="text-trust-blue underline hover:text-deep-navy"
            >
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
