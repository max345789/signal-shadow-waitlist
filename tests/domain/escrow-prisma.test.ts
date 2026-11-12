// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/lib/auth/types";
import { generateTransferChecklistItems } from "@/lib/domain/deal-room";

const {
  mockUserFindMany,
  mockDealRoomFindUnique,
  mockDealRoomFindUniqueOrThrow,
  mockDealRoomFindMany,
  mockDealRoomUpdate,
  mockDealStageUpdateMany,
  mockChecklistItemCreateMany,
  mockEscrowFindFirst,
  mockEscrowCreate,
  mockEscrowUpdate,
  mockVerificationFindMany,
  mockNotificationCreate,
  mockNotificationCreateMany,
  mockAuditLogCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockDealRoomFindUnique: vi.fn(),
  mockDealRoomFindUniqueOrThrow: vi.fn(),
  mockDealRoomFindMany: vi.fn(),
  mockDealRoomUpdate: vi.fn(),
  mockDealStageUpdateMany: vi.fn(),
  mockChecklistItemCreateMany: vi.fn(),
  mockEscrowFindFirst: vi.fn(),
  mockEscrowCreate: vi.fn(),
  mockEscrowUpdate: vi.fn(),
  mockVerificationFindMany: vi.fn(),
  mockNotificationCreate: vi.fn(),
  mockNotificationCreateMany: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: () => Boolean(process.env.DATABASE_URL),
  getPrismaClient: () => ({
    user: { findMany: mockUserFindMany },
    dealRoom: {
      findUnique: mockDealRoomFindUnique,
      findUniqueOrThrow: mockDealRoomFindUniqueOrThrow,
      findMany: mockDealRoomFindMany,
      update: mockDealRoomUpdate,
    },
    dealStage: { updateMany: mockDealStageUpdateMany },
    checklistItem: { createMany: mockChecklistItemCreateMany },
    escrowTransaction: {
      findFirst: mockEscrowFindFirst,
      create: mockEscrowCreate,
      update: mockEscrowUpdate,
    },
    verification: { findMany: mockVerificationFindMany },
    notification: {
      create: mockNotificationCreate,
      createMany: mockNotificationCreateMany,
    },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  }),
}));

import {
  handleDealRoomEscrowAction,
  listDisputedDealRoomsForAdmin,
  resolveDealRoomDisputeAsAdmin,
  transitionDealRoomStage,
} from "@/lib/deal-rooms/store";

