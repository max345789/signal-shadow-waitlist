import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Baton | How closing works — Platform guide for buyers and sellers",
  description:
    "How closing works outside the platform. Buyer and seller choose their own lawyer, contract, and payment method.",
};

const CLOSING_STEPS = [
  {
    step: 1,
    title: "Agree confidentiality terms",
    description:
      "Agree confidentiality terms with the other party before sharing sensitive documents, customer lists, or proprietary source code.",
  },
  {
    step: 2,
    title: "Obtain independent legal and financial advice",
    description:
      "Each side should retain an independent lawyer, tax advisor, and financial accountant to review the structure and transaction implications.",
  },
  {
    step: 3,
    title: "Independent due diligence",
    description:
      "Check the financial statements, tax filings, software licences, intellectual property title, existing debts, and vendor contracts yourself.",
  },
  {
    step: 4,
    title: "Choose how payment will be held and released",
    description:
      "Select a trusted third-party escrow service, attorney trust account, or payment settlement method chosen and agreed directly between both parties.",
  },
  {
    step: 5,
    title: "Written sale agreement",
    description:
      "Put the final sale terms, representations, warranties, and handover obligations into a comprehensive written agreement reviewed by your qualified lawyer.",
  },
  {
    step: 6,
    title: "Asset transfer and verification",
    description:
      "Transfer assets using the mutual transfer checklist (domain, code repository, cloud hosting, payment accounts, social handles, customer data, and vendor contracts) and confirm each milestone together.",
  },
];

export default function ClosingGuidePage() {
  return (
    <AppShell
      trustBanner={{
        canTrustAnswer:
          "This guide provides structured information on concluding private transactions safely outside our platform.",
        nextStepAnswer:
          "Engage an independent lawyer and agree direct settlement terms with the counterparty.",
      }}
    >
      <div className="py-8">
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
          {/* Back link */}
          <Link
            href="/deals"
            className="inline-flex items-center gap-2 text-14 font-medium text-trust-blue hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Connect rooms</span>
          </Link>

          {/* Header */}
          <div className="flex flex-col gap-3">
            <h1 className="font-serif text-32 font-bold text-deep-navy sm:text-40">
              How closing works
            </h1>
            <p className="text-18 text-slate leading-relaxed">
              This platform does not hold money or write contracts. Buyer and
              seller choose their own lawyer, contract, and payment method.
            </p>
          </div>

          {/* Advisory Alert Card */}
          <div className="rounded border border-mist bg-cloud p-5 flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-trust-blue shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-14 text-ink">
              <strong className="font-semibold text-deep-navy">
                Platform-only marketplace
              </strong>
              <span>
                Baton is an introduction and listing platform. We are never party
                to transactions, do not hold deposits or escrow funds, and do not
                provide legal, accounting, or tax advice.
              </span>
            </div>
          </div>

          {/* 6 Steps Checklist */}
          <div className="flex flex-col gap-4">
            <h2 className="text-20 font-semibold text-deep-navy">
              Recommended Closing Checklist
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {CLOSING_STEPS.map((item) => (
                <Card key={item.step} className="bg-white border-mist">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pale-blue text-14 font-bold text-trust-blue">
                        {item.step}
                      </span>
                      <CardTitle as="h3" className="text-18 font-semibold text-deep-navy">
                        {item.title}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-16 text-slate leading-relaxed pl-10">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Footer Line */}
          <div className="border-t border-mist pt-6 text-center text-14 text-slate">
            We provide this guide for information only. It is not legal advice.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
