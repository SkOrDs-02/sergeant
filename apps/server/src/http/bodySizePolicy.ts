import express, { type Express, type RequestHandler } from "express";

/**
 * Декларативна політика лімітів body-парсера.
 *
 * Контекст. Раніше у `app.ts` стояло ~14 inline-викликів
 * `app.use("/path", express.json({ limit: ... }))` — порядок mount-ів був
 * критичним (specific-shrут мусить mount-итись ДО глобального дефолтного,
 * бо Express bodyParser, що першим спрацює, виграє). Один zero-думаний
 * рефакторинг — і `/api/nutrition/analyze-photo` починає 413-итись на
 * легітимні 9MB upload-и. Цей файл — єдине джерело правди: усі ліміти
 * описані в `BODY_SIZE_POLICY`, а `applyBodySizePolicy(app)` сама
 * проставляє правильний порядок (longest-prefix-first), щоб руки
 * не плуталися.
 *
 * Контракт ESLint-rule `sergeant-design/no-inline-body-size-limit`
 * блокує `express.json({ limit })` / `express.raw({ ..., limit })` поза
 * цим файлом — щоб новий route не випадково отримав inline-mount, який
 * обходить policy і ламає specificity-order.
 */
export type BodySizeRule =
  | {
      readonly pathPrefix: string;
      readonly kind: "json";
      readonly limit: string;
      readonly reason: string;
      /**
       * Optional `Content-Type` filter (forwarded to `express.json({ type })`).
       * Дозволяє mount-ити кілька парсерів на однаковому шляху з різними
       * type-matcher-ами — як `/api/csp-report` (CSP-violation reports
       * приходять з нестандартними `application/csp-report` /
       * `application/reports+json`).
       */
      readonly type?: string;
      /**
       * If `true`, stashes the raw request bytes on `req.rawBody`. Needed
       * for downstream HMAC-signature verification (`/api/internal/*`).
       * Setting this on a sub-prefix that is shadowed by a more-specific
       * rule is a bug — the more-specific rule wins (longest-prefix-first
       * sort) and the raw bytes never get captured.
       */
      readonly captureRawBody?: boolean;
    }
  | {
      readonly pathPrefix: string;
      readonly kind: "raw";
      readonly limit: string;
      readonly reason: string;
      readonly type: string;
    };

/**
 * Один список — два призначення:
 *   1. `applyBodySizePolicy()` чітко проставляє mount-и у Express app.
 *   2. Тести читають той самий список, щоб перевірити, що жоден
 *      route не залишився без явного ліміту і що default-правило
 *      реально mount-иться останнім.
 *
 * Обчислені ліміти (schema-level max + запас під JSON-оверхед):
 *   nutrition/analyze-photo / refine-photo : 10mb (schema до ~7MB base64)
 *   nutrition/backup-upload                : 4mb  (internal cap 2.5MB)
 *   sync push/pull                         : 6mb  (MAX_BLOB_SIZE = 5MB)
 *   coach memory                           : 6mb  (той самий MAX_BLOB_SIZE)
 *   chat                                   : 1mb  (ChatRequestSchema active session)
 *   mono webhook                           : 32kb (Monobank payload)
 *   billing stripe-webhook                 : 128kb raw (Stripe-signature)
 *   csp-report                             : 16kb (Sentry CSP-ingest cap)
 *   metrics/web-vitals                     : 10kb (≤10 metrics × ~120B JSON)
 *   transcribe                             : 10mb raw audio
 *   default                                : 128kb (99% endpoint-ів <4KB JSON)
 */
