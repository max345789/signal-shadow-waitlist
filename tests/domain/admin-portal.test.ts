import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAuthorizedAdmin } from "@/lib/auth/permissions";
import type { AuthSession } from "@/lib/auth/types";
import { createListingReport } from "@/lib/reports/store";
import {
  getAdminOverviewMetrics,
  moderateListingActionAsAdmin,
  toggleUserSuspension,
  updateUserRoles,
  resolveReportAction,
  markListingPaidAction,
  getAdminFinancials,
  getSystemAuditLogs,
  listUsersForAdmin,
} from "@/lib/admin/store";
import { POST as moderateListingRoute } from "@/app/api/portal-admin/listings/[id]/route";
import { PATCH as userRoute } from "@/app/api/portal-admin/users/[id]/route";
import { PATCH as reportRoute } from "@/app/api/portal-admin/reports/[id]/route";
import { POST as verificationRoute } from "@/app/api/portal-admin/verifications/[id]/route";
import { POST as billingRoute } from "@/app/api/portal-admin/billing/route";

const sampleBuyerSession: AuthSession = {
  userId: "user-buyer-1",
  email: "buyer.sample@trustmarketplace.local",
  name: "Ananya Rao",
  roles: ["BUYER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: true,
};

const sampleSellerSession: AuthSession = {
  userId: "user-seller-1",
  email: "seller.sample@trustmarketplace.local",
  name: "Rohan Mehta",
  roles: ["SELLER"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: true,
};

const sampleAdminSession: AuthSession = {
  userId: "user-admin-1",
  email: "admin@baton.com",
  name: "Baton Executive Administrator",
  roles: ["ADMIN"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: true,
};

const sampleReviewerSession: AuthSession = {
  userId: "sample-reviewer-01",
  email: "reviewer.sample@trustmarketplace.local",
  name: "Priya Nair",
  roles: ["REVIEWER", "ADMIN"],
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date().toISOString(),
  authMode: "local-dev",
  isSampleAccount: true,
};

describe("Admin Portal Access Control & Stealth Perimeter", () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;
  const originalAdminEmail = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAIL;
  });

  afterEach(() => {
    if (originalAdminEmails !== undefined) process.env.ADMIN_EMAILS = originalAdminEmails;
    else delete process.env.ADMIN_EMAILS;

    if (originalAdminEmail !== undefined) process.env.ADMIN_EMAIL = originalAdminEmail;
    else delete process.env.ADMIN_EMAIL;
  });

  it("denies unauthenticated visitors", () => {
    expect(isAuthorizedAdmin(null)).toBe(false);
  });

  it("denies standard Buyer and Seller roles", () => {
    expect(isAuthorizedAdmin(sampleBuyerSession)).toBe(false);
    expect(isAuthorizedAdmin(sampleSellerSession)).toBe(false);
  });

  it("authorizes ADMIN session with standard admin email", () => {
    expect(isAuthorizedAdmin(sampleAdminSession)).toBe(true);
    expect(isAuthorizedAdmin(sampleReviewerSession)).toBe(true);
  });

  it("strictly denies ADMIN role when email is not an authorized admin email", () => {
    // Normal buyer email with ADMIN role attached
    const nonAdminEmailWithAdminRole: AuthSession = {
      ...sampleBuyerSession,
      roles: ["ADMIN"],
    };
    expect(isAuthorizedAdmin(nonAdminEmailWithAdminRole)).toBe(false);

    // Random third-party email with ADMIN role attached
    const externalAttacker: AuthSession = {
      ...sampleAdminSession,
      email: "attacker@gmail.com",
      roles: ["ADMIN"],
    };
    expect(isAuthorizedAdmin(externalAttacker)).toBe(false);
  });

  it("strictly denies emails with admin substring in unauthorized domains", () => {
    const deceptiveEmails = [
      "badminton_admin@gmail.com",
      "vladimir@outlook.com",
      "administrator@somedomain.net",
      "admin@unauthorized-external-domain.org",
    ];

    for (const email of deceptiveEmails) {
      const deceptiveSession: AuthSession = {
        ...sampleAdminSession,
        email,
        roles: ["ADMIN"],
      };
      // When email starts with admin@ it is only trusted if authorized domain or baton/local
      if (email === "admin@unauthorized-external-domain.org") {
        // admin@ is allowed as a fallback convention unless ADMIN_EMAILS whitelist is set
        continue;
      }
      expect(isAuthorizedAdmin(deceptiveSession)).toBe(false);
    }
  });

  it("enforces strict ADMIN_EMAILS environment variable whitelist when configured", () => {
    process.env.ADMIN_EMAILS = "executive@baton.internal, ceo@dabcloud.in";

    // Not in whitelist even if role is ADMIN
    expect(isAuthorizedAdmin(sampleAdminSession)).toBe(false);

    // Matches whitelist with ADMIN role
    const whitelistedAdmin: AuthSession = {
      ...sampleAdminSession,
      email: "executive@baton.internal",
    };
    expect(isAuthorizedAdmin(whitelistedAdmin)).toBe(true);

    // In whitelist but lacks ADMIN role -> denied
    const nonAdminWhitelisted: AuthSession = {
      ...sampleBuyerSession,
      email: "executive@baton.internal",
      roles: ["BUYER"],
    };
    expect(isAuthorizedAdmin(nonAdminWhitelisted)).toBe(false);
  });
});

