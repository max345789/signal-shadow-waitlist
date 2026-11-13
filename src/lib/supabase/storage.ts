import { getAdminSupabaseClient } from "./admin";
import { getSupabaseStorageBucket } from "./config";

export interface UploadFileOptions {
  bucket?: string;
  path: string;
  fileBuffer: Buffer | Uint8Array;
  contentType: string;
  upsert?: boolean;
}

export interface StorageUploadResult {
  ok: boolean;
  path?: string;
  error?: string;
}

export interface SignedUrlResult {
  ok: boolean;
  signedUrl?: string;
  error?: string;
}

/**
 * Ensures the deal-vault bucket exists in Supabase Storage.
 */
export async function ensureStorageBucket(bucketName?: string): Promise<boolean> {
  const admin = getAdminSupabaseClient();
  if (!admin) return false;

  const targetBucket = bucketName || getSupabaseStorageBucket();

  try {
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) {
      console.error("[Supabase Storage] List buckets error:", error.message);
      return false;
    }

    const exists = buckets.some((b) => b.name === targetBucket);
    if (!exists) {
      const { error: createError } = await admin.storage.createBucket(targetBucket, {
        public: false, // Private bucket with signed URLs for confidential documents
        fileSizeLimit: 25 * 1024 * 1024, // 25 MB limit
      });
      if (createError) {
        console.error("[Supabase Storage] Create bucket error:", createError.message);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error("[Supabase Storage] Bucket initialization error:", err);
    return false;
  }
}

/**
 * Uploads a document or asset to Supabase Storage.
 */
export async function uploadDocumentToStorage({
  bucket,
  path,
  fileBuffer,
  contentType,
  upsert = false,
}: UploadFileOptions): Promise<StorageUploadResult> {
  const admin = getAdminSupabaseClient();
  if (!admin) {
    return { ok: false, error: "Supabase admin client not configured" };
  }

  const targetBucket = bucket || getSupabaseStorageBucket();

  try {
    const { data, error } = await admin.storage
      .from(targetBucket)
      .upload(path, fileBuffer, {
        contentType,
        upsert,
      });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, path: data.path };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Storage upload exception" };
  }
}

/**
 * Generates a time-limited signed URL for authorized document downloads.
 */
export async function createSignedDownloadUrl(
  path: string,
  expiresInSeconds = 300,
  bucket?: string
): Promise<SignedUrlResult> {
  const admin = getAdminSupabaseClient();
  if (!admin) {
    return { ok: false, error: "Supabase admin client not configured" };
  }

  const targetBucket = bucket || getSupabaseStorageBucket();

  try {
    const { data, error } = await admin.storage
      .from(targetBucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, signedUrl: data.signedUrl };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Signed URL exception" };
  }
}

/**
 * Deletes a file from Supabase Storage.
 */
export async function deleteDocumentFromStorage(
  paths: string[],
  bucket?: string
): Promise<boolean> {
  const admin = getAdminSupabaseClient();
  if (!admin) return false;

  const targetBucket = bucket || getSupabaseStorageBucket();

  try {
    const { error } = await admin.storage.from(targetBucket).remove(paths);
    return !error;
  } catch {
    return false;
  }
}
