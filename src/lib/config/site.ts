/**
 * Baton Site Configuration (C11, C2, C7)
 * Single source of truth for platform identity, pricing, and disclaimers.
 */

export const SITE_CONFIG = {
  name: "Baton",
  tagline: "Buy and sell small businesses, with the checks shown",
  metaDescription:
    "Baton is a listing platform for buying and selling businesses. See what has been verified and what hasn't, then talk to the other side directly.",
  domain: "dabcloud.in",
  canonicalUrl: "https://dabcloud.in",
  fallbackUrl: "https://signal-shadow-waitlist.vercel.app",

  platformRole:
    "This product is a listing and introduction platform. It does not verify listings beyond the named badges, take part in deals, hold funds, provide contracts, or give legal, tax, or financial advice. Buyers and sellers do their own due diligence.",

  footerDisclaimer:
    "Baton is a listing and introduction platform. We do not verify listings, take part in deals, or provide legal, tax, or financial advice.",

  listingBannerDisclaimer:
    "Information is provided by the seller and has not been verified by us unless a badge says otherwise. Do your own due diligence.",

  closingGuideTitle: "How closing works",
  closingGuideIntro:
    "This platform does not hold money or write contracts. Buyer and seller choose their own lawyer, contract, and payment method.",

  supportEmail: "support@dabcloud.in",

  // Flat-fee Pricing Defaults (C7) - in INR
  pricing: {
    currency: "INR",
    currencySymbol: "₹",
    sellerListing: {
      name: "Seller listing",
      targetAudience: "Sellers",
      description: "Publish one listing, buyer matching, Connect rooms",
      price: 4999,
      interval: "one-time",
    },
    featuredListing: {
      name: "Featured listing",
      targetAudience: "Sellers",
      description: "Higher placement in matches and search",
      price: 2499,
      interval: "one-time",
    },
    buyerAlerts: {
      name: "Buyer alerts",
      targetAudience: "Buyers",
      description: "Early alerts 48 hours before general matches",
      price: 999,
      interval: "per month",
      earlyAccessHours: 48,
    },
  },
} as const;
