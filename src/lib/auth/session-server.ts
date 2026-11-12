import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import type { AuthSession, RoleName } from "@/lib/auth/types";
import { auth0 } from "@/lib/auth0";

export async function getServerSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const session = await verifySessionToken(token);
    if (session) {
      return session;
    }
  }

  // If Auth0 is configured, check for Auth0 session
  if (auth0) {
    try {
      const auth0Session = await auth0.getSession();
      if (auth0Session?.user) {
        const user = auth0Session.user;
        const customRole = (user["https://trustmarketplace.com/role"] ||
          user.role ||
          "BUYER") as RoleName;
        const roles: RoleName[] = [customRole];
        return {
          userId: user.sub,
          email: user.email || user.name || "user@example.com",
          name: user.name || user.nickname || "Auth0 User",
          roles,
          twoFactorEnabled: true,
          twoFactorVerifiedAt: new Date().toISOString(),
          authMode: "auth0",
          isSampleAccount: false,
        };
      }
    } catch {
      // Auth0 session not available or unauthenticated
    }
  }

  return null;
}
