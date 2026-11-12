// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/lib/auth/types";

const {
  mockBusinessFindUnique,
  mockBuyerProfileUpsert,
  mockDealRoomFindUnique,
  mockDealRoomFindUniqueOrThrow,
  mockDealRoomCreate,
  mockDealRoomUpdate,
  mockDealStageUpdateMany,
  mockVerificationFindMany,
  mockVerificationUpdate,
  mockOfferCreate,
  mockOfferUpdate,
  mockChecklistItemUpdate,
  mockDocumentCreate,
  mockDocumentViewCreate,
  mockEscrowFindFirst,
  mockNotificationCreate,
  mockAuditLogCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockBusinessFindUnique: vi.fn(),
  mockBuyerProfileUpsert: vi.fn(),
  mockDealRoomFindUnique: vi.fn(),
  mockDealRoomFindUniqueOrThrow: vi.fn(),
  mockDealRoomCreate: vi.fn(),
  mockDealRoomUpdate: vi.fn(),
  mockDealStageUpdateMany: vi.fn(),
  mockVerificationFindMany: vi.fn(),
  mockVerificationUpdate: vi.fn(),
  mockOfferCreate: vi.fn(),
  mockOfferUpdate: vi.fn(),
  mockChecklistItemUpdate: vi.fn(),
  mockDocumentCreate: vi.fn(),
  mockDocumentViewCreate: vi.fn(),
  mockEscrowFindFirst: vi.fn(),
  mockNotificationCreate: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: () => Boolean(process.env.DATABASE_URL),
  getPrismaClient: () => ({
    business: { findUnique: mockBusinessFindUnique },
    buyerProfile: { upsert: mockBuyerProfileUpsert },
    dealRoom: {
      findUnique: mockDealRoomFindUnique,
      findUniqueOrThrow: mockDealRoomFindUniqueOrThrow,
      create: mockDealRoomCreate,
      update: mockDealRoomUpdate,
    },
    dealStage: { updateMany: mockDealStageUpdateMany },
    verification: {
      findMany: mockVerificationFindMany,
      update: mockVerificationUpdate,
    },
    offer: { create: mockOfferCreate, update: mockOfferUpdate },
    checklistItem: { update: mockChecklistItemUpdate },
    document: { create: mockDocumentCreate },
    documentView: { create: mockDocumentViewCreate },
    escrowTransaction: { findFirst: mockEscrowFindFirst },
    notification: { create: mockNotificationCreate },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  }),
}));

import {
  createOrOpenDealRoom,
  createSignedDocumentDownloadUrl,
  downloadWatermarkedDocument,
  transitionDealRoomStage,
  updateDealRoomChecklistItem,
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

function makePrismaRoom(overrides?: Partial<Record<string, unknown>>) {
  const now = new Date("2026-11-12T10:00:00.000Z");
  return {
    id: "pg-deal-1",
    businessId: "pg-biz-1",
    buyerProfileId: "pg-bp-1",
    sellerProfileId: "pg-sp-1",
    currentStage: "INTRO",
    status: "ACTIVE",
    ndaSignedAt: null,
    ndaDocumentId: null,
    createdAt: now,
    updatedAt: now,
    business: {
      id: "pg-biz-1",
      slug: "pg-saas-biz",
      teaserTitle: "PG B2B SaaS",
      sector: "B2B SaaS",
      geography: "India",
      askingPrice: 12000000,
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
        id: "stg-1",
        dealRoomId: "pg-deal-1",
        stage: "INTRO",
        ownerRole: "BOTH",
        requiredAction: "Confirm mutual fit",
        status: "ACTIVE",
        completedAt: null,
        updatedAt: now,
      },
      {
        id: "stg-2",
        dealRoomId: "pg-deal-1",
        stage: "NDA",
        ownerRole: "BUYER",
        requiredAction: "Sign NDA",
        status: "PENDING",
        completedAt: null,
        updatedAt: now,
      },
    ],
    messages: [],
    documents: [],
    offers: [],
    checklistItems: [
      {
        id: "chk-1",
        dealRoomId: "pg-deal-1",
        phase: "DUE_DILIGENCE",
        category: "Technical",
        title: "Audit Git repository",
        buyerConfirmedAt: null,
        sellerConfirmedAt: null,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      },
    ],
    auditLogs: [],
    ...overrides,
  };
}

