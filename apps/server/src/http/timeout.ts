import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";
import { logger } from "../obs/logger.js";

/**
 * Request timeout middleware.
 *
 * Prevents zombie requests from consuming resources indefinitely.
 * Sends 408 Request Timeout if the request exceeds the configured timeout.
 *
 * Note: This uses res.setTimeout which affects the entire response lifecycle.
 * For streaming responses, individual handlers should manage their own timeouts.
 */
export function requestTimeout(timeoutMs?: number) {
  const timeout = timeoutMs ?? env.REQUEST_TIMEOUT_MS;

  if (timeout <= 0) {
    // Timeout disabled
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Track if response has already been sent
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;

      logger.warn({
        msg: "request_timeout",
        method: req.method,
        path: req.path,
        timeoutMs: timeout,
        requestId: req.id,
      });

      // Only send response if headers haven't been sent
      if (!res.headersSent) {
        res.status(408).json({
          error: "Request Timeout",
          message: "The request took too long to process",
          code: "REQUEST_TIMEOUT",
        });
      }

      // Destroy the request to free resources
      req.destroy();
    }, timeout);

    // Clear timeout when response finishes
    res.on("finish", () => {
      clearTimeout(timer);
    });

    res.on("close", () => {
      clearTimeout(timer);
    });

    // Prevent double-response if timeout fires during handler execution
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);

    res.json = function (body: unknown) {
      if (timedOut) return res;
      return originalJson(body);
    };

    res.send = function (body: unknown) {
      if (timedOut) return res;
      return originalSend(body);
    } as typeof res.send;

    res.end = function (...args: Parameters<typeof res.end>) {
      if (timedOut) return res;
      return originalEnd(...args);
    } as typeof res.end;

    next();
  };
}
