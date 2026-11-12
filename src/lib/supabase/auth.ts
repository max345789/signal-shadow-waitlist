import { createServerSupabaseClient } from "./server";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/db/prisma";
import type { AuthSession, RoleName } from "@/lib/auth/types";

/**
 * Resolves the authenticated user from Supabase Auth and returns a Baton AuthSession.
 */
export async function getSupabaseAuthSession(): Promise<AuthSession | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const email = user.email;
    if (!email) return null;

    const normalizedEmail = email.toLowerCase().trim();
    const envAdminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
      .toLowerCase()
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    const isAdminEmail =
      envAdminEmails.length > 0
        ? envAdminEmails.includes(normalizedEmail)
        : normalizedEmail === "admin@baton.com" ||
          normalizedEmail === "admin.sample@trustmarketplace.local" ||
          normalizedEmail === "reviewer.sample@trustmarketplace.local" ||
          normalizedEmail.startsWith("admin@") ||
          normalizedEmail.startsWith("admin.") ||
          normalizedEmail.endsWith("@baton.internal") ||
          normalizedEmail.endsWith("@dabcloud.in");

    // If database is configured, load or synchronize with User table
    if (isDatabaseConfigured()) {
      const prisma = getPrismaClient();
      let dbUser = await prisma.user.findUnique({
        where: { email },
        include: { roles: true },
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            email,
            name:
              user.user_metadata?.name ||
              user.user_metadata?.full_name ||
              email.split("@")[0] ||
              "User",
            oauthProvider: user.app_metadata?.provider || "supabase",
            oauthSubject: user.id,
            roles: {
              connectOrCreate: {
                where: { name: isAdminEmail ? "ADMIN" : "BUYER" },
                create: {
                  name: isAdminEmail ? "ADMIN" : "BUYER",
                  description: isAdminEmail ? "Administrator account" : "Standard buyer account",
                },
              },
            },
          },
          include: { roles: true },
        });
      } else if (isAdminEmail && !dbUser.roles.some((r) => r.name === "ADMIN")) {
        // Automatically grant ADMIN role to authorized admin email
        dbUser = await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            roles: {
              connectOrCreate: {
                where: { name: "ADMIN" },
                create: {
                  name: "ADMIN",
                  description: "Administrator account",
                },
              },
            },
          },
          include: { roles: true },
        });
      }

      if (!dbUser) return null;

      return {
        userId: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        roles: dbUser.roles.map((r) => r.name as RoleName),
        twoFactorEnabled: dbUser.twoFactorEnabled,
        twoFactorVerifiedAt: dbUser.twoFactorVerifiedAt
          ? dbUser.twoFactorVerifiedAt.toISOString()
          : null,
        authMode: "supabase",
        isSampleAccount: false,
      };
    }

    // Fallback when running without a primary DB: create lightweight session from Supabase claims
    const defaultRoles: RoleName[] = isAdminEmail ? ["ADMIN"] : ["BUYER"];
    const roles: RoleName[] = (user.app_metadata?.roles as RoleName[]) || defaultRoles;

    return {
      userId: user.id,
      email,
      name:
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        email.split("@")[0] ||
        "User",
      roles,
      twoFactorEnabled: true,
      twoFactorVerifiedAt: user.created_at,
      authMode: "supabase",
      isSampleAccount: false,
    };
  } catch (err) {
    console.error("[Supabase Auth] Session resolution error:", err);
    return null;
  }
}