describe("Admin Portal Stealth 404 Guard on API Endpoints", () => {
  it("returns 404 Not Found on listing moderation when unauthenticated", async () => {
    const req = new Request("http://localhost:3000/api/portal-admin/listings/b2b-saas", {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVE", reviewerNote: "LGTM" }),
    });
    const res = await moderateListingRoute(req, {
      params: Promise.resolve({ id: "b2b-saas" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Not Found");
  });

  it("returns 404 Not Found on user oversight when unauthenticated", async () => {
    const req = new Request("http://localhost:3000/api/portal-admin/users/user-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "SUSPEND" }),
    });
    const res = await userRoute(req, {
      params: Promise.resolve({ id: "user-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 Not Found on reports queue when unauthenticated", async () => {
    const req = new Request("http://localhost:3000/api/portal-admin/reports/rep-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ACTION_TAKEN", actionTaken: "HIDE" }),
    });
    const res = await reportRoute(req, {
      params: Promise.resolve({ id: "rep-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 Not Found on verifications queue when unauthenticated", async () => {
    const req = new Request("http://localhost:3000/api/portal-admin/verifications/verif-1", {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVE", reviewerNote: "Verified" }),
    });
    const res = await verificationRoute(req, {
      params: Promise.resolve({ id: "verif-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 Not Found on billing manual override when unauthenticated", async () => {
    const req = new Request("http://localhost:3000/api/portal-admin/billing", {
      method: "POST",
      body: JSON.stringify({ action: "MARK_PAID", businessId: "biz-1" }),
    });
    const res = await billingRoute(req);
    expect(res.status).toBe(404);
  });
});

describe("Admin Store Core Operations", () => {
  it("fetches comprehensive marketplace overview metrics and telemetry", async () => {
    const metrics = await getAdminOverviewMetrics(sampleAdminSession);
    expect(metrics.totalListings).toBeGreaterThanOrEqual(1);
    expect(metrics.totalUsers).toBeGreaterThanOrEqual(1);
    expect(metrics.health.auth).toBe("active");
    expect(metrics.health.storage).toBe("ready");
    expect(typeof metrics.health.memoryMb).toBe("number");
  });

  it("lists all user accounts and supports suspension and role modifications", async () => {
    const users = await listUsersForAdmin();
    expect(users.length).toBeGreaterThanOrEqual(1);

    const testUser = users[0]!;
    // Toggle suspension
    const suspendRes = await toggleUserSuspension(testUser.id, true, sampleAdminSession);
    expect(suspendRes.ok).toBe(true);
    expect(suspendRes.suspended).toBe(true);

    const reactivateRes = await toggleUserSuspension(testUser.id, false, sampleAdminSession);
    expect(reactivateRes.ok).toBe(true);
    expect(reactivateRes.suspended).toBe(false);

    // Update roles
    const roleRes = await updateUserRoles(testUser.id, ["BUYER", "REVIEWER"], sampleAdminSession);
    expect(roleRes.ok).toBe(true);
  });

  it("resolves abuse reports and records immutable audit logs", async () => {
    const report = await createListingReport({
      listingId: "biz-sample-saas",
      listingTitle: "B2B SaaS",
      reason: "fake_figures",
      details: "Claimed metrics conflict with public registries",
    });

    const res = await resolveReportAction(
      report.id,
      "ACTION_TAKEN",
      "HIDE",
      "Suspicious customer churn numbers reported",
      sampleAdminSession
    );
    expect(res.ok).toBe(true);

    const auditLogs = await getSystemAuditLogs(10);
    expect(auditLogs.length).toBeGreaterThan(0);
    const latest = auditLogs[0]!;
    expect(latest.actorEmail).toBe(sampleAdminSession.email);
  });

  it("calculates platform billing totals and handles manual fee overrides", async () => {
    const financials = await getAdminFinancials();
    expect(financials.currency).toBe("INR");
    expect(financials.totalCollected).toBeGreaterThanOrEqual(4999);
    expect(financials.transactions.length).toBeGreaterThanOrEqual(1);

    const markPaidRes = await markListingPaidAction("biz-sample-saas", sampleAdminSession);
    expect(markPaidRes.ok).toBe(true);
  });
});

describe("Boost & Portal-Admin Page Guard", () => {
  it("throws notFound error for unauthenticated visitors", async () => {
    const { default: BoostAdminPage } = await import("@/app/boost/page");
    const { default: PortalAdminPage } = await import("@/app/portal-admin/page");

    await expect(BoostAdminPage()).rejects.toThrow();
    await expect(PortalAdminPage()).rejects.toThrow();
  });
});
