import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ShieldCheck, Zap, Bell, ArrowRight } from "lucide-react";
import { BATON_PLANS } from "@/lib/billing/store";

export const metadata = {
  title: "Baton | Pricing — Flat fees. We never take a share of your sale price.",
  description:
    "Simple flat fees for listing, featured placement, and early buyer alerts. 0% commission on closing.",
};

export default function PricingPage() {
  const sellerPlan = BATON_PLANS.seller_listing!;
  const featuredPlan = BATON_PLANS.featured_listing!;
  const buyerPlan = BATON_PLANS.buyer_alerts!;

  return (
    <AppShell
      activeNav="pricing"
      trustBanner={{
        canTrustAnswer:
          "We never take success commissions, broker fees, or hold your money.",
        nextStepAnswer:
          "Choose a transparent flat fee plan or browse verified marketplace listings freely.",
      }}
    >
      <div className="py-12">
        <div className="flex flex-col gap-12 max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center flex flex-col items-center gap-4">
            <span className="text-14 font-bold uppercase tracking-wider text-trust-blue bg-pale-blue px-3 py-1 rounded-full">
              Transparent Pricing
            </span>
            <h1 className="font-serif text-36 font-bold text-deep-navy sm:text-48 max-w-3xl leading-tight">
              Flat fees. We never take a share of your sale price.
            </h1>
            <p className="text-18 text-slate max-w-2xl leading-relaxed">
              Unlike traditional business brokers charging 5% to 15% on completion,
              Baton operates on clear, upfront flat fees with zero commission.
            </p>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* 1. Seller Listing Fee */}
            <Card className="bg-white border-mist flex flex-col justify-between relative hover:border-trust-blue transition-colors">
              <div>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 text-trust-blue mb-2">
                    <ShieldCheck className="h-5 w-5" />
                    <span className="text-14 font-semibold uppercase">For Sellers</span>
                  </div>
                  <CardTitle as="h2" className="text-24 font-bold text-deep-navy">
                    {sellerPlan.name}
                  </CardTitle>
                  <p className="text-14 text-slate mt-2 min-h-[40px]">
                    {sellerPlan.headline}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-40 font-bold text-deep-navy tabular-figures">
                      ₹4,999
                    </span>
                    <span className="text-14 text-slate">/ one-time</span>
                  </div>
                  <ul className="flex flex-col gap-3 text-14 text-ink">
                    {sellerPlan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-verified-green shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </div>
              <CardFooter className="pt-6 border-t border-mist">
                <Link href="/sell" className="w-full">
                  <Button variant="primary" className="w-full min-h-[44px]">
                    <span>List your business</span>
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* 2. Featured Listing (Highlighted) */}
            <Card className="bg-white border-2 border-trust-blue flex flex-col justify-between relative">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-trust-blue text-white px-3 py-0.5 rounded-full text-12 font-bold tracking-wide">
                POPULAR ADD-ON
              </div>
              <div>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 text-trust-blue mb-2">
                    <Zap className="h-5 w-5" />
                    <span className="text-14 font-semibold uppercase">Seller Boost</span>
                  </div>
                  <CardTitle as="h2" className="text-24 font-bold text-deep-navy">
                    {featuredPlan.name}
                  </CardTitle>
                  <p className="text-14 text-slate mt-2 min-h-[40px]">
                    {featuredPlan.headline}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-40 font-bold text-deep-navy tabular-figures">
                      ₹2,499
                    </span>
                    <span className="text-14 text-slate">/ 30 days</span>
                  </div>
                  <ul className="flex flex-col gap-3 text-14 text-ink">
                    {featuredPlan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-verified-green shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </div>
              <CardFooter className="pt-6 border-t border-mist">
                <Link href="/dashboard" className="w-full">
                  <Button variant="secondary" className="w-full min-h-[44px]">
                    <span>Feature an existing listing</span>
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* 3. Buyer Early Alerts */}
            <Card className="bg-white border-mist flex flex-col justify-between relative hover:border-trust-blue transition-colors">
              <div>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 text-trust-blue mb-2">
                    <Bell className="h-5 w-5" />
                    <span className="text-14 font-semibold uppercase">For Buyers</span>
                  </div>
                  <CardTitle as="h2" className="text-24 font-bold text-deep-navy">
                    {buyerPlan.name}
                  </CardTitle>
                  <p className="text-14 text-slate mt-2 min-h-[40px]">
                    {buyerPlan.headline}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-40 font-bold text-deep-navy tabular-figures">
                      ₹999
                    </span>
                    <span className="text-14 text-slate">/ month</span>
                  </div>
                  <ul className="flex flex-col gap-3 text-14 text-ink">
                    {buyerPlan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-verified-green shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </div>
              <CardFooter className="pt-6 border-t border-mist">
                <Link href="/billing" className="w-full">
                  <Button variant="secondary" className="w-full min-h-[44px]">
                    <span>Subscribe to Alerts</span>
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </div>

          {/* Value Guarantee */}
          <div className="rounded border border-mist bg-cloud p-6 text-center flex flex-col items-center gap-2">
            <h3 className="text-18 font-bold text-deep-navy">
              Why flat fees instead of commission?
            </h3>
            <p className="text-14 text-slate max-w-2xl">
              Traditional brokers take ₹5,00,000 to ₹15,00,000 on a ₹1 Crore sale.
              Baton simply introduces buyer and seller, verifies accounts via automated badges,
              and lets you close privately with your own lawyers. You keep 100% of your proceeds.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
