import { z } from "zod";
import { currencySchema } from "@/lib/listings/validation";

const cleanStringValue = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .transform((val) => {
    if (!val) return null;
    const trimmed = val.trim();
    if (!trimmed || trimmed === "ALL" || trimmed === "ANY") return null;
    return trimmed;
  });

const optionalCleanString = cleanStringValue
  .optional()
  .transform((val) => (val === undefined ? null : val));

const optionalNonNegativeNumber = z
  .number()
  .finite("Enter a valid number.")
  .min(0, "Value cannot be negative.")
  .optional()
  .nullable()
  .transform((val) => (val === undefined ? null : val));

const optionalFiniteNumber = z
  .number()
  .finite("Enter a valid number.")
  .optional()
  .nullable()
  .transform((val) => (val === undefined ? null : val));

const optionalOwnerHours = z
  .number()
  .finite("Enter a valid hour count.")
  .int("Owner hours must be a whole number.")
  .min(0, "Owner hours cannot be negative.")
  .max(168, "Owner hours cannot exceed 168 per week.")
  .optional()
  .nullable()
  .transform((val) => (val === undefined ? null : val));

const patchCleanString = cleanStringValue.optional();
const patchNonNegativeNumber = z
  .number()
  .finite("Enter a valid number.")
  .min(0, "Value cannot be negative.")
  .nullable()
  .optional();
const patchFiniteNumber = z
  .number()
  .finite("Enter a valid number.")
  .nullable()
  .optional();
const patchOwnerHours = z
  .number()
  .finite("Enter a valid hour count.")
  .int("Owner hours must be a whole number.")
  .min(0, "Owner hours cannot be negative.")
  .max(168, "Owner hours cannot exceed 168 per week.")
  .nullable()
  .optional();

const thesisCoreShape = z.object({
  title: z
    .string()
    .trim()
    .max(120, "Thesis title cannot exceed 120 characters.")
    .optional()
    .default(""),
  sector: optionalCleanString,
  minRevenue: optionalNonNegativeNumber,
  maxRevenue: optionalNonNegativeNumber,
  minProfit: optionalFiniteNumber,
  maxOwnerHours: optionalOwnerHours,
  geography: optionalCleanString,
  minPrice: optionalNonNegativeNumber,
  maxPrice: optionalNonNegativeNumber,
  currency: currencySchema.default("INR"),
  freeText: z
    .string()
    .trim()
    .max(2000, "Free-text criteria cannot exceed 2000 characters.")
    .default(""),
  alertsEnabled: z.boolean().default(true),
});

function validateThesisBounds(
  data: z.infer<typeof thesisCoreShape>,
  ctx: z.RefinementCtx,
  options: { requireTitle: boolean }
) {
  if (options.requireTitle && data.title.trim().length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["title"],
      message: "Enter a thesis title of at least 3 characters.",
    });
  }

  if (
    data.minRevenue !== null &&
    data.maxRevenue !== null &&
    data.minRevenue > data.maxRevenue
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxRevenue"],
      message: "Maximum revenue must be greater than or equal to minimum revenue.",
    });
  }

  if (
    data.minPrice !== null &&
    data.maxPrice !== null &&
    data.minPrice > data.maxPrice
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxPrice"],
      message: "Maximum price must be greater than or equal to minimum price.",
    });
  }

  const hasAnyStructured =
    data.sector !== null ||
    data.geography !== null ||
    data.minRevenue !== null ||
    data.maxRevenue !== null ||
    data.minProfit !== null ||
    data.maxOwnerHours !== null ||
    data.minPrice !== null ||
    data.maxPrice !== null;

  if (!hasAnyStructured && data.freeText.trim().length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["freeText"],
      message:
        "Provide at least one structured filter or 3+ characters of free-text thesis criteria.",
    });
  }
}

export const previewThesisSchema = thesisCoreShape.superRefine((data, ctx) => {
  validateThesisBounds(data, ctx, { requireTitle: false });
});

export const upsertThesisSchema = thesisCoreShape.superRefine((data, ctx) => {
  validateThesisBounds(data, ctx, { requireTitle: true });
});

export const patchThesisSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a thesis title of at least 3 characters.").max(120).optional(),
    sector: patchCleanString,
    minRevenue: patchNonNegativeNumber,
    maxRevenue: patchNonNegativeNumber,
    minProfit: patchFiniteNumber,
    maxOwnerHours: patchOwnerHours,
    geography: patchCleanString,
    minPrice: patchNonNegativeNumber,
    maxPrice: patchNonNegativeNumber,
    currency: currencySchema.optional(),
    freeText: z.string().trim().max(2000).optional(),
    alertsEnabled: z.boolean().optional(),
  })
  .refine((obj) => Object.values(obj).some((value) => value !== undefined), {
    message: "Provide at least one thesis field to update.",
  })
  .superRefine((data, ctx) => {
    if (
      data.minRevenue !== undefined &&
      data.minRevenue !== null &&
      data.maxRevenue !== undefined &&
      data.maxRevenue !== null &&
      data.minRevenue > data.maxRevenue
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxRevenue"],
        message: "Maximum revenue must be greater than or equal to minimum revenue.",
      });
    }
    if (
      data.minPrice !== undefined &&
      data.minPrice !== null &&
      data.maxPrice !== undefined &&
      data.maxPrice !== null &&
      data.minPrice > data.maxPrice
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxPrice"],
        message: "Maximum price must be greater than or equal to minimum price.",
      });
    }
  });

export function parseCompareBusinessIds(rawIdsParam: string | null): {
  ok: true;
  ids: string[];
} | {
  ok: false;
  error: string;
} {
  if (!rawIdsParam || rawIdsParam.trim().length === 0) {
    return { ok: true, ids: [] };
  }
  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  for (const part of rawIdsParam.split(",")) {
    const clean = part.trim();
    if (!clean) continue;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(clean)) {
      return { ok: false, error: "Invalid listing identifier in comparison request." };
    }
    if (!seen.has(clean)) {
      seen.add(clean);
      uniqueIds.push(clean);
    }
  }
  if (uniqueIds.length > 3) {
    return {
      ok: false,
      error: "You can compare up to 3 businesses side by side.",
    };
  }
  return { ok: true, ids: uniqueIds };
}
