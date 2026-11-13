import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import * as OTPAuth from "otpauth";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = parts[1];
  const expectedHex = parts[2];
  if (!salt || !expectedHex) {
    return false;
  }
  const actualBuf = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedBuf = Buffer.from(expectedHex, "hex");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(actualBuf, expectedBuf);
}

export function createTotpInstance(secretBase32: string, accountEmail: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: "Baton",
    label: accountEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export function generateTotpSecret(accountEmail: string): {
  base32: string;
  uri: string;
} {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = createTotpInstance(secret.base32, accountEmail);
  return {
    base32: secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTotpCode(
  secretBase32: string,
  accountEmail: string,
  code: string
): boolean {
  const cleanCode = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanCode)) {
    return false;
  }
  const totp = createTotpInstance(secretBase32, accountEmail);
  const delta = totp.validate({ token: cleanCode, window: 1 });
  return delta !== null;
}

export function getCurrentTotpTokenForDev(
  secretBase32: string,
  accountEmail: string
): string {
  const totp = createTotpInstance(secretBase32, accountEmail);
  return totp.generate();
}
