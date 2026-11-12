import type { AuthSession, RoleName } from "@/lib/auth/types";

export type PermissionCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      code:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "TWO_FACTOR_REQUIRED"
        | "TWO_FACTOR_EXPIRED";
      reason: string;
    };

export function hasRole(session: AuthSession | null, role: RoleName): boolean {
  return Boolean(session?.roles.includes(role));
}

export function canCreateListing(session: AuthSession | null): PermissionCheckResult {
  if (!session) {
    return {
      allowed: false,
      code: "UNAUTHENTICATED",
      reason: "Sign in to create or edit a business listing.",
    };
  }
  if (!hasRole(session, "SELLER") && !hasRole(session, "ADMIN")) {
    return {
      allowed: false,
      code: "FORBIDDEN",
      reason: "A Seller or Admin role is required to create a listing.",
    };
  }
  return { allowed: true };
}

export function canManageBuyerThesis(session: AuthSession | null): PermissionCheckResult {
  if (!session) {
    return {
      allowed: false,
      code: "UNAUTHENTICATED",
      reason: "Sign in with a Buyer account to save theses and receive match alerts.",
    };
  }
  if (!hasRole(session, "BUYER") && !hasRole(session, "ADMIN")) {
    return {
      allowed: false,
      code: "FORBIDDEN",
      reason: "A Buyer or Admin role is required to save acquisition theses.",
    };
  }
  return { allowed: true };
}

export function canReviewAdminQueue(session: AuthSession | null): PermissionCheckResult {
  if (!session) {
    return {
      allowed: false,
      code: "UNAUTHENTICATED",
      reason: "Sign in with a reviewer account to view the review queue.",
    };
  }
  if (!hasRole(session, "ADMIN") && !hasRole(session, "REVIEWER")) {
    return {
      allowed: false,
      code: "FORBIDDEN",
      reason: "Admin or Reviewer access is required.",
    };
  }
  return { allowed: true };
}

const customRegisteredAdminEmails = new Set<string>();

export function registerCustomAdminEmail(email: string): void {
  customRegisteredAdminEmails.add(email.toLowerCase().trim());
}

export function isCustomAdminEmail(email: string): boolean {
  return customRegisteredAdminEmails.has(email.toLowerCase().trim());
}

/**
 * Strict Admin Portal Authorization Check:
 * Enforces both the `ADMIN` role AND an authorized admin email.
 * Unauthorized requests must receive a stealth 404 (notFound()) to prevent probe discovery.
 */
export function isAuthorizedAdmin(session: AuthSession | null): boolean {
  if (!session) return false;
  if (!session.roles.includes("ADMIN")) return false;

  const email = session.email.toLowerCase().trim();

  // If user changed admin email dynamically, it is explicitly trusted
  if (customRegisteredAdminEmails.has(email)) {
    return true;
  }

  const configuredAdminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .toLowerCase()
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (configuredAdminEmails.length > 0) {
    return configuredAdminEmails.includes(email);
  }

  // Fallback defaults for dev, testing, and production bootstrapping
  const isKnownAdminEmail =
    email === "thewyyc@gmail.com" ||
    email === "admin@baton.com" ||
    email === "admin.sample@trustmarketplace.local" ||
    email === "reviewer.sample@trustmarketplace.local" ||
    email.startsWith("admin@") ||
    email.startsWith("admin.") ||
    email.endsWith("@baton.internal") ||
    email.endsWith("@dabcloud.in");

  return isKnownAdminEmail;
}

/**
 * Section 7 Security Rule:
 * "mandatory 2FA for anyone entering a deal room."
 * Enforced on the server for every deal-room read and write.
 */
export function canEnterDealRoom(
  session: AuthSession | null,
  participants: { buyerUserId: string; sellerUserId: string },
  options?: { now?: Date; twoFactorMaxAgeHours?: number }
): PermissionCheckResult {
  if (!session) {
    return {
      allowed: false,
      code: "UNAUTHENTICATED",
      reason: "Sign in and verify two-factor authentication to enter a deal room.",
    };
  }

  const isBuyerParticipant =
    session.userId === participants.buyerUserId && hasRole(session, "BUYER");
  const isSellerParticipant =
    session.userId === participants.sellerUserId && hasRole(session, "SELLER");
  const isStaff = hasRole(session, "ADMIN") || hasRole(session, "REVIEWER");

  if (!isBuyerParticipant && !isSellerParticipant && !isStaff) {
    return {
      allowed: false,
      code: "FORBIDDEN",
      reason: "You are not an authorized participant in this deal room.",
    };
  }

  if (!session.twoFactorEnabled || !session.twoFactorVerifiedAt) {
    return {
      allowed: false,
      code: "TWO_FACTOR_REQUIRED",
      reason: "Two-factor authentication is mandatory before entering any deal room.",
    };
  }

  const verifiedAt = new Date(session.twoFactorVerifiedAt);
  if (Number.isNaN(verifiedAt.getTime())) {
    return {
      allowed: false,
      code: "TWO_FACTOR_REQUIRED",
      reason: "Valid two-factor verification timestamp is required.",
    };
  }

  const now = options?.now ?? new Date();
  const maxAgeMs = (options?.twoFactorMaxAgeHours ?? 12) * 60 * 60 * 1000;
  if (now.getTime() - verifiedAt.getTime() > maxAgeMs) {
    return {
      allowed: false,
      code: "TWO_FACTOR_EXPIRED",
      reason: "Your two-factor verification session has expired. Verify again to continue.",
    };
  }

  return { allowed: true };
}
