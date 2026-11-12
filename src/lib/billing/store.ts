import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";

export interface PlanItem {
  id: string;
  name: string;
  targetRole: "SELLER" | "BUYER";
  price: number;
  currency: string;
  interval: "one-time" | "month";
  headline: string;
  description: string;
  features: string[];
}

export const BATON_PLANS: Record<string, PlanItem> = {
  seller_listing: {
    id: "seller_listing",
    name: "Listing Fee",
    targetRole: "SELLER",
    price: 4999,
    currency: "INR",
    interval: "one-time",
    headline: "List your business. One-time fee, live until sold or withdrawn. Flat fee, no success cut.",
    description: "Publish your vetted business listing to qualified buyers without commission.",
    features: [
      "Live until sold or withdrawn",
      "Seller controls full detail unlocks",
      "Direct chat in Baton Connect room",
      "0% success commission on closing",
    ],
  },
  featured_listing: {
    id: "featured_listing",
    name: "Featured Placement",
    targetRole: "SELLER",
    price: 2499,
    currency: "INR",
    interval: "one-time",
    headline: "Featured placement. Top of search and home page vitals strip for 30 days.",
    description: "Maximize visibility across all active buyer searches.",
    features: [
      "Top of search ranking",
      "Pinned to home page vitals strip",
      "Highlighted badge in search",
      "30 days active placement",
    ],
  },
  buyer_alerts: {
    id: "buyer_alerts",
    name: "Early Match Alerts",
    targetRole: "BUYER",
    price: 999,
    currency: "INR",
    interval: "month",
    headline: "Early match alerts. Get new business matches 48 hours before they appear on the public marketplace.",
    description: "Get early access to freshly approved businesses that match your saved thesis.",
    features: [
      "48-hour head start on thesis matches",
      "Instant email notification",
      "Direct Connect room priority",
      "Cancel anytime with one click",
    ],
  },
};

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  planName: string;
  amount: number;
  currency: string;
  status: "PAID" | "PENDING";
  date: string;
  pdfUrl?: string;
}

// In-memory fallback
const inMemoryPaidListings = new Set<string>(["sample-biz-gst-01", "sample-biz-edtech-02"]);
const inMemorySubscriptions = new Map<
  string,
  { id: string; userId: string; planId: string; status: string; currentPeriodEnd: string }
>();

// Default demo subscription for sample buyer
inMemorySubscriptions.set("sub-buyer-sample", {
  id: "sub-buyer-sample",
  userId: "sample-buyer-01",
  planId: "buyer_alerts",
  status: "ACTIVE",
  currentPeriodEnd: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
});

export async function hasEarlyAlertsSubscription(userId: string): Promise<boolean> {
  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const sub = await prisma.subscription.findFirst({
        where: {
          userId,
          planId: "buyer_alerts",
          status: "ACTIVE",
        },
      });
      return Boolean(sub);
    } catch {
      // fallback
    }
  }

  for (const sub of inMemorySubscriptions.values()) {
    if (sub.userId === userId && sub.planId === "buyer_alerts" && sub.status === "ACTIVE") {
      return true;
    }
  }
  return false;
}

export async function isListingPaid(businessId: string): Promise<boolean> {
  return inMemoryPaidListings.has(businessId);
}

export async function markListingPaid(businessId: string): Promise<void> {
  inMemoryPaidListings.add(businessId);
}

export async function getUserBillingState(userId: string) {
  const activeSubs: Array<{
    id: string;
    plan: PlanItem;
    status: string;
    currentPeriodEnd: string;
  }> = [];

  for (const sub of inMemorySubscriptions.values()) {
    if (sub.userId === userId && sub.status === "ACTIVE") {
      const plan = BATON_PLANS[sub.planId];
      if (plan) {
        activeSubs.push({
          id: sub.id,
          plan,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
        });
      }
    }
  }

  const invoices: InvoiceItem[] = [
    {
      id: "inv-2026-001",
      invoiceNumber: "BATON-2026-8812",
      planName: "Early Match Alerts (Monthly)",
      amount: 999,
      currency: "INR",
      status: "PAID",
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    },
  ];

  return {
    activeSubscriptions: activeSubs,
    invoices,
    plans: Object.values(BATON_PLANS),
  };
}

export async function subscribeToPlan(userId: string, planId: string) {
  const plan = BATON_PLANS[planId];
  if (!plan) throw new Error("Invalid plan ID");

  const subId = `sub-${Date.now().toString(36)}`;
  inMemorySubscriptions.set(subId, {
    id: subId,
    userId,
    planId,
    status: "ACTIVE",
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  return { ok: true, subscriptionId: subId };
}

export async function cancelSubscription(subscriptionId: string) {
  const sub = inMemorySubscriptions.get(subscriptionId);
  if (sub) {
    sub.status = "CANCELLED";
    inMemorySubscriptions.set(subscriptionId, sub);
  }
  return { ok: true };
}