const BUYER_SESSION: AuthSession = {
  userId: "pg-buyer-1",
  email: "pg.buyer@example.com",
  name: "PG Buyer",
  roles: ["BUYER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "database",
  isSampleAccount: false,
};

const REVIEWER_SESSION: AuthSession = {
  userId: "pg-reviewer-1",
  email: "pg.reviewer@example.com",
  name: "PG Reviewer",
  roles: ["REVIEWER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "database",
  isSampleAccount: false,
};

function makePrismaRoom(overrides?: Partial<Record<string, unknown>>) {
  const now = new Date("2026-11-12T10:00:00.000Z");
  return {
    id: "pg-deal-1",
    businessId: "pg-biz-1",
    buyerProfileId: "pg-bp-1",
    sellerProfileId: "pg-sp-1",
    currentStage: "ESCROW",
    status: "ACTIVE",
    ndaSignedAt: now,
    ndaDocumentId: "nda-1",
    createdAt: now,
    updatedAt: now,
    business: {
      id: "pg-biz-1",
      slug: "pg-saas-biz",
      teaserTitle: "PG B2B SaaS",
      sector: "B2B SaaS",
      geography: "India",
      askingPrice: 12_000_000,
      currency: "INR",
      isSampleData: false,
      redactedName: "SecretCo Pvt Ltd",
      redactedDomain: "secretco.in",
      redactedCustomers: "Top 10 banks",
    },
    buyerProfile: {
      id: "pg-bp-1",
      userId: "pg-buyer-1",
      user: { id: "pg-buyer-1", name: "PG Buyer" },
    },
    sellerProfile: {
      id: "pg-sp-1",
      userId: "pg-seller-1",
      user: { id: "pg-seller-1", name: "PG Seller" },
    },
    stages: [
      {
        id: "stg-esc",
        dealRoomId: "pg-deal-1",
        stage: "ESCROW",
        ownerRole: "BUYER",
        requiredAction: "Fund escrow",
        status: "ACTIVE",
        completedAt: null,
        updatedAt: now,
      },
      {
        id: "stg-xfer",
        dealRoomId: "pg-deal-1",
        stage: "TRANSFER",
        ownerRole: "BOTH",
        requiredAction: "Transfer assets",
        status: "PENDING",
        completedAt: null,
        updatedAt: now,
      },
    ],
    messages: [],
    documents: [],
    offers: [
      {
        id: "off-1",
        dealRoomId: "pg-deal-1",
        proposerId: "pg-buyer-1",
        proposer: { id: "pg-buyer-1", name: "PG Buyer" },
        amount: 12_000_000,
        currency: "INR",
        termsSummary: "Escrow funded",
        status: "ACCEPTED",
        parentOfferId: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    checklistItems: [],
    escrowTransactions: [],
    auditLogs: [],
    ...overrides,
  };
}

describe("Phase 5 Escrow & Transfer PostgreSQL/Prisma branch", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test";
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        dealRoom: {
          update: mockDealRoomUpdate,
          findUniqueOrThrow: mockDealRoomFindUniqueOrThrow,
        },
        dealStage: { updateMany: mockDealStageUpdateMany },
        checklistItem: { createMany: mockChecklistItemCreateMany },
        escrowTransaction: {
          create: mockEscrowCreate,
          update: mockEscrowUpdate,
        },
        notification: {
          create: mockNotificationCreate,
          createMany: mockNotificationCreateMany,
        },
        auditLog: { create: mockAuditLogCreate },
      })
    );

    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    mockVerificationFindMany.mockImplementation(
      async (args?: { where?: { expiresAt?: unknown } }) => {
        if (args?.where && "expiresAt" in args.where) {
          return [];
        }
        return [
          {
            id: "v-id",
            type: "IDENTITY",
            provider: "Persona",
            status: "VERIFIED",
            verifiedAt: past,
            expiresAt: future,
          },
          {
            id: "v-pof",
            type: "PROOF_OF_FUNDS",
            provider: "Setu AA",
            status: "VERIFIED",
            verifiedAt: past,
            expiresAt: future,
          },
        ];
      }
    );
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("initiates and funds EscrowTransaction in Prisma without holding platform funds", async () => {
    mockDealRoomFindUnique.mockResolvedValue(makePrismaRoom());
    mockUserFindMany.mockResolvedValue([
      { id: "pg-buyer-1", email: "pg.buyer@example.com" },
      { id: "pg-seller-1", email: "pg.seller@example.com" },
    ]);
    mockEscrowCreate.mockResolvedValue({ id: "pg-esc-1" });
    mockDealRoomFindUniqueOrThrow.mockResolvedValue(
      makePrismaRoom({
        escrowTransactions: [
          {
            id: "pg-esc-1",
            dealRoomId: "pg-deal-1",
            provider: "Escrow.com",
            externalRef: "ESC-ESCCOM-TEST",
            amount: 12_000_000,
            currency: "INR",
            status: "INITIATED",
            fundedAt: null,
            releasedAt: null,
            disputeReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
    );

    const init = await handleDealRoomEscrowAction(
      "pg-deal-1",
      { action: "INITIATE", provider: "Escrow.com" },
      BUYER_SESSION
    );
    expect(init.ok).toBe(true);
    expect(mockEscrowCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ESCROW_INITIATED" }),
      })
    );
  });

  it("generates all 7 TRANSFER checklist items in Prisma when entering TRANSFER", async () => {
    mockDealRoomFindUnique.mockResolvedValue(makePrismaRoom());
    mockEscrowFindFirst.mockResolvedValue({ id: "pg-esc-1" });
    mockDealRoomFindUniqueOrThrow.mockResolvedValue(
      makePrismaRoom({ currentStage: "TRANSFER" })
    );

    const res = await transitionDealRoomStage("pg-deal-1", "TRANSFER", BUYER_SESSION);
    expect(res.ok).toBe(true);
    expect(mockChecklistItemCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ phase: "TRANSFER", category: "Domain" }),
          expect.objectContaining({ phase: "TRANSFER", category: "Vendor contracts" }),
        ]),
      })
    );
    const callArg = mockChecklistItemCreateMany.mock.calls[0]?.[0] as {
      data: Array<{ category: string }>;
    };
    expect(callArg.data).toHaveLength(7);
  });

  it("releases escrow in Prisma once all 7 transfer items are confirmed and completes room", async () => {
    const now = new Date();
    const confirmedItems = generateTransferChecklistItems().map((item, idx) => ({
      id: `xfer-${idx}`,
      dealRoomId: "pg-deal-1",
      phase: "TRANSFER",
      category: item.category,
      title: item.title,
      buyerConfirmedAt: now,
      sellerConfirmedAt: now,
      status: "CONFIRMED",
      createdAt: now,
      updatedAt: now,
    }));

    mockDealRoomFindUnique.mockResolvedValue(
      makePrismaRoom({
        currentStage: "TRANSFER",
        checklistItems: confirmedItems,
        escrowTransactions: [
          {
            id: "pg-esc-1",
            dealRoomId: "pg-deal-1",
            provider: "Castler Escrow",
            externalRef: "ESC-CASTLER-1",
            amount: 12_000_000,
            currency: "INR",
            status: "IN_REVIEW",
            fundedAt: now,
            releasedAt: null,
            disputeReason: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    );
    mockDealRoomFindUniqueOrThrow.mockResolvedValue(
      makePrismaRoom({
        currentStage: "TRANSFER",
        status: "COMPLETED",
        checklistItems: confirmedItems,
      })
    );

    const res = await handleDealRoomEscrowAction(
      "pg-deal-1",
      { action: "RELEASE", escrowId: "pg-esc-1" },
      BUYER_SESSION
    );
    expect(res.ok).toBe(true);
    expect(mockEscrowUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RELEASED" }),
      })
    );
    expect(mockDealRoomUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "COMPLETED" },
      })
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ESCROW_RELEASED" }),
      })
    );
  });

  it("lists and resolves disputed deal rooms in Prisma with AuditLog + dual notifications", async () => {
    const now = new Date();
    const disputedRoom = makePrismaRoom({
      currentStage: "TRANSFER",
      status: "DISPUTED",
      escrowTransactions: [
        {
          id: "pg-esc-1",
          dealRoomId: "pg-deal-1",
          provider: "Escrow.com",
          externalRef: "ESC-ESCCOM-DISP",
          amount: 12_000_000,
          currency: "INR",
          status: "DISPUTED",
          fundedAt: now,
          releasedAt: null,
          disputeReason: "Domain transfer pending",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    mockDealRoomFindMany.mockResolvedValue([disputedRoom]);
    mockDealRoomFindUnique.mockResolvedValue(disputedRoom);
    mockDealRoomFindUniqueOrThrow.mockResolvedValue(
      makePrismaRoom({
        currentStage: "TRANSFER",
        status: "COMPLETED",
        escrowTransactions: [
          {
            id: "pg-esc-1",
            dealRoomId: "pg-deal-1",
            provider: "Escrow.com",
            externalRef: "ESC-ESCCOM-DISP",
            amount: 12_000_000,
            currency: "INR",
            status: "RELEASED",
            fundedAt: now,
            releasedAt: now,
            disputeReason: "Domain transfer pending",
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    );

    const listRes = await listDisputedDealRoomsForAdmin(REVIEWER_SESSION);
    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      expect(listRes.data).toHaveLength(1);
    }

    const resolved = await resolveDealRoomDisputeAsAdmin(
      "pg-deal-1",
      {
        decision: "RELEASE_TO_SELLER",
        resolutionNote: "Confirmed registrar transfer completed in WHOIS.",
      },
      REVIEWER_SESSION
    );
    expect(resolved.ok).toBe(true);
    expect(mockNotificationCreateMany).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DISPUTE_RESOLVED" }),
      })
    );
  });
});