export const BODY_SIZE_POLICY: ReadonlyArray<BodySizeRule> = [
  {
    pathPrefix: "/api/nutrition/analyze-photo",
    kind: "json",
    limit: "10mb",
    reason: "User photo upload (nutrition vision pipeline)",
  },
  {
    pathPrefix: "/api/nutrition/refine-photo",
    kind: "json",
    limit: "10mb",
    reason: "Photo refinement second-pass",
  },
  {
    pathPrefix: "/api/nutrition/backup-upload",
    kind: "json",
    limit: "4mb",
    reason: "Manual nutrition backup blob",
  },
  {
    pathPrefix: "/api/sync",
    kind: "json",
    limit: "6mb",
    reason: "CloudSync push/pull (MAX_BLOB_SIZE = 5MB)",
  },
  {
    pathPrefix: "/api/coach/memory",
    kind: "json",
    limit: "6mb",
    reason: "Coach long-term memory blob",
  },
  {
    pathPrefix: "/api/chat",
    kind: "json",
    limit: "1mb",
    reason: "ChatRequestSchema (context + 50 msg + 20 tool_results)",
  },
  {
    pathPrefix: "/api/mono/webhook",
    kind: "json",
    limit: "32kb",
    reason: "Monobank webhook payload",
  },
  {
    pathPrefix: "/api/internal",
    kind: "json",
    limit: "128kb",
    reason: "Machine-to-machine API (n8n workflows); rawBody for HMAC verify",
    captureRawBody: true,
  },
  {
    pathPrefix: "/api/billing/stripe-webhook",
    kind: "raw",
    limit: "128kb",
    reason: "Stripe webhook (signature verification on raw bytes)",
    type: "application/json",
  },
  {
    pathPrefix: "/api/metrics/web-vitals",
    kind: "json",
    limit: "10kb",
    reason: "Web-vitals beacon (≤10 metrics × ~120B JSON)",
  },
  {
    pathPrefix: "/api/csp-report",
    kind: "json",
    limit: "16kb",
    reason: "Legacy CSP report-uri (application/csp-report)",
    type: "application/csp-report",
  },
  {
    pathPrefix: "/api/csp-report",
    kind: "json",
    limit: "16kb",
    reason: "Modern Reporting-API (application/reports+json)",
    type: "application/reports+json",
  },
  {
    pathPrefix: "/api/csp-report",
    kind: "json",
    limit: "16kb",
    reason: "CSP report fallback (default content-type)",
  },
  {
    pathPrefix: "/api/transcribe",
    kind: "raw",
    limit: "10mb",
    reason: "Voice transcription (audio blob, not JSON)",
    type: "audio/*",
  },
  {
    pathPrefix: "/",
    kind: "json",
    limit: "128kb",
    reason: "Default API body cap — 99% endpoints exchange <4KB JSON",
  },
];

/**
 * Обираємо middleware-фабрику з config-rule. Винесено у helper, щоб
 * `applyBodySizePolicy` лишалась маленьким і щоб тестам було легко
 * перевірити маппінг rule → middleware-options без mount-у в Express.
 */
function buildMiddleware(rule: BodySizeRule): RequestHandler {
  if (rule.kind === "json") {
    const verify = rule.captureRawBody
      ? (req: import("express").Request, _res: unknown, buf: Buffer): void => {
          // Copy the buffer — body-parser reuses its internal Buffer between
          // requests, so holding a reference past parse-time can read into
          // another request's body. The cost is negligible (≤128KB for
          // /api/internal) and the safety is non-negotiable.
          (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
        }
      : undefined;
    const opts: Parameters<typeof express.json>[0] = { limit: rule.limit };
    if (rule.type !== undefined) opts.type = rule.type;
    if (verify !== undefined) opts.verify = verify;
    return express.json(opts);
  }
  return express.raw({ limit: rule.limit, type: rule.type });
}

/**
 * Mount-ить тіло-парсери у Express-app у порядку specificity-descending
 * (longest-prefix-first). Сортування стабільне — при однаковій довжині
 * prefix-у оригінальний порядок збережено (важливо для multi-parser
 * шляхів типу `/api/csp-report`, де три rule-и з різними `type`-матчерами).
 *
 * `express.json()` no-op-ить, якщо body вже розпарсений, тому
 * специфічний парсер виграє, а глобальний дефолтний (`/`) спокійно
 * mount-иться останнім без ризику зрізати legit-payload.
 */
export function applyBodySizePolicy(app: Express): void {
  const ordered = [...BODY_SIZE_POLICY].sort(
    (a, b) => b.pathPrefix.length - a.pathPrefix.length,
  );
  for (const rule of ordered) {
    app.use(rule.pathPrefix, buildMiddleware(rule));
  }
}
