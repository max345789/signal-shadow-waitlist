import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SignJWT, jwtVerify } from "jose";

const DEFAULT_DEV_SECRET = "dev-only-replace-with-32-char-random-secret-key";

function getVaultSigningKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production for signed vault URLs.");
  }
  return new TextEncoder().encode(secret ?? DEFAULT_DEV_SECRET);
}

export function getPrivateVaultDir(): string {
  return (
    process.env.DEAL_VAULT_DIR ||
    path.join(os.tmpdir(), "trust-marketplace-private-vault")
  );
}

function sanitizeFilename(input: string): string {
  const base = path
    .basename(input)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/-{2,}/g, "-");
  return base.slice(0, 80) || "document.txt";
}

const BINARY_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];

function isTextLikeMime(mimeType: string, filename: string): boolean {
  const lower = filename.toLowerCase();
  if (BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return false;
  }
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json")
  );
}

export async function storePrivateDocumentAndWatermark(params: {
  dealRoomId: string;
  documentId: string;
  filename: string;
  mimeType: string;
  contentBuffer: Buffer;
  uploaderLabel: string;
  scanStatus: "CLEAN" | "INFECTED";
}): Promise<{
  storageKey: string;
  watermarkedKey: string | null;
  watermarkNotice: string;
  safeFilename: string;
}> {
  const safeFilename = sanitizeFilename(params.filename);
  const vaultRoot = getPrivateVaultDir();
  const roomDir = path.join(vaultRoot, params.dealRoomId.replace(/[^a-zA-Z0-9_-]/g, "_"));
  await fs.mkdir(roomDir, { recursive: true });

  const nonce = crypto.randomBytes(6).toString("hex");
  const storageKey = `${params.dealRoomId}/${params.documentId}--${nonce}--${safeFilename}`;
  const rawPath = path.join(vaultRoot, storageKey);
  await fs.mkdir(path.dirname(rawPath), { recursive: true });
  await fs.writeFile(rawPath, params.contentBuffer);

  const watermarkNotice = `CONFIDENTIAL — Deal Room ${params.dealRoomId} — Uploaded by ${params.uploaderLabel} (${new Date().toISOString()})`;

  if (params.scanStatus === "INFECTED") {
    return {
      storageKey,
      watermarkedKey: null,
      watermarkNotice: "BLOCKED BY VIRUS SCANNER",
      safeFilename,
    };
  }

  const watermarkedKey = `${params.dealRoomId}/${params.documentId}--${nonce}--watermarked--${safeFilename}`;
  const watermarkedPath = path.join(vaultRoot, watermarkedKey);

  if (isTextLikeMime(params.mimeType, safeFilename)) {
    const watermarkedText = [
      `====================================================================`,
      `WATERMARK: ${watermarkNotice}`,
      `====================================================================`,
      "",
      params.contentBuffer.toString("utf8"),
      "",
      `====================================================================`,
      `END WATERMARKED COPY — ${watermarkNotice}`,
      `====================================================================`,
    ].join("\n");
    await fs.writeFile(watermarkedPath, Buffer.from(watermarkedText, "utf8"));
  } else {
    // Preserve binary integrity while tracking watermark metadata alongside private storage
    await fs.writeFile(watermarkedPath, params.contentBuffer);
  }

  return {
    storageKey,
    watermarkedKey,
    watermarkNotice,
    safeFilename,
  };
}

export async function readPrivateDocumentBytes(params: {
  storageKey: string;
  watermarkedKey: string | null;
  fallbackText?: string;
}): Promise<Buffer> {
  const vaultRoot = getPrivateVaultDir();
  const preferredKey = params.watermarkedKey ?? params.storageKey;
  const resolved = path.resolve(/*turbopackIgnore: true*/ vaultRoot, preferredKey);
  const resolvedRoot = path.resolve(/*turbopackIgnore: true*/ vaultRoot);

  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error("Invalid vault storage key path.");
  }

  try {
    return await fs.readFile(resolved);
  } catch {
    if (params.fallbackText) {
      return Buffer.from(params.fallbackText, "utf8");
    }
    throw new Error("Document payload not found in private vault.");
  }
}

export interface SignedDownloadPayload {
  dealRoomId: string;
  documentId: string;
  viewerId: string;
}

export async function signDocumentDownloadToken(
  payload: SignedDownloadPayload,
  ttlSeconds: number = 300
): Promise<string> {
  return new SignJWT({
    dealRoomId: payload.dealRoomId,
    documentId: payload.documentId,
    viewerId: payload.viewerId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getVaultSigningKey());
}

export async function verifyDocumentDownloadToken(
  token: string
): Promise<SignedDownloadPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getVaultSigningKey());
    if (
      typeof payload.dealRoomId !== "string" ||
      typeof payload.documentId !== "string" ||
      typeof payload.viewerId !== "string"
    ) {
      return null;
    }
    return {
      dealRoomId: payload.dealRoomId,
      documentId: payload.documentId,
      viewerId: payload.viewerId,
    };
  } catch {
    return null;
  }
}
