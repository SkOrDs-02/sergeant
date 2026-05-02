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
      // Don't compress Server-Sent Events
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
