import { z } from "zod";

export const submitIdentityVerificationSchema = z.object({
  provider: z.enum(["Persona", "Digio KYC"]),
  legalName: z
    .string()
    .trim()
    .min(2, "Enter your legal full name (at least 2 characters).")
    .max(120),
  country: z.string().trim().min(2, "Select your country of residence.").max(40),
  documentType: z.enum(["PAN", "PASSPORT", "NATIONAL_ID", "DRIVERS_LICENSE"]),
  referenceLast4: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]{4}$/, "Enter only the last 4 alphanumeric characters of your ID."),
  roleContext: z.enum(["BUYER", "SELLER"]),
});

export const submitProofOfFundsSchema = z.object({
  provider: z.enum(["Setu AA", "Plaid Assets"]),
  amount: z.coerce
    .number({ invalid_type_error: "Enter a valid liquid funds amount." })
    .positive("Verified liquid amount must be greater than zero.")
    .max(1_000_000_000_000),
  currency: z.enum(["INR", "USD", "EUR", "GBP"]),
  institutionLabel: z
    .string()
    .trim()
    .min(3, "Enter the financial institution or bank account label.")
    .max(120),
  attestationRef: z
    .string()
    .trim()
    .min(4, "Enter the read-only attestation or consent reference.")
    .max(80),
});

export const connectAccountSchema = z
  .object({
    businessId: z.string().trim().min(1, "Select a listing to connect."),
    connectorKind: z.enum(["PAYMENT", "ANALYTICS"]),
    provider: z.enum(["Stripe", "Razorpay", "GA4", "Plausible"]),
    accountIdentifier: z
      .string()
      .trim()
      .min(3, "Enter the read-only account or property ID.")
      .max(120),
    readOnlyToken: z
      .string()
      .trim()
      .min(4, "Enter a read-only API token or OAuth grant.")
      .max(200),
    syncIntervalMinutes: z.coerce
      .number()
      .int()
      .refine((v) => v === 15 || v === 60 || v === 360, {
        message: "Sync interval must be 15, 60, or 360 minutes.",
      })
      .default(60),
    expiresInHours: z.coerce
      .number()
      .positive()
      .max(2160)
      .optional(),
  })
  .superRefine((val, ctx) => {
    const isPaymentProvider = val.provider === "Stripe" || val.provider === "Razorpay";
    if (val.connectorKind === "PAYMENT" && !isPaymentProvider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provider"],
        message: "Payment connectors must use Stripe or Razorpay.",
      });
    }
    if (val.connectorKind === "ANALYTICS" && isPaymentProvider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provider"],
        message: "Analytics connectors must use GA4 or Plausible.",
      });
    }
  });

export const syncConnectorSchema = z.object({
  readOnlyToken: z.string().trim().min(4).max(200).optional(),
  force: z.boolean().optional(),
});

export const adminReviewVerificationSchema = z.object({
  decision: z.enum(["APPROVE", "FAIL", "EXPIRE", "REVOKE"]),
  reviewerNote: z
    .string()
    .trim()
    .min(5, "Enter a reviewer note of at least 5 characters.")
    .max(500),
});
