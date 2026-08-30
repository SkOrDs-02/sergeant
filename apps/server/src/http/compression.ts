import compression from "compression";
import type { Request, Response } from "express";
import { env } from "../env.js";

/**
 * Response compression middleware.
 *
 * Features:
 * - Gzip/Brotli compression for text-based responses
 * - Skips small responses (< 1KB)
 * - Skips streaming responses (Server-Sent Events)
 * - Configurable via COMPRESSION_ENABLED env var
 */
export function createCompressionMiddleware() {
  if (!env.COMPRESSION_ENABLED) {
    // Return no-op middleware if compression is disabled
    return (_req: Request, _res: Response, next: () => void) => next();
  }

  return compression({
    // Only compress responses larger than 1KB
    threshold: 1024,

    // Compression level (1-9, higher = more compression but slower)
    // 6 is a good balance between speed and compression ratio
    level: 6,

    // Filter function to decide what to compress
    filter: (req: Request, res: Response) => {
      // Don't compress Server-Sent Events. This MUST key off the RESPONSE
      // Content-Type, not the request `Accept` header (incident B34): the
      // api-client always sends `Accept: application/json` — including for
      // the streaming call, which goes through `http.raw`
      // (packages/api-client/src/httpClient.ts JSON_MIME) — so a
      // request-side-only check never matches. With that guard dead,
      // `compression.filter()` saw a `text/event-stream` response, treated
      // it as compressible (matches `^text/`), and gzip buffered the whole
      // stream past the 1KB threshold: first token delayed, and the
      // keep-alive `: ping` heartbeat comments (emitted every 15s
      // specifically to keep idle proxies/load-balancers from timing the
      // connection out) got stuck in the gzip buffer too — defeating the
      // exact protection they exist for.
      const contentType = res.getHeader("Content-Type");
      if (
        typeof contentType === "string" &&
        contentType.includes("text/event-stream")
      ) {
        return false;
      }

      // Keep the request-header check too — harmless, and covers any
      // client that DOES send a correct `Accept: text/event-stream`. Not
      // the one that must work, though: see above.
      if (req.headers.accept === "text/event-stream") {
        return false;
      }

      // Don't compress if client doesn't accept compression
      const acceptEncoding = req.headers["accept-encoding"];
      if (!acceptEncoding) {
        return false;
      }

      // Use default compression filter for everything else
      return compression.filter(req, res);
    },
  });
}
