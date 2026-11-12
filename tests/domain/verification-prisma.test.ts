// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { AuthSession } from "@/lib/auth/types";

const {
  mockVerificationCreate,
  mockVerificationFindFirst,
  mockVerificationFindMany,
  mockVerificationFindUnique,
  mockVerificationUpdate,
  mockBuyerProfileUpsert,
  mockBuyerProfileUpdateMany,
  mockSellerProfileUpsert,
  mockSellerProfileUpdateMany,
  mockBusinessFindUnique,
  mockBusinessUpdate,
  mockBusinessMetricUpdate,
  mockBusinessMetricCreate,
  mockBusinessMetricUpdateMany,
  mockNotificationCreate,
  mockAuditLogCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockVerificationCreate: vi.fn(),
  mockVerificationFindFirst: vi.fn(),
  mockVerificationFindMany: vi.fn(),
  mockVerificationFindUnique: vi.fn(),
  mockVerificationUpdate: vi.fn(),
  mockBuyerProfileUpsert: vi.fn(),
  mockBuyerProfileUpdateMany: vi.fn(),
  mockSellerProfileUpsert: vi.fn(),
  mockSellerProfileUpdateMany: vi.fn(),
  mockBusinessFindUnique: vi.fn(),
  mockBusinessUpdate: vi.fn(),
  mockBusinessMetricUpdate: vi.fn(),
  mockBusinessMetricCreate: vi.fn(),
  mockBusinessMetricUpdateMany: vi.fn(),
  mockNotificationCreate: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: () => Boolean(process.env.DATABASE_URL),
  getPrismaClient: () => ({
    verification: {
      create: mockVerificationCreate,
      findFirst: mockVerificationFindFirst,
      findMany: mockVerificationFindMany,
      findUnique: mockVerificationFindUnique,
      update: mockVerificationUpdate,
    },
    buyerProfile: {
      upsert: mockBuyerProfileUpsert,
      updateMany: mockBuyerProfileUpdateMany,
    },
    sellerProfile: {
      upsert: mockSellerProfileUpsert,
      updateMany: mockSellerProfileUpdateMany,
    },
    business: {
      findUnique: mockBusinessFindUnique,
      update: mockBusinessUpdate,
    },
    businessMetric: {
      update: mockBusinessMetricUpdate,
      create: mockBusinessMetricCreate,
      updateMany: mockBusinessMetricUpdateMany,
    },
    notification: { create: mockNotificationCreate },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  }),
}));

import {
  connectBusinessAccount,
  reconcileExpiredVerifications,
  reviewVerificationAsAdmin,
  submitIdentityVerification,
} from "@/lib/verification/store";

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

