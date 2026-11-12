import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth/session-server";
import { getUserBillingState } from "@/lib/billing/store";
import { Receipt, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Baton | Account Billing — Manage subscriptions and invoices",
  description:
    "Review your active Baton subscriptions, billing renewal dates, and downloaded invoice history.",
};

export default async function BillingPage() {
  const session = await getServerSession();
  const userId = session?.userId;
  const billingState = userId
    ? await getUserBillingState(userId)
    : { activeSubscriptions: [], invoices: [], plans: [] };

  return (
    <AppShell
      activeNav="billing"
      trustBanner={{
        canTrustAnswer:
          "All subscriptions are cancellable at any time. We never store raw credit card data.",
        nextStepAnswer:
          "Manage your active early match alerts or review past listing payments.",
      }}
    >
      <PageContainer className="py-8">
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-32 font-bold text-deep-navy sm:text-40">
              Account Billing
            </h1>
            <p className="text-16 text-slate">
              Review your active plan subscriptions, renewal dates, and invoice history.
            </p>
          </div>

          {/* Active Subscriptions */}
          <Card className="bg-white border-mist">
            <CardHeader>
              <CardTitle as="h2" className="text-20 font-semibold text-deep-navy">
                Active Subscriptions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {billingState.activeSubscriptions.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {billingState.activeSubscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded border border-mist bg-cloud"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-deep-navy text-16">
                            {sub.plan.name}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-white border border-verified-green px-2 py-0.5 text-12 font-medium text-verified-green">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Active
                          </span>
                        </div>
                        <span className="text-14 text-slate">
                          ₹{sub.plan.price.toLocaleString("en-IN")} / {sub.plan.interval} • Renews on{" "}
                          {new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="text-brick-red hover:bg-white text-14 min-h-[44px]"
                        >
                          Cancel subscription
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate flex flex-col items-center gap-3">
                  <p className="text-14">You have no active monthly subscriptions.</p>
                  <Link href="/pricing">
                    <Button variant="secondary" className="min-h-[44px]">
                      <span>View available plans</span>
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice History */}
          <Card className="bg-white border-mist">
            <CardHeader>
              <CardTitle as="h2" className="text-20 font-semibold text-deep-navy">
                Invoice History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {billingState.invoices.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-14 border-collapse">
                    <thead>
                      <tr className="border-b border-mist text-slate font-medium">
                        <th className="pb-3 pr-4">Invoice</th>
                        <th className="pb-3 pr-4">Plan</th>
                        <th className="pb-3 pr-4">Date</th>
                        <th className="pb-3 pr-4">Amount</th>
                        <th className="pb-3 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingState.invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-mist last:border-b-0">
                          <td className="py-3 pr-4 font-mono text-deep-navy font-medium">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 pr-4 text-ink">{inv.planName}</td>
                          <td className="py-3 pr-4 text-slate">{inv.date}</td>
                          <td className="py-3 pr-4 font-semibold text-deep-navy tabular-figures">
                            ₹{inv.amount.toLocaleString("en-IN")}
                          </td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center gap-1 text-verified-green font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-slate">
                  <p className="text-14">No past invoices found.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}
