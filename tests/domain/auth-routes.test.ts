// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentTotpTokenForDev } from "@/lib/auth/crypto";
import { resetMemoryRateLimitsForTest } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";

const { mockPrismaUserFindUnique, mockPrismaUserUpdate } = vi.hoisted(() => ({
  mockPrismaUserFindUnique: vi.fn(),
  mockPrismaUserUpdate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: () => Boolean(process.env.DATABASE_URL),
  getPrismaClient: () => ({
    user: {
      findUnique: mockPrismaUserFindUnique,
      update: mockPrismaUserUpdate,
    },
  }),
}));

const mockCookiesGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookiesGet,
  }),
}));

import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as verify2faPost } from "@/app/api/auth/verify-2fa/route";
import { findUserById } from "@/lib/auth/store";

describe("Auth route handlers, rate limiting, and OAuth 2FA database paths", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    resetMemoryRateLimitsForTest();
    mockPrismaUserFindUnique.mockReset();
    mockPrismaUserUpdate.mockReset();
    mockCookiesGet.mockReset();
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDbUrl !== undefined) {
      process.env.DATABASE_URL = originalDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("rate-limits login per email even if X-Forwarded-For IP changes on every attempt", async () => {
    for (let i = 0; i < 10; i++) {
      const req = new Request("http://127.0.0.1:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${i + 1}`,
        },
        body: JSON.stringify({
          email: "buyer.sample@trustmarketplace.local",
          password: "WrongPassword!99",
        }),
      });
      const res = await loginPost(req);
      expect(res.status).toBe(401);
    }

    const throttledReq = new Request("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.250",
      },
      body: JSON.stringify({
        email: "buyer.sample@trustmarketplace.local",
        password: "SampleDevPass!2026",
      }),
    });
    const throttledRes = await loginPost(throttledReq);
    expect(throttledRes.status).toBe(429);
  });

  it("rejects oversized passwords to prevent scrypt CPU DoS", async () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "buyer.sample@trustmarketplace.local",
        password: "A".repeat(300),
      }),
    });
    const res = await loginPost(req);
    expect(res.status).toBe(400);
  });

  it("allows OAuth users (passwordHash: null) to verify 2FA and persists twoFactorVerifiedAt in DB", async () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test";
    const secret = "JBSWY3DPEHPK3PXP";
    const email = "oauth.buyer@example.com";

    mockPrismaUserFindUnique.mockResolvedValue({
      id: "oauth-user-1",
      email,
      name: "OAuth Buyer",
      passwordHash: null,
      roles: [{ name: "BUYER" }],
      twoFactorEnabled: true,
      twoFactorSecret: secret,
    });
    mockPrismaUserUpdate.mockResolvedValue({ id: "oauth-user-1" });

    const found = await findUserById("oauth-user-1");
    expect(found).not.toBeNull();
    expect(found?.passwordHash).toBeNull();

    const pre2faToken = await signSessionToken({
      userId: "oauth-user-1",
      email,
      name: "OAuth Buyer",
      roles: ["BUYER"],
      twoFactorEnabled: true,
      twoFactorVerifiedAt: null,
      authMode: "database",
      isSampleAccount: false,
    });
    mockCookiesGet.mockImplementation((name: string) =>
      name === SESSION_COOKIE_NAME ? { value: pre2faToken } : undefined
    );

    const code = getCurrentTotpTokenForDev(secret, email);
    const spacedCode = `${code.slice(0, 3)} ${code.slice(3)}`;

    const req = new Request("http://127.0.0.1:3000/api/auth/verify-2fa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: spacedCode }),
    });
    const res = await verify2faPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dealRoomAccessUnlocked).toBe(true);
    expect(body.session.twoFactorVerifiedAt).toBeTruthy();

    expect(mockPrismaUserUpdate).toHaveBeenCalledTimes(1);
    expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "oauth-user-1" },
        data: expect.objectContaining({
          twoFactorEnabled: true,
          twoFactorVerifiedAt: expect.any(Date),
        }),
      })
    );
  });
});