describe("Phase 4 Deal Room PostgreSQL/Prisma branch", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test";
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn) =>
      fn({
        dealRoom: {
          create: mockDealRoomCreate,
          update: mockDealRoomUpdate,
          findUniqueOrThrow: mockDealRoomFindUniqueOrThrow,
        },
        dealStage: { updateMany: mockDealStageUpdateMany },
        verification: { update: mockVerificationUpdate },
        offer: { create: mockOfferCreate, update: mockOfferUpdate },
        checklistItem: { update: mockChecklistItemUpdate },
        document: { create: mockDocumentCreate },
        documentView: { create: mockDocumentViewCreate },
        notification: { create: mockNotificationCreate },
        auditLog: { create: mockAuditLogCreate },
      })
    );
    mockVerificationFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("creates deal room in Prisma transaction with generated checklist, notification, and AuditLog", async () => {
    mockBusinessFindUnique.mockResolvedValue({
      id: "pg-biz-1",
      status: "APPROVED",
      sector: "B2B SaaS",
      currency: "INR",
      teaserTitle: "PG B2B SaaS",
      sellerProfileId: "pg-sp-1",
      sellerProfile: { userId: "pg-seller-1", user: { id: "pg-seller-1", name: "PG Seller" } },
    });
    mockBuyerProfileUpsert.mockResolvedValue({ id: "pg-bp-1", userId: "pg-buyer-1" });
    mockDealRoomFindUnique.mockResolvedValue(null);
    mockDealRoomCreate.mockResolvedValue({ id: "pg-deal-1" });
    mockDealRoomFindUniqueOrThrow.mockResolvedValue(makePrismaRoom());

    const res = await createOrOpenDealRoom("pg-biz-1", BUYER_SESSION);
    expect(res.ok).toBe(true);
    expect(mockDealRoomCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DEAL_ROOM_CREATED" }),
      })
    );
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    if (res.ok) {
      expect(res.data.redactedName).toBeNull();
    }
  });

  it("transitions stage in Prisma and records STAGE_TRANSITION AuditLog", async () => {
    mockDealRoomFindUnique.mockResolvedValue(makePrismaRoom());
    mockEscrowFindFirst.mockResolvedValue(null);
    mockDealRoomFindUniqueOrThrow.mockResolvedValue(
      makePrismaRoom({ currentStage: "NDA" })
    );

    const res = await transitionDealRoomStage("pg-deal-1", "NDA", BUYER_SESSION);
    expect(res.ok).toBe(true);
    expect(mockDealRoomUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStage: "NDA" } })
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "STAGE_TRANSITION" }),
      })
    );
  });

  it("logs DocumentView and DOCUMENT_VIEWED AuditLog on signed Prisma download", async () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    const activeVerifications = [
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
    mockVerificationFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(activeVerifications)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(activeVerifications);

    const roomWithDoc = makePrismaRoom({
      currentStage: "DATA_ACCESS",
      ndaSignedAt: past,
      documents: [
        {
          id: "pg-doc-1",
          dealRoomId: "pg-deal-1",
          uploadedById: "pg-seller-1",
          uploadedBy: { id: "pg-seller-1", name: "PG Seller" },
          title: "Q3 Ledger",
          category: "FINANCIAL",
          storageKey: "pg-deal-1/pg-doc-1-abc-ledger.txt",
          watermarkedKey: null,
          version: 1,
          virusScanStatus: "CLEAN",
          views: [],
          createdAt: past,
        },
      ],
    });

    mockDealRoomFindUnique.mockResolvedValue(roomWithDoc);
    mockDocumentViewCreate.mockResolvedValue({ id: "view-1" });

    const signed = await createSignedDocumentDownloadUrl(
      "pg-deal-1",
      "pg-doc-1",
      BUYER_SESSION
    );
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const token = new URL(`http://localhost${signed.data.signedUrl}`).searchParams.get(
      "token"
    )!;
    const dl = await downloadWatermarkedDocument({
      dealRoomId: "pg-deal-1",
      documentId: "pg-doc-1",
      token,
      session: BUYER_SESSION,
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
    });
    expect(dl.ok).toBe(true);
    if (dl.ok) {
      expect(dl.data.filename).toBe("ledger.txt");
    }
    expect(mockDocumentViewCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DOCUMENT_VIEWED" }),
      })
    );
  });

  it("recovers exact filenames with hyphens from vault --nonce-- storage keys in Prisma mode", async () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    mockVerificationFindMany.mockResolvedValue([
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
    ]);

    mockDealRoomFindUnique.mockResolvedValue(
      makePrismaRoom({
        currentStage: "DATA_ACCESS",
        ndaSignedAt: past,
        documents: [
          {
            id: "pg-doc-2",
            dealRoomId: "pg-deal-1",
            uploadedById: "pg-seller-1",
            uploadedBy: { id: "pg-seller-1", name: "PG Seller" },
            title: "Audited Q4 Report",
            category: "FINANCIAL",
            storageKey: "pg-deal-1/doc-m3xyz-ab12--a1b2c3d4e5f6--q4-audited-report.pdf",
            watermarkedKey:
              "pg-deal-1/doc-m3xyz-ab12--a1b2c3d4e5f6--watermarked--q4-audited-report.pdf",
            version: 1,
            virusScanStatus: "CLEAN",
            views: [],
            createdAt: past,
          },
        ],
      })
    );

    const { getDealRoomForViewer } = await import("@/lib/deal-rooms/store");
    const res = await getDealRoomForViewer("pg-deal-1", BUYER_SESSION);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.documents[0]?.filename).toBe("q4-audited-report.pdf");
      expect(res.data.documents[0]?.mimeType).toBe("application/pdf");
    }
  });

  it("updates checklist item confirmation in Prisma with AuditLog", async () => {
    mockDealRoomFindUnique.mockResolvedValue(makePrismaRoom({ currentStage: "DUE_DILIGENCE" }));
    mockDealRoomFindUniqueOrThrow.mockResolvedValue(makePrismaRoom({ currentStage: "DUE_DILIGENCE" }));

    const res = await updateDealRoomChecklistItem(
      "pg-deal-1",
      { itemId: "chk-1", action: "CONFIRM" },
      BUYER_SESSION
    );
    expect(res.ok).toBe(true);
    expect(mockChecklistItemUpdate).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CHECKLIST_ITEM_UPDATED" }),
      })
    );
  });
});
