import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { als } from "../obs/requestContext.js";

/**
 * W3C Trace Context (traceparent): 00-<32hex traceId>-<16hex spanId>-<2hex flags>
 * https://www.w3.org/TR/trace-context/
 */
const TRACEPARENT_RE = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i;

/**
 * Reads the incoming W3C `traceparent` header or `x-trace-id` fallback,
 * injects the trace ID into the ALS store, and echoes it back in the response
 * as `X-Trace-Id`.
 *
 * Must run AFTER `withRequestContext` so the ALS store already exists.
 */
export function traceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const store = als.getStore();
  if (!store) {
    next();
    return;
  }

  let traceId: string | null = null;

  const traceparent = req.headers["traceparent"];
  if (typeof traceparent === "string") {
    const m = TRACEPARENT_RE.exec(traceparent);
    if (m) traceId = m[1].toLowerCase();
  }

  if (!traceId) {
    const xTrace = req.headers["x-trace-id"];
    if (typeof xTrace === "string" && /^[0-9a-f]{32}$/i.test(xTrace)) {
      traceId = xTrace.toLowerCase();
    }
  }

  if (!traceId) {
    traceId = randomUUID().replace(/-/g, "");
  }

  store.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);
  next();
}
