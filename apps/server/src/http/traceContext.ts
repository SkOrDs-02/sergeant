import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { als } from "../obs/requestContext.js";
import { getActiveTraceId } from "../obs/spans.js";

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
 *
 * Bridge with OpenTelemetry: коли OTel SDK активний (Phase 2 ініціативи 0004),
 * `instrumentation-http` уже спарсив `traceparent` і створив root-span до
 * того, як управління дійшло сюди. У цьому випадку ми беремо traceId з
 * активного OTel-context-у — це гарантує, що Pino-логи (через ALS) і
 * OTLP-spans мають один traceId. Якщо OTel не запущений — поведінка
 * fall-back-у незмінна (парсимо header власноруч або генеруємо новий ID).
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

  // 1) Якщо OTel SDK увімкнений і `instrumentation-http` уже стартував span —
  // беремо traceId звідти (canonical-source). Збігається з incoming
  // `traceparent`, але не вимагає повторного парсингу і не дрейфить, якщо
  // OTel вирішив трактувати `traceparent` інакше (наприклад, dropped flag).
  traceId = getActiveTraceId();

  if (!traceId) {
    const traceparent = req.headers["traceparent"];
    if (typeof traceparent === "string") {
      const m = TRACEPARENT_RE.exec(traceparent);
      if (m) traceId = m[1]!.toLowerCase();
    }
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
