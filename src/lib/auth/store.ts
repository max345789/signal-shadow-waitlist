import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/crypto";
import type { RoleName, StoredUserRecord } from "@/lib/auth/types";

/**
 * Explicit local-dev sample accounts (ONLY active when DATABASE_URL is unset in non-production).
 * Clearly flagged `isSampleAccount: true` and `authMode: "local-dev"`.
 */
const DEV_TOTP_SECRET_BUYER = "JBSWY3DPEHPK3PXP";
const DEV_TOTP_SECRET_SELLER = "KRSXG5CTMVRXEZLU";

let localDevUsersCache: StoredUserRecord[] | null = null;

function getLocalDevUsers(): StoredUserRecord[] {
  if (!localDevUsersCache) {
    const sampleDevSecret =
      process.env.LOCAL_DEV_SAMPLE_PASSWORD ?? "SampleDevPass!2026";
    const devPasswordHash = hashPassword(sampleDevSecret);
    localDevUsersCache = [
      {
        id: "sample-buyer-01",
        email: "buyer.sample@trustmarketplace.local",
        name: "Ananya Rao (Sample Buyer)",
        passwordHash: devPasswordHash,
        roles: ["BUYER"],
        twoFactorEnabled: true,
        twoFactorSecret: DEV_TOTP_SECRET_BUYER,
        authMode: "local-dev",
        isSampleAccount: true,
      },
      {
        id: "sample-seller-01",
        email: "seller.sample@trustmarketplace.local",
        name: "Rohan Mehta (Sample Seller)",
        passwordHash: devPasswordHash,
        roles: ["SELLER"],
        twoFactorEnabled: true,
        twoFactorSecret: DEV_TOTP_SECRET_SELLER,
        authMode: "local-dev",
        isSampleAccount: true,
      },
      {
        id: "sample-reviewer-01",
        email: "reviewer.sample@trustmarketplace.local",
        name: "Priya Nair (Sample Reviewer)",
        passwordHash: devPasswordHash,
        roles: ["REVIEWER", "ADMIN"],
        twoFactorEnabled: true,
        twoFactorSecret: DEV_TOTP_SECRET_BUYER,
        authMode: "local-dev",
        isSampleAccount: true,
      },
    ];
  }
  return localDevUsersCache;
}

function isLocalDevAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_PROVIDER === "local-dev";
}

export async function findUserByEmail(email: string): Promise<StoredUserRecord | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { roles: true },
    });
    if (!user || !user.passwordHash) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      roles: user.roles.map((r) => r.name as RoleName),
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorSecret: user.twoFactorSecret,
      authMode: "database",
      isSampleAccount: false,
    };
  }

  if (!isLocalDevAuthAllowed()) {
    throw new Error("DATABASE_URL is required in production.");
  }

  return getLocalDevUsers().find((u) => u.email === normalizedEmail) ?? null;
}

export async function findUserById(userId: string): Promise<StoredUserRecord | null> {
  if (isDatabaseConfigured()) {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
    if (!user || !user.passwordHash) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      roles: user.roles.map((r) => r.name as RoleName),
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorSecret: user.twoFactorSecret,
      authMode: "database",
      isSampleAccount: false,
    };
  }

  if (!isLocalDevAuthAllowed()) {
    throw new Error("DATABASE_URL is required in production.");
  }

  return getLocalDevUsers().find((u) => u.id === userId) ?? null;
}

export function getLocalDevSampleAccountHints(): Array<{
  email: string;
  role: string;
  totpSecret: string;
}> {
  if (isDatabaseConfigured() || !isLocalDevAuthAllowed()) {
    return [];
  }
  return getLocalDevUsers().map((u) => ({
    email: u.email,
    role: u.roles.join(", "),
    totpSecret: u.twoFactorSecret ?? "",
  }));
}
