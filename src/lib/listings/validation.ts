import { z } from "zod";
import { sanitizeFounderMediaUrl } from "@/lib/domain/listings";

export const currencySchema = z.enum(["INR", "USD", "EUR", "GBP"]);

export const financialSeriesPointSchema = z.object({
  period: z.string().trim().min(1).max(32),
  revenue: z.number().finite().min(0),
  profit: z.number().finite(),
  source: z.enum(["VERIFIED", "SELLER_REPORTED"]).default("SELLER_REPORTED"),
});

export const upsertListingSchema = z.object({
  teaserTitle: z
    .string()
    .trim()
    .min(10, "Teaser title must be at least 10 characters.")
    .max(140, "Teaser title cannot exceed 140 characters."),
  teaserSummary: z
    .string()
    .trim()
    .min(20, "Teaser summary must be at least 20 characters.")
    .max(500, "Teaser summary cannot exceed 500 characters."),
  redactedName: z
    .string()
    .trim()
    .min(2, "Confidential business name is required.")
    .max(140, "Business name cannot exceed 140 characters."),
  redactedDomain: z
    .string()
    .trim()
    .min(3, "Confidential domain is required (e.g., example.in).")
    .max(140, "Domain cannot exceed 140 characters."),
  redactedCustomers: z
    .string()
    .trim()
    .max(500, "Customer summary cannot exceed 500 characters.")
    .optional()
    .nullable(),
  sector: z.string().trim().min(2, "Select a business sector.").max(80),
  geography: z.string().trim().min(2, "Select or enter geography.").max(80),
  askingPrice: z
    .number()
    .finite("Asking price must be a valid number.")
    .positive("Asking price must be greater than zero."),
  currency: currencySchema.default("INR"),
  ownerHoursPerWeek: z
    .number()
    .finite()
    .int("Owner hours per week must be a whole number.")
    .min(0, "Owner hours cannot be negative.")
    .max(168, "Owner hours cannot exceed 168 hours per week."),
  reasonForSelling: z
    .string()
    .trim()
    .min(15, "Explain the reason for selling (at least 15 characters).")
    .max(1500),
  founderStory: z
    .string()
    .trim()
    .min(15, "Provide a founder story or operations note (at least 15 characters).")
    .max(3000),
  founderMediaUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val || val.trim().length === 0) return true;
        return sanitizeFounderMediaUrl(val) !== null;
      },
      { message: "Founder media URL must start with https:// (or leave blank)." }
    ),
  founderMediaType: z.enum(["audio", "video"]).optional().nullable(),
  financialNarrative: z
    .string()
    .trim()
    .min(20, "Provide a financial narrative (at least 20 characters).")
    .max(3000),
  financialSeries: z.array(financialSeriesPointSchema).max(12).optional(),
  risksSummary: z
    .string()
    .trim()
    .min(15, "Disclose key risks honestly (at least 15 characters).")
    .max(2000),
  techStack: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  assetsIncluded: z
    .array(z.string().trim().min(1).max(140))
    .min(1, "Select at least one asset included in the sale.")
    .max(20),
  annualRevenue: z.number().finite().min(0, "Annual revenue cannot be negative."),
  annualProfit: z.number().finite("Annual profit must be a valid number."),
  growthPercent: z.number().finite().min(-100).max(5000),
  churnPercent: z.number().finite().min(0).max(100),
  monthlyTraffic: z.number().finite().int().min(0),
  customerCount: z.number().finite().int().min(0),
  submitForReview: z.boolean().default(false),
});

export const adminReviewSchema = z.object({
  decision: z.enum(["APPROVE", "FLAG", "REJECT"]),
  reviewerNote: z
    .string()
    .trim()
    .min(5, "Reviewer note must be at least 5 characters.")
    .max(1000, "Reviewer note cannot exceed 1000 characters."),
});

export const createQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(10, "Question must be at least 10 characters.")
    .max(800, "Question cannot exceed 800 characters."),
});

export const answerQuestionSchema = z.object({
  answer: z
    .string()
    .trim()
    .min(5, "Answer must be at least 5 characters.")
    .max(1500, "Answer cannot exceed 1500 characters."),
});
