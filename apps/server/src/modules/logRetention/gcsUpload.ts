/**
 * Thin GCS-upload helper for the log-retention archiver.
 *
 * We avoid `@google-cloud/storage` (which would pull ~5 MB of transitive
 * deps) and instead drive the JSON upload API directly. Auth comes from
 * `google-auth-library`, which is already a dep for FCM (see
 * `apps/server/src/push/fcmClient.ts`).
 *
 * Contract:
 *   - `uploadGzippedJsonl({ bucket, objectName, gzippedBody })` resolves
 *     when the upload succeeds (HTTP 2xx). On any non-2xx or network
 *     error, rejects with the underlying error — the archiver maps this
 *     to a Sentry warning and skips the DELETE for that batch.
 *   - The body must already be gzipped; we set `Content-Encoding: gzip`
 *     so GCS stores the compressed bytes verbatim (no double-compression
 *     by GCS / no transcoding on download).
 *
 * Tests inject `fetchImpl` + `getAccessToken` to avoid hitting the real
 * GCS API. In production, `getAccessToken` lazily constructs a
 * `GoogleAuth` client; the module never crashes at import time even if
 * the environment lacks GCP credentials.
 */

import { GoogleAuth } from "google-auth-library";

/** Resource scope required to upload to a GCS bucket. */
const GCS_WRITE_SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";

export interface GcsUploadOptions {
  /** Target GCS bucket. */
  bucket: string;
  /** Object name (path inside the bucket). */
  objectName: string;
  /** Pre-gzipped JSONL payload. */
  gzippedBody: Buffer;
}

export interface GcsUploadDeps {
  /** Resolves to a bearer token for `Authorization: Bearer …`. */
  getAccessToken: () => Promise<string>;
  /** `fetch`-compatible function. Default `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Cached `GoogleAuth` instance — constructing one per upload is wasteful
 * (it does GCE metadata lookups / file reads on first call). Module-level
 * cache is safe because we always request the same scope.
 */
let cachedAuth: GoogleAuth | null = null;

function defaultGoogleAuth(): GoogleAuth {
  if (!cachedAuth) {
    cachedAuth = new GoogleAuth({ scopes: [GCS_WRITE_SCOPE] });
  }
  return cachedAuth;
}

/**
 * Production access-token getter. Lazily wires GoogleAuth so that boxes
 * without GCP credentials never crash at module import.
 */
export async function defaultGetAccessToken(): Promise<string> {
  const auth = defaultGoogleAuth();
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error(
      "GoogleAuth.getAccessToken returned empty token (check GOOGLE_APPLICATION_CREDENTIALS)",
    );
  }
  return token.token;
}

/**
 * Upload a single object to GCS. Designed for small-to-medium batches
 * (a few MB) — for larger files we'd switch to the resumable upload API,
 * but the archiver caps each batch at `LOG_ARCHIVE_BATCH_SIZE` rows
 * (default 1000), which keeps payloads well under the simple-upload
 * 5 MB sweet spot.
 */
export async function uploadGzippedJsonl(
  options: GcsUploadOptions,
  deps: GcsUploadDeps,
): Promise<void> {
  const { bucket, objectName, gzippedBody } = options;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const token = await deps.getAccessToken();
  const url =
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-ndjson",
      "Content-Encoding": "gzip",
    },
    body: gzippedBody,
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "<unreadable>");
    throw new Error(
      `GCS upload failed: ${response.status} ${response.statusText} — ${errorBody.slice(0, 200)}`,
    );
  }
}