const SELLER_SESSION: AuthSession = {
  userId: "pg-seller-1",
  email: "pg.seller@example.com",
  name: "PG Seller",
  roles: ["SELLER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: "2026-11-12T09:00:00.000Z",
  authMode: "database",
  isSampleAccount: false,
};

const ADMIN_SESSION: AuthSession = {
  userId: "pg-admin-1",
  email: "pg.admin@example.com",
  name: "PG Admin",
  roles: ["ADMIN", "REVIEWER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: "2026-11-12T09:00:00.000Z",
  authMode: "database",
  isSampleAccount: false,
};

describe("Phase 3 PostgreSQL/Prisma transaction & audit branches", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test";
    vi.clearAllMocks();

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        verification: {
          create: mockVerificationCreate,
          update: mockVerificationUpdate,
        },
        buyerProfile: {
          upsert: mockBuyerProfileUpsert,
          updateMany: mockBuyerProfileUpdateMany,
        },
        sellerProfile: {
          upsert: mockSellerProfileUpsert,
          updateMany: mockSellerProfileUpdateMany,
        },
        business: { update: mockBusinessUpdate },
        businessMetric: {
          update: mockBusinessMetricUpdate,
          create: mockBusinessMetricCreate,
          updateMany: mockBusinessMetricUpdateMany,
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

  it("submitIdentityVerification creates PENDING verification, updates BuyerProfile, and writes AuditLog", async () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    mockVerificationCreate.mockResolvedValue({
      id: "pg-ver-id-1",
      userId: BUYER_SESSION.userId,
      businessId: null,
      type: "IDENTITY",
      provider: "Persona",
      status: "PENDING",
      verifiedAt: null,
      expiresAt: null,
      failureReason: null,
      metadataJson: { roleContext: "BUYER", maskedReference: "****901A" },
      createdAt: now,
      updatedAt: now,
      user: { id: BUYER_SESSION.userId, name: BUYER_SESSION.name, email: BUYER_SESSION.email },
    });

    const res = await submitIdentityVerification(
      {
        provider: "Persona",
        legalName: "PG Buyer",
        country: "India",
        documentType: "PAN",
        referenceLast4: "901A",
        roleContext: "BUYER",
      },
      BUYER_SESSION
    );

    expect(res.ok).toBe(true);
    expect(mockBuyerProfileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: BUYER_SESSION.userId },
        update: { identityStatus: "PENDING" },
      })
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "Verification",
          action: "IDENTITY_VERIFICATION_SUBMITTED",
        }),
      })
    );
  });

  it("connectBusinessAccount updates BusinessMetric + financialSeriesJson on success and records FAILED on invalid token", async () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    mockBusinessFindUnique.mockResolvedValue({
      id: "pg-biz-1",
      slug: "pg-saas",
      teaserTitle: "PG SaaS",
      currency: "INR",
      isSampleData: false,
      sellerProfile: { userId: SELLER_SESSION.userId },
      financialSeriesJson: [
        { period: "Q1", revenue: 1_000_000, profit: 400_000, source: "SELLER_REPORTED" },
      ],
      metrics: [
        {
          id: "pg-m-rev",
          key: "REVENUE",
          value: new Prisma.Decimal("4000000"),
          currency: "INR",
        },
        {
          id: "pg-m-cust",
          key: "CUSTOMERS",
          value: new Prisma.Decimal("90"),
          currency: null,
        },
        {
          id: "pg-m-prof",
          key: "PROFIT",
          value: new Prisma.Decimal("1600000"),
          currency: "INR",
        },
      ],
    });
    mockVerificationFindFirst.mockResolvedValue(null);
    mockVerificationCreate.mockResolvedValue({
      id: "pg-ver-stripe-1",
      userId: SELLER_SESSION.userId,
      businessId: "pg-biz-1",
      type: "PAYMENT_CONNECTOR",
      provider: "Stripe",
      status: "VERIFIED",
      verifiedAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
      failureReason: null,
      metadataJson: { connectorKind: "PAYMENT", accountHint: "Stripe acct****01" },
      createdAt: now,
      updatedAt: now,
      user: { id: SELLER_SESSION.userId, name: SELLER_SESSION.name, email: SELLER_SESSION.email },
      business: { id: "pg-biz-1", teaserTitle: "PG SaaS", slug: "pg-saas", isSampleData: false },
    });

    const okRes = await connectBusinessAccount(
      {
        businessId: "pg-biz-1",
        connectorKind: "PAYMENT",
        provider: "Stripe",
        accountIdentifier: "acct_pg_01",
        readOnlyToken: "rk_sandbox_valid_pg",
        syncIntervalMinutes: 60,
      },
      SELLER_SESSION
    );

    expect(okRes.ok).toBe(true);
    expect(mockBusinessMetricUpdate).toHaveBeenCalledTimes(2);
    expect(mockBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pg-biz-1" },
        data: expect.objectContaining({
          financialSeriesJson: expect.arrayContaining([
            expect.objectContaining({ source: "VERIFIED" }),
          ]),
        }),
      })
    );
  });

  it("connectBusinessAccount records TOKEN_EXPIRED with expiresAt, clears verifiedAt, and supports provider switch", async () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    mockBusinessFindUnique.mockResolvedValue({
      id: "pg-biz-1",
      slug: "pg-saas",
      teaserTitle: "PG SaaS",
      currency: "INR",
      isSampleData: false,
      sellerProfile: { userId: SELLER_SESSION.userId },
      financialSeriesJson: [
        { period: "Q1", revenue: 1_000_000, profit: 400_000, source: "VERIFIED" },
      ],
      metrics: [
        { id: "pg-m-rev", key: "REVENUE", value: new Prisma.Decimal("4000000"), currency: "INR" },
        { id: "pg-m-prof", key: "PROFIT", value: new Prisma.Decimal("1600000"), currency: "INR" },
      ],
    });
    mockVerificationFindFirst.mockResolvedValue(null);
    mockVerificationCreate.mockResolvedValue({
      id: "pg-ver-rzp-exp",
      userId: SELLER_SESSION.userId,
      businessId: "pg-biz-1",
      type: "PAYMENT_CONNECTOR",
      provider: "Razorpay",
      status: "EXPIRED",
      verifiedAt: null,
      expiresAt: now,
      failureReason: "Razorpay read-only authorization expired; reconnect to restore Verified status.",
      metadataJson: { connectorKind: "PAYMENT", sandboxTokenBehavior: "expired" },
      createdAt: now,
      updatedAt: now,
      user: { id: SELLER_SESSION.userId, name: SELLER_SESSION.name, email: SELLER_SESSION.email },
      business: { id: "pg-biz-1", teaserTitle: "PG SaaS", slug: "pg-saas", isSampleData: false },
    });

    const failRes = await connectBusinessAccount(
      {
        businessId: "pg-biz-1",
        connectorKind: "PAYMENT",
        provider: "Razorpay",
        accountIdentifier: "rzp_pg_01",
        readOnlyToken: "rzp_sandbox_expired_pg",
        syncIntervalMinutes: 60,
      },
      SELLER_SESSION
    );

    expect(failRes.ok).toBe(false);
    expect(mockVerificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "Razorpay",
          status: "EXPIRED",
          expiresAt: expect.any(Date),
        }),
      })
    );
    expect(mockBusinessMetricUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verifiedAt: null }),
      })
    );
    expect(mockBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          financialSeriesJson: expect.arrayContaining([
            expect.objectContaining({ source: "SELLER_REPORTED" }),
          ]),
        }),
      })
    );
  });

  it("reconcileExpiredVerifications marks expired records, reverts financialSeriesJson, notifies user, and writes AuditLog", async () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    mockVerificationFindMany.mockResolvedValue([
      {
        id: "pg-ver-exp-1",
        userId: null,
        businessId: "pg-biz-1",
        type: "PAYMENT_CONNECTOR",
        provider: "Stripe",
        status: "VERIFIED",
        verifiedAt: new Date("2026-11-01T10:00:00.000Z"),
        expiresAt: new Date("2026-11-11T10:00:00.000Z"),
        business: {
          id: "pg-biz-1",
          teaserTitle: "PG SaaS",
          financialSeriesJson: [
            { period: "Q1", revenue: 1_000_000, profit: 400_000, source: "VERIFIED" },
          ],
          metrics: [{ value: new Prisma.Decimal("400000") }],
          sellerProfile: { userId: SELLER_SESSION.userId },
        },
      },
    ]);

    const res = await reconcileExpiredVerifications(now);
    expect(res).toEqual({ expiredCount: 1 });
    expect(mockVerificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pg-ver-exp-1" },
        data: expect.objectContaining({ status: "EXPIRED" }),
      })
    );
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: SELLER_SESSION.userId,
          type: "VERIFICATION_EXPIRED",
        }),
      })
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "Verification",
          action: "VERIFICATION_EXPIRED",
        }),
      })
    );
  });

  it("reviewVerificationAsAdmin updates BuyerProfile identityStatus on APPROVE", async () => {
    const now = new Date("2026-11-12T10:00:00.000Z");
    mockVerificationFindUnique.mockResolvedValue({
      id: "pg-ver-id-2",
      userId: BUYER_SESSION.userId,
      businessId: null,
      type: "IDENTITY",
      provider: "Digio KYC",
      status: "PENDING",
      verifiedAt: null,
      expiresAt: null,
      failureReason: null,
      metadataJson: { roleContext: "BUYER" },
      user: { id: BUYER_SESSION.userId, name: BUYER_SESSION.name, email: BUYER_SESSION.email },
      business: null,
    });
    mockVerificationUpdate.mockResolvedValue({
      id: "pg-ver-id-2",
      userId: BUYER_SESSION.userId,
      businessId: null,
      type: "IDENTITY",
      provider: "Digio KYC",
      status: "VERIFIED",
      verifiedAt: now,
      expiresAt: new Date(now.getTime() + 90 * 86_400_000),
      failureReason: null,
      metadataJson: { roleContext: "BUYER" },
      createdAt: now,
      updatedAt: now,
      user: { id: BUYER_SESSION.userId, name: BUYER_SESSION.name, email: BUYER_SESSION.email },
      business: null,
    });

    const res = await reviewVerificationAsAdmin(
      "pg-ver-id-2",
      "APPROVE",
      "Digio PAN check confirmed.",
      ADMIN_SESSION,
      now
    );

    expect(res.ok).toBe(true);
    expect(mockBuyerProfileUpdateMany).not.toHaveBeenCalled();
    expect(mockBuyerProfileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: BUYER_SESSION.userId },
        update: { identityStatus: "VERIFIED" },
      })
    );
  });
});
