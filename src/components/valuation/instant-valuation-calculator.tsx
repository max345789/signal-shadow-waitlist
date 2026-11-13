"use client";

import React, { useState, useId } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, CheckCircle2, Sparkles, TrendingUp } from "lucide-react";
import { formatCurrency, type CurrencyCode } from "@/lib/format/currency";
import { BUSINESS_SECTORS, calculateGuidedValuation } from "@/lib/domain/valuation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function InstantValuationCalculator({
  defaultCurrency = "INR",
}: {
  defaultCurrency?: CurrencyCode;
}) {
  const [sector, setSector] = useState<string>("B2B SaaS");
  const [annualRevenue, setAnnualRevenue] = useState<string>("5000000"); // 50L
  const [annualProfit, setAnnualProfit] = useState<string>("2000000"); // 20L
  const [growthPercent, setGrowthPercent] = useState<string>("25");

  const revId = useId();
  const profitId = useId();
  const growthId = useId();
  const sectorId = useId();

  const revNum = Math.max(0, Number(annualRevenue) || 0);
  const profitNum = Math.max(0, Number(annualProfit) || 0);
  const growthNum = Number(growthPercent) || 0;

  const valuation = calculateGuidedValuation({
    sector,
    annualRevenue: revNum,
    annualProfit: profitNum,
    ownerHoursPerWeek: 15,
    growthPercent: growthNum,
    currency: defaultCurrency,
  });

  const listUrl = `/sell?prefill=1&sector=${encodeURIComponent(sector)}&revenue=${revNum}&profit=${profitNum}&growth=${growthNum}`;

  return (
    <Card className="border border-mist bg-white overflow-hidden">
      <CardHeader className="border-b border-mist bg-cloud/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-trust-blue text-white">
              <Calculator className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle as="h2" className="text-18 sm:text-20 font-semibold text-deep-navy">
                Instant Business Valuation Calculator
              </CardTitle>
              <CardDescription className="text-13 text-slate">
                Data-backed multiple benchmarking for Indian tech, SaaS &amp; D2C companies.
              </CardDescription>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-forest-green/20 bg-forest-green/10 px-3 py-1 text-12 font-medium text-forest-green">
            <Sparkles className="h-3.5 w-3.5" />
            Free • 0% Broker Commission
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Inputs Section */}
          <div className="space-y-4 lg:col-span-7">
            <div>
              <label htmlFor={sectorId} className="block text-13 font-medium text-slate mb-1">
                Business Sector
              </label>
              <select
                id={sectorId}
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full rounded-md border border-mist bg-white px-3 py-2 text-14 text-deep-navy focus:border-trust-blue focus:outline-none"
              >
                {BUSINESS_SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={revId} className="text-13 font-medium text-slate">
                    Annual Revenue (ARR)
                  </label>
                  <span className="text-12 font-semibold text-deep-navy tabular-figures">
                    {formatCurrency(revNum, { currency: defaultCurrency, compact: true })}
                  </span>
                </div>
                <input
                  id={revId}
                  type="number"
                  min="0"
                  step="100000"
                  value={annualRevenue}
                  onChange={(e) => setAnnualRevenue(e.target.value)}
                  className="w-full rounded-md border border-mist bg-white px-3 py-2 text-14 text-deep-navy focus:border-trust-blue focus:outline-none tabular-figures"
                  placeholder="e.g. 5000000"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={profitId} className="text-13 font-medium text-slate">
                    Annual Net Profit / EBITDA
                  </label>
                  <span className="text-12 font-semibold text-deep-navy tabular-figures">
                    {formatCurrency(profitNum, { currency: defaultCurrency, compact: true })}
                  </span>
                </div>
                <input
                  id={profitId}
                  type="number"
                  min="0"
                  step="50000"
                  value={annualProfit}
                  onChange={(e) => setAnnualProfit(e.target.value)}
                  className="w-full rounded-md border border-mist bg-white px-3 py-2 text-14 text-deep-navy focus:border-trust-blue focus:outline-none tabular-figures"
                  placeholder="e.g. 2000000"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor={growthId} className="text-13 font-medium text-slate">
                  YoY Revenue Growth Rate
                </label>
                <span className="text-12 font-semibold text-deep-navy tabular-figures">
                  {growthNum}% YoY
                </span>
              </div>
              <input
                id={growthId}
                type="range"
                min="-30"
                max="150"
                step="5"
                value={growthPercent}
                onChange={(e) => setGrowthPercent(e.target.value)}
                className="w-full accent-trust-blue"
              />
              <div className="flex justify-between text-11 text-slate mt-0.5">
                <span>-30%</span>
                <span>0% (Flat)</span>
                <span>+50% (Fast)</span>
                <span>+150%</span>
              </div>
            </div>
          </div>

          {/* Real-time Valuation Output Box */}
          <div className="flex flex-col justify-between rounded-lg border border-mist bg-cloud p-5 lg:col-span-5">
            <div className="space-y-3">
              <span className="text-12 font-semibold tracking-wider text-slate uppercase">
                Estimated Enterprise Value
              </span>

              {valuation.mode !== "INSUFFICIENT_DATA" ? (
                <>
                  <div>
                    <div className="text-28 sm:text-34 font-serif font-bold text-deep-navy tabular-figures leading-tight">
                      {formatCurrency(valuation.suggestedAskingPrice, {
                        currency: defaultCurrency,
                        compact: true,
                      })}
                    </div>
                    <div className="text-13 text-slate mt-1">
                      Estimated range:{" "}
                      <span className="font-semibold text-deep-navy tabular-figures">
                        {formatCurrency(valuation.low, { currency: defaultCurrency, compact: true })}
                      </span>{" "}
                      –{" "}
                      <span className="font-semibold text-deep-navy tabular-figures">
                        {formatCurrency(valuation.high, { currency: defaultCurrency, compact: true })}
                      </span>
                    </div>
                  </div>

                  <div className="rounded border border-mist bg-white p-3 text-12 text-slate leading-relaxed">
                    <div className="flex items-center gap-1.5 font-medium text-deep-navy mb-1">
                      <TrendingUp className="h-3.5 w-3.5 text-trust-blue" />
                      Multiple: {valuation.lowMultiple}x – {valuation.highMultiple}x
                    </div>
                    {valuation.basis}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center text-13 text-slate">
                  Enter revenue or profit above to compute valuation.
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-mist/80 space-y-2">
              <Button asChild variant="action" className="w-full justify-center">
                <Link href={listUrl}>
                  <span>List this business for ₹4,999</span>
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Link>
              </Button>
              <p className="text-center text-11 text-slate flex items-center justify-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-forest-green" />
                <span>Zero success cut. Live until sold or withdrawn.</span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
