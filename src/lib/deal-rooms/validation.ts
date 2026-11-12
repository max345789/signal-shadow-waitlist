import { z } from "zod";
import { DEAL_STAGES_ORDER } from "@/lib/domain/deal-stages";

export const createDealRoomSchema = z.object({
  businessId: z.string().min(1, "Business ID is required."),
});

export const transitionStageSchema = z.object({
  toStage: z.enum(DEAL_STAGES_ORDER),
});

export const signAgreementSchema = z.object({
  signerName: z
    .string()
    .trim()
    .min(2, "Enter your full legal signature name (at least 2 characters).")
    .max(120, "Signer name cannot exceed 120 characters."),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({
      message: "You must review and confirm acceptance before signing.",
    }),
  }),
});

export const postMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(2, "Message cannot be empty (minimum 2 characters).")
    .max(2000, "Message cannot exceed 2000 characters."),
  parentId: z.string().min(1).nullable().optional(),
});

export const DOCUMENT_CATEGORIES = [
  "FINANCIAL",
  "LEGAL",
  "TECHNICAL",
  "CUSTOMER",
  "OTHER",
] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

export const uploadDocumentJsonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Document title must be at least 3 characters.")
    .max(120, "Document title cannot exceed 120 characters."),
  category: z.enum(DOCUMENT_CATEGORIES),
  filename: z
    .string()
    .trim()
    .min(3, "Filename is required.")
    .max(100, "Filename is too long."),
  mimeType: z.string().trim().min(3),
  contentBase64: z.string().min(4, "Document content is required."),
});

export const offerActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("PROPOSE"),
    amount: z.coerce
      .number()
      .finite()
      .positive("Offer amount must be greater than zero.")
      .max(10_000_000_000, "Offer amount exceeds maximum supported range."),
    currency: z.enum(["INR", "USD", "EUR", "GBP"]).default("INR"),
    termsSummary: z
      .string()
      .trim()
      .min(10, "Enter clear offer terms (at least 10 characters).")
      .max(1500, "Offer terms cannot exceed 1500 characters."),
  }),
  z.object({
    action: z.literal("COUNTER"),
    offerId: z.string().min(1, "Target offer ID is required."),
    amount: z.coerce
      .number()
      .finite()
      .positive("Counter-offer amount must be greater than zero.")
      .max(10_000_000_000, "Counter-offer amount exceeds maximum supported range."),
    currency: z.enum(["INR", "USD", "EUR", "GBP"]).default("INR"),
    termsSummary: z
      .string()
      .trim()
      .min(10, "Enter clear counter-offer terms (at least 10 characters).")
      .max(1500, "Offer terms cannot exceed 1500 characters."),
  }),
  z.object({
    action: z.literal("ACCEPT"),
    offerId: z.string().min(1, "Target offer ID is required."),
  }),
  z.object({
    action: z.literal("DECLINE"),
    offerId: z.string().min(1, "Target offer ID is required."),
  }),
  z.object({
    action: z.literal("WITHDRAW"),
    offerId: z.string().min(1, "Target offer ID is required."),
  }),
]);

export const updateChecklistSchema = z.object({
  itemId: z.string().min(1, "Checklist item ID is required."),
  action: z.enum(["CONFIRM", "SET_IN_PROGRESS", "REOPEN"]),
});
