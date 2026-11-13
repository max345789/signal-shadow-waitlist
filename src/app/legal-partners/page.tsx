import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building,
  CheckCircle2,
  Mail,
  MapPin,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { LEGAL_AND_CA_PARTNERS } from "@/lib/legal-partners/data";

export const metadata = {
  title: "Baton | Verified Legal & CA Partner Directory — Independent M&A Support",
  description:
    "Connect with vetted Indian M&A lawyers, corporate chartered accountants, and tax advisors for business acquisitions, slump sales, and due diligence.",
};

export default function LegalPartnersPage() {
  return (
    <AppShell activeNav={undefined}>
      <div className="flex flex-col gap-8 py-4">
        {/* Header Breadcrumb & Title */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="link" className="p-0 text-slate h-auto">
              <Link href="/closing-guide" className="inline-flex items-center gap-1.5 text-14">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Closing Guide</span>
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-[760px] space-y-2">
              <div className="flex items-center gap-2">
                <StatusChip tone="verified" label="Vetted Independent Directory" />
                <StatusChip tone="neutral" label="Non-Commission Network" />
              </div>
              <h1 className="font-serif text-32 sm:text-40 font-bold text-deep-navy">
                Verified Indian M&amp;A Lawyers &amp; CAs Directory
              </h1>
              <p className="text-16 text-slate leading-relaxed">
                Baton is a flat-fee technology platform and does not act as your legal or tax advisor.
                To ensure complete protection during contract signing, asset transfer, and payment release,
                we provide this directory of independent Indian M&amp;A professionals with proven experience in tech acquisitions.
              </p>
            </div>

            <Button asChild variant="action">
              <Link href="/closing-guide">
                <span>View Closing Guide</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Directory Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {LEGAL_AND_CA_PARTNERS.map((partner) => (
            <Card key={partner.id} className="flex flex-col justify-between border border-mist bg-white">
              <div>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-13 font-semibold uppercase tracking-wider text-trust-blue">
                      <Scale className="h-4 w-4" />
                      {partner.category}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-forest-green/10 px-2 py-0.5 text-12 font-medium text-forest-green border border-forest-green/20">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Verified Practitioner
                    </span>
                  </div>

                  <CardTitle as="h2" className="text-20 text-deep-navy">
                    {partner.name}
                  </CardTitle>
                  <CardDescription className="text-14 font-medium text-slate">
                    {partner.firm} • {partner.experienceYears}+ years M&amp;A practice
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-14 text-ink leading-relaxed">
                    {partner.description}
                  </p>

                  <div className="space-y-2">
                    <span className="text-12 font-semibold uppercase tracking-wider text-slate">
                      Core Specializations
                    </span>
                    <ul className="grid grid-cols-1 gap-1.5 text-13 text-slate">
                      {partner.specialization.map((spec) => (
                        <li key={spec} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-trust-blue shrink-0 mt-0.5" />
                          <span>{spec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded border border-mist bg-cloud p-3 space-y-1.5 text-13">
                    <div className="flex items-center gap-2 text-slate">
                      <MapPin className="h-4 w-4 text-slate shrink-0" />
                      <span>{partner.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-deep-navy font-medium">
                      <Building className="h-4 w-4 text-trust-blue shrink-0" />
                      <span>Fee structure: {partner.feeStructure}</span>
                    </div>
                  </div>
                </CardContent>
              </div>

              <div className="border-t border-mist p-4 bg-cloud/50 flex flex-wrap items-center justify-between gap-3">
                <span className="text-12 text-slate">
                  Direct engagement • Zero platform referral fee
                </span>
                <Button asChild variant="primary">
                  <a href={`mailto:${partner.contactEmail}?subject=M%26A%20Advisory%20Inquiry%20via%20Baton`}>
                    <Mail className="h-4 w-4 mr-1.5" />
                    <span>Contact Partner</span>
                  </a>
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Directory Disclaimer */}
        <div className="rounded-lg border border-mist bg-cloud p-5 text-13 text-slate leading-relaxed">
          <strong className="text-deep-navy">Independent Network Disclaimer:</strong> Practitioners listed in this directory operate independently of Baton. Baton does not receive referral commissions, revenue shares, or kickbacks from legal or tax services engaged through this directory. Always verify bar council enrollment and ICAI standing prior to executing formal retainer contracts.
        </div>
      </div>
    </AppShell>
  );
}
