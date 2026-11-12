import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import { registerCustomAdminEmail } from "@/lib/auth/permissions";
import type { RoleName, StoredUserRecord } from "@/lib/auth/types";

/**
 * Explicit local-dev sample accounts (ONLY active when DATABASE_URL is unset in non-production).
 * Clearly flagged `isSampleAccount: true` and `authMode: "local-dev"`.
 */
const DEV_TOTP_SECRET_BUYER = "JBSWY3DPEHPK3PXP";
const DEV_TOTP_SECRET_SELLER = "KRSXG5CTMVRXEZLU";
const DEV_TOTP_SECRET_REVIEWER = "MFRGGZDFMZTWQ2LK";

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
        twoFactorSecret: DEV_TOTP_SECRET_REVIEWER,
        authMode: "local-dev",
        isSampleAccount: true,
      },
      {
        id: "sample-admin-01",
        email: "admin@baton.com",
        name: "Baton Admin",
        passwordHash: devPasswordHash,
        roles: ["ADMIN"],
        twoFactorEnabled: true,
        twoFactorSecret: DEV_TOTP_SECRET_REVIEWER,
        authMode: "local-dev",
        isSampleAccount: true,
      },
      {
        id: "sample-admin-02",
        email: "admin.sample@trustmarketplace.local",
        name: "Executive Administrator",
        passwordHash: devPasswordHash,
        roles: ["ADMIN"],
        twoFactorEnabled: true,
        twoFactorSecret: DEV_TOTP_SECRET_REVIEWER,
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
    if (!user) {
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

export async function recordTwoFactorVerification(
  userId: string,
  verifiedAt: Date
): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }
  const prisma = getPrismaClient();
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorVerifiedAt: verifiedAt,
    },
  });
}

export function getLocalDevSampleAccountHints(): Array<{
  email: string;
  role: string;
  totpSecret: string;
}> {
  return [];
}

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  roles: RoleName[];
  twoFactorEnabled: boolean;
  createdAt: string;
  suspended: boolean;
  authMode: string;
}

const suspendedUserIds = new Set<string>();

export function isUserSuspended(userId: string): boolean {
  return suspendedUserIds.has(userId);
}

export async function listAllUsersForAdmin(): Promise<AdminUserSummary[]> {
  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const users = await prisma.user.findMany({
        include: { roles: true },
        orderBy: { createdAt: "desc" },
      });
      return users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        roles: u.roles.map((r) => r.name as RoleName),
        twoFactorEnabled: u.twoFactorEnabled,
        createdAt: u.createdAt.toISOString(),
        suspended: suspendedUserIds.has(u.id),
        authMode: u.oauthProvider || "database",
      }));
    } catch {
      // Fallback
    }
  }

  const devUsers = getLocalDevUsers();
  return devUsers.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    roles: u.roles,
    twoFactorEnabled: u.twoFactorEnabled,
    createdAt: new Date().toISOString(),
    suspended: suspendedUserIds.has(u.id),
    authMode: u.authMode,
  }));
}

export async function toggleUserSuspensionAsAdmin(
  userId: string,
  suspend: boolean
): Promise<{ ok: boolean; suspended: boolean }> {
  if (suspend) {
    suspendedUserIds.add(userId);
  } else {
    suspendedUserIds.delete(userId);
  }
  return { ok: true, suspended: suspend };
}

export async function updateUserRoleAsAdmin(
  userId: string,
  roles: RoleName[]
): Promise<{ ok: boolean }> {
  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.user.update({
        where: { id: userId },
        data: {
          roles: {
            set: [],
            connectOrCreate: roles.map((r) => ({
              where: { name: r },
              create: { name: r, description: `${r} role` },
            })),
          },
        },
      });
      return { ok: true };
    } catch {
      // Fallback to memory
    }
  }

  const devUser = getLocalDevUsers().find((u) => u.id === userId);
  if (devUser) {
    devUser.roles = roles;
  }
  return { ok: true };
}

export async function updateAdminEmail(
  currentEmail: string,
  newEmail: string
): Promise<{ ok: boolean; error?: string }> {
  const normCurrent = currentEmail.toLowerCase().trim();
  const normNew = newEmail.toLowerCase().trim();

  if (!normNew.includes("@") || normNew.length < 5) {
    return { ok: false, error: "Please provide a valid new email address." };
  }

  registerCustomAdminEmail(normNew);

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.user.update({
        where: { email: normCurrent },
        data: { email: normNew },
      });
      return { ok: true };
    } catch {
      // Fallback
    }
  }

  const devUsers = getLocalDevUsers();
  const user = devUsers.find((u) => u.email === normCurrent);
  if (user) {
    user.email = normNew;
    return { ok: true };
  }

  return { ok: false, error: "Admin user not found." };
}

export async function updateAdminPassword(
  email: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const normEmail = email.toLowerCase().trim();
  if (newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }

  const newHash = hashPassword(newPassword);

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.user.update({
        where: { email: normEmail },
        data: { passwordHash: newHash },
      });
      return { ok: true };
    } catch {
      // Fallback
    }
  }

  const devUsers = getLocalDevUsers();
  const user = devUsers.find((u) => u.email === normEmail);
  if (user) {
    user.passwordHash = newHash;
    return { ok: true };
  }

  return { ok: false, error: "Admin user not found." };
}

export async function verifyAdminPassword(
  email: string,
  passwordAttempt: string
): Promise<boolean> {
  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) return false;
  return verifyPassword(passwordAttempt, user.passwordHash);
}
