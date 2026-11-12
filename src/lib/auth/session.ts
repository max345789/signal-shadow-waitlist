import { SignJWT, jwtVerify } from "jose";
import type { AuthSession, RoleName } from "@/lib/auth/types";

export const SESSION_COOKIE_NAME = "tm_session";
const DEV_FALLBACK_SECRET = "local-dev-ephemeral-secret-not-for-production-use-01";

function getSecretString(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET environment variable (>= 32 chars) is required in production.");
  }
  return DEV_FALLBACK_SECRET;
}

async function getHmacKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(getSecretString());
  return globalThis.crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSessionToken(session: AuthSession): Promise<string> {
  const key = await getHmacKey();
  return new SignJWT({
    email: session.email,
    name: session.name,
    roles: session.roles,
    twoFactorEnabled: session.twoFactorEnabled,
    twoFactorVerifiedAt: session.twoFactorVerifiedAt,
    authMode: session.authMode,
    isSampleAccount: session.isSampleAccount,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key);
}

export async function verifySessionToken(token: string): Promise<AuthSession | null> {
  try {
    const key = await getHmacKey();
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    const roles = Array.isArray(payload.roles)
      ? (payload.roles.filter((r): r is RoleName =>
          r === "BUYER" || r === "SELLER" || r === "ADMIN" || r === "REVIEWER"
        ))
      : [];
    return {
      userId: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      roles,
      twoFactorEnabled: Boolean(payload.twoFactorEnabled),
      twoFactorVerifiedAt:
        typeof payload.twoFactorVerifiedAt === "string"
          ? payload.twoFactorVerifiedAt
          : null,
      authMode: payload.authMode === "database" ? "database" : "local-dev",
      isSampleAccount: Boolean(payload.isSampleAccount),
    };
  } catch {
    return null;
  }
}
