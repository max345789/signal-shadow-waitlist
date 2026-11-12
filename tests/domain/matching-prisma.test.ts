// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { sanitizeListingForViewer } from "@/lib/domain/listings";
import { createSampleSeedListings } from "@/lib/listings/sample-data";
import type { AuthSession } from "@/lib/auth/types";

const {
  mockBuyerProfileUpsert,
  mockThesisCreate,
  mockThesisFindMany,
  mockThesisFindUnique,
  mockThesisUpdate,
  mockThesisDelete,
  mockMatchFindMany,
  mockMatchFindUnique,
  mockMatchUpsert,
  mockNotificationCreate,
  mockNotificationFindMany,
  mockNotificationFindUnique,
  mockNotificationUpdate,
  mockNotificationUpdateMany,
  mockAuditLogCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockBuyerProfileUpsert: vi.fn(),
  mockThesisCreate: vi.fn(),
  mockThesisFindMany: vi.fn(),
  mockThesisFindUnique: vi.fn(),
  mockThesisUpdate: vi.fn(),
  mockThesisDelete: vi.fn(),
  mockMatchFindMany: vi.fn(),
  mockMatchFindUnique: vi.fn(),
  mockMatchUpsert: vi.fn(),
  mockNotificationCreate: vi.fn(),
  mockNotificationFindMany: vi.fn(),
  mockNotificationFindUnique: vi.fn(),
  mockNotificationUpdate: vi.fn(),
  mockNotificationUpdateMany: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

const sampleApprovedListings = createSampleSeedListings(
  new Date("2026-11-12T10:00:00.000Z").getTime()
)
  .filter((b) => b.status === "APPROVED")
  .map((b) =>
    sanitizeListingForViewer(b, { userId: null, roles: [], hasSignedNda: false })
  );

vi.mock("@/lib/listings/store", () => ({
  listApprovedListings: vi.fn(async () => sampleApprovedListings),
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: () => Boolean(process.env.DATABASE_URL),
  getPrismaClient: () => ({
    buyerProfile: { upsert: mockBuyerProfileUpsert },
    thesis: {
      create: mockThesisCreate,
      findMany: mockThesisFindMany,
      findUnique: mockThesisFindUnique,
      update: mockThesisUpdate,
      delete: mockThesisDelete,
    },
    match: {
      findMany: mockMatchFindMany,
      findUnique: mockMatchFindUnique,
      upsert: mockMatchUpsert,
    },
    notification: {
      create: mockNotificationCreate,
      findMany: mockNotificationFindMany,
      findUnique: mockNotificationFindUnique,
      update: mockNotificationUpdate,
      updateMany: mockNotificationUpdateMany,
    },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  }),
}));

import {
  createThesisForBuyer,
  deleteThesisForBuyer,
  markAllNotificationsRead,
  markNotificationRead,
  updateThesisForBuyer,
} from "@/lib/matching/store";
import { evaluateAndSendThesisAlertsForListing } from "@/lib/matching/alerts";

const BUYER_SESSION: AuthSession = {
  userId: "pg-buyer-1",
  email: "pg.buyer@example.com",
  name: "PG Buyer",
  roles: ["BUYER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: "2026-11-12T09:00:00.000Z",
  authMode: "database",
  isSampleAccount: false,
};

function makePrismaThesisRow(overrides?: Record<string, unknown>) {
  const now = new Date("2026-11-12T10:00:00.000Z");
  return {
    id: "pg-thesis-1",
    buyerProfileId: "pg-bp-1",
    buyerProfile: { userId: BUYER_SESSION.userId },
    title: "Bengaluru SaaS Mandate",
    sector: "B2B SaaS",
    minRevenue: new Prisma.Decimal("5000000.00"),
    maxRevenue: new Prisma.Decimal("30000000.00"),
    minProfit: new Prisma.Decimal("3000000.00"),
    maxOwnerHours: 12,
    geography: "India (Bengaluru)",
    minPrice: new Prisma.Decimal("5000000.00"),
    maxPrice: new Prisma.Decimal("22000000.00"),
    currency: "INR",
    freeText: "GST compliance recurring Stripe verified",
    alertsEnabled: true,
    isSampleData: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Phase 2 PostgreSQL/Prisma query & transaction branches", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test";
    vi.clearAllMocks();

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        buyerProfile: { upsert: mockBuyerProfileUpsert },
        thesis: {
          create: mockThesisCreate,
          update: mockThesisUpdate,
          delete: mockThesisDelete,
        },
        match: {
          findUnique: mockMatchFindUnique,
          upsert: mockMatchUpsert,
        },
        notification: { create: mockNotificationCreate },
        auditLog: { create: mockAuditLogCreate },
      })
    );
  });

  afterEach(() => {
    if (originalDbUrl !== undefined) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("createThesisForBuyer converts Prisma Decimals, writes THESIS_CREATED AuditLog, and upserts Match(thesisId, businessId)", async () => {
    mockBuyerProfileUpsert.mockResolvedValue({ id: "pg-bp-1", userId: BUYER_SESSION.userId });
    mockThesisCreate.mockResolvedValue(makePrismaThesisRow());
    mockMatchFindMany.mockResolvedValue([]);
    let matchCounter = 0;
    mockMatchUpsert.mockImplementation(async ({ create }) => ({
      id: `pg-match-${++matchCounter}`,
      ...create,
      alertSentAt: null,
    }));

    const res = await createThesisForBuyer(
      {
        title: "Bengaluru SaaS Mandate",
        sector: "B2B SaaS",
        minRevenue: 5_000_000,
        maxRevenue: 30_000_000,
        minProfit: 3_000_000,
        maxOwnerHours: 12,
        geography: "India (Bengaluru)",
        minPrice: 5_000_000,
        maxPrice: 22_000_000,
        currency: "INR",
        freeText: "GST compliance recurring Stripe verified",
        alertsEnabled: true,
      },
      BUYER_SESSION
    );

    expect(res.thesis.minRevenue).toBe(5_000_000);
    expect(res.thesis.maxPrice).toBe(22_000_000);
    expect(res.matches).toHaveLength(sampleApprovedListings.length);
    expect(res.matches[0]!.listing.id).toBe("sample-biz-gst-01");

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: BUYER_SESSION.userId,
          entityType: "Thesis",
          action: "THESIS_CREATED",
        }),
      })
    );
    expect(mockMatchUpsert).toHaveBeenCalledTimes(sampleApprovedListings.length);
    expect(mockMatchUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          thesisId_businessId: {
            thesisId: "pg-thesis-1",
            businessId: "sample-biz-gst-01",
          },
        },
      })
    );
  });

  it("updateThesisForBuyer preserves Decimal bounds on partial update and rejects invalid merged bounds or ownership violations", async () => {
    mockThesisFindUnique.mockResolvedValue(makePrismaThesisRow());
    mockThesisUpdate.mockResolvedValue(makePrismaThesisRow({ alertsEnabled: false }));
    mockMatchFindMany.mockResolvedValue([]);
    mockMatchUpsert.mockResolvedValue({ id: "m1", alertSentAt: null });

    const forbidden = await updateThesisForBuyer(
      "pg-thesis-1",
      { alertsEnabled: false },
      { ...BUYER_SESSION, userId: "other-buyer" }
    );
    expect(forbidden).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const inverted = await updateThesisForBuyer(
      "pg-thesis-1",
      { minPrice: 30_000_000 },
      BUYER_SESSION
    );
    expect(inverted).toMatchObject({ ok: false, code: "INVALID_STATE" });

    const okRes = await updateThesisForBuyer(
      "pg-thesis-1",
      { alertsEnabled: false },
      BUYER_SESSION
    );
    expect(okRes.ok).toBe(true);
    expect(mockThesisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sector: "B2B SaaS",
          maxOwnerHours: 12,
          alertsEnabled: false,
        }),
      })
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "THESIS_UPDATED" }),
      })
    );
  });

  it("deleteThesisForBuyer deletes thesis and records THESIS_DELETED AuditLog", async () => {
    mockThesisFindUnique.mockResolvedValue(makePrismaThesisRow());
    mockThesisDelete.mockResolvedValue({ id: "pg-thesis-1" });

    const res = await deleteThesisForBuyer("pg-thesis-1", BUYER_SESSION);
    expect(res).toEqual({ ok: true });
    expect(mockThesisDelete).toHaveBeenCalledWith({ where: { id: "pg-thesis-1" } });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "Thesis",
          entityId: "pg-thesis-1",
          action: "THESIS_DELETED",
        }),
      })
    );
  });

  it("evaluateAndSendThesisAlertsForListing checks existingMatch inside $transaction and deduplicates alerts when alertSentAt exists", async () => {
    const rawGst = createSampleSeedListings(
      new Date("2026-11-12T10:00:00.000Z").getTime()
    )[0]!;

    mockThesisFindMany.mockResolvedValue([makePrismaThesisRow()]);
    // First approval: no existing match -> creates Notification + AuditLog
    mockMatchFindUnique.mockResolvedValueOnce(null);
    mockMatchUpsert.mockResolvedValue({ id: "m-alert-1" });
    mockNotificationCreate.mockResolvedValue({ id: "notif-pg-1" });

    const first = await evaluateAndSendThesisAlertsForListing(rawGst, "admin-1");
    expect(first).toEqual({ evaluatedTheses: 1, alertsCreated: 1 });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: BUYER_SESSION.userId,
          type: "THESIS_MATCH",
        }),
      })
    );
    expect(JSON.stringify(mockNotificationCreate.mock.calls[0])).not.toContain(
      "TaxBridge"
    );

    // Second approval: existing match already has alertSentAt -> updates score without duplicate Notification
    mockMatchFindUnique.mockResolvedValueOnce({
      id: "m-alert-1",
      alertSentAt: new Date("2026-11-12T10:00:00.000Z"),
    });
    const second = await evaluateAndSendThesisAlertsForListing(rawGst, "admin-1");
    expect(second).toEqual({ evaluatedTheses: 1, alertsCreated: 0 });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });

  it("markNotificationRead & markAllNotificationsRead enforce user ownership in Prisma mode", async () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    mockNotificationFindUnique.mockResolvedValue({
      id: "n-1",
      userId: BUYER_SESSION.userId,
      type: "THESIS_MATCH",
      title: "Match",
      body: "Body",
      actionUrl: "/matches",
      readAt: null,
      createdAt: now,
    });
    mockNotificationUpdate.mockResolvedValue({
      id: "n-1",
      userId: BUYER_SESSION.userId,
      type: "THESIS_MATCH",
      title: "Match",
      body: "Body",
      actionUrl: "/matches",
      readAt: now,
      createdAt: now,
    });
    mockNotificationUpdateMany.mockResolvedValue({ count: 2 });

    const forbidden = await markNotificationRead("n-1", {
      ...BUYER_SESSION,
      userId: "other-user",
    });
    expect(forbidden).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const okRead = await markNotificationRead("n-1", BUYER_SESSION);
    expect(okRead.ok).toBe(true);

    const allRead = await markAllNotificationsRead(BUYER_SESSION);
    expect(allRead).toEqual({ updatedCount: 2 });
  });
});
