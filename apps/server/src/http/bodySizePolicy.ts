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
       * B28: `false` → body-parser НЕ розпаковує `Content-Encoding: gzip/
       * deflate/br` (такий запит отримує 415). Парсери стоять ДО
       * `requireSession`, тож стиснене тіло розпаковувалось би для
       * анонімів: `limit` рахується вже по розпакованому потоку (тобто
       * до 10mb CPU/RAM на запит без авторизації). Браузерні й наші
       * клієнти не стискають тіла запитів, тож для AI-роутів вимикаємо.
       */
      readonly inflate?: boolean;
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
      /**
       * B28: `false` → body-parser НЕ розпаковує `Content-Encoding: gzip/
       * deflate/br` (такий запит отримує 415). Парсери стоять ДО
       * `requireSession`, тож стиснене тіло розпаковувалось би для
       * анонімів: `limit` рахується вже по розпакованому потоку (тобто
       * до 10mb CPU/RAM на запит без авторизації). Браузерні й наші
       * клієнти не стискають тіла запитів, тож для AI-роутів вимикаємо.
       */
      readonly inflate?: boolean;
    }
  | {
      readonly pathPrefix: string;
      /**
       * `application/x-www-form-urlencoded` → `req.body` (`extended: false`,
       * тобто плоский обʼєкт рядків/масивів без `qs`-вкладеності). Mount-иться
       * ПОРУЧ із json-правилом на тому ж префіксі: кожен парсер реагує лише
       * на свій `Content-Type`, тож json-тіла його не зачіпають.
       */
      readonly kind: "urlencoded";
      readonly limit: string;
      readonly reason: string;
      /** B28/rel-04: `false` → gzip/deflate/br-тіло відхиляється з 415. */
      readonly inflate?: boolean;
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
 *   sync v1 push/pull + audit              : 6mb  (MAX_BLOB_SIZE = 5MB)
 *   sync v2 push/pull (/api/v2/sync)       : 6mb  (200 ops × 256KB row cap)
 *   coach memory                           : 6mb  (той самий MAX_BLOB_SIZE)
 *   chat                                   : 1mb  (ChatRequestSchema active session)
 *   mono webhook                           : 32kb (Monobank payload)
 *   billing stripe-webhook                 : 128kb raw (Stripe-signature)
 *   billing plata-charge / plata-status    : 128kb raw (monopay ECDSA X-Sign)
 *   csp-report                             : 16kb (Sentry CSP-ingest cap)
 *   metrics/web-vitals                     : 10kb (≤10 metrics × ~120B JSON)
 *   transcribe                             : 10mb raw audio
 *   default                                : 128kb (99% endpoint-ів <4KB JSON)
 */
export const BODY_SIZE_POLICY: ReadonlyArray<BodySizeRule> = [
  {
    pathPrefix: "/api/nutrition/analyze-photo",
    inflate: false,
    kind: "json",
    limit: "10mb",
    reason: "User photo upload (nutrition vision pipeline)",
  },
  {
    pathPrefix: "/api/nutrition/refine-photo",
    inflate: false,
    kind: "json",
    limit: "10mb",
    reason: "Photo refinement second-pass",
  },
  {
    pathPrefix: "/api/nutrition/backup-upload",
    inflate: false,
    kind: "json",
    limit: "4mb",
    reason: "Manual nutrition backup blob",
  },
  {
    pathPrefix: "/api/finyk/receipts/analyze",
    inflate: false,
    kind: "json",
    limit: "10mb",
    reason:
      "Фото чека base64 (vision, validateImageBase64 5MB × base64 ×1.37 + JSON) — дзеркало nutrition/analyze-photo; без entry дефолтні 128KB 413-лять легітимний upload ще в bodyParser (ревʼю PR #818)",
  },
  {
    pathPrefix: "/api/finyk/import/screenshot/analyze",
    inflate: false,
    kind: "json",
    limit: "10mb",
    reason:
      "Скрін банкінгу base64 (vision) — той самий клас payload-у, що /api/finyk/receipts/analyze",
  },
  {
    pathPrefix: "/api/finyk/import/statement/preview",
    inflate: false,
    kind: "json",
    limit: "10mb",
    reason:
      "csv_text до 5MB (IMPORT_STATEMENT_MAX_CSV_BYTES) АБО file_base64 — той самий 5MB-файл у base64 (×1.37) + JSON-конверт; 6mb різало б XLSX-виписку на межі ліміту ще в bodyParser",
  },
  {
    pathPrefix: "/api/finyk/import/commit",
    inflate: false,
    kind: "json",
    limit: "2mb",
    reason:
      "До IMPORT_COMMIT_MAX_ROWS draft-рядків (~150B/рядок) — з запасом над дефолтні 128KB",
  },
  {
    // AI-DANGER: це правило НЕ покриває `/api/v2/sync/*` — Express матчить
    // pathPrefix буквально, а `apiVersionRewrite` переписує лише `/api/v1/*`.
    // Живий sync-push сидить на `/api/v2/sync/push` і має власне правило
    // нижче. Прибереш його — push мовчки провалиться в дефолтні 128kb.
    pathPrefix: "/api/sync",
    inflate: false,
    kind: "json",
    limit: "6mb",
    reason:
      "CloudSync v1 push/pull + /api/sync/audit (MAX_BLOB_SIZE = 5MB). v2 — окреме правило /api/v2/sync",
  },
  {
    // Єдиний ЖИВИЙ sync-транспорт. Без цього рядка `/api/v2/sync/push`
    // потрапляв у дефолтні 128kb, хоча схема дозволяє
    // SYNC_V2_MAX_OPS_PER_PUSH × SYNC_V2_MAX_ROW_BYTES, а клієнт жене
    // батчами по 100 опів. Наслідок був не «помилка», а тиха втрата:
    // bodyParser віддавав 413 ДО хендлера, клієнтський push-loop трактує
    // будь-який throw як транзієнт і шле ВЕСЬ батч у markRetry, батч
    // дренеться детерміновано (ORDER BY id ASC), тож після
    // SYNC_OP_MAX_ATTEMPTS=10 усі рядки ставали dead_letter. Записане
    // офлайн не доїжджало на сервер ніколи й ніде не спливало.
    pathPrefix: "/api/v2/sync",
    inflate: false,
    kind: "json",
    limit: "6mb",
    reason:
      "sync v2 push: 200 ops × 256KB row cap (SYNC_V2_MAX_OPS_PER_PUSH / SYNC_V2_MAX_ROW_BYTES) — дзеркалить ліміт v1",
  },
  {
    pathPrefix: "/api/coach/memory",
    inflate: false,
    kind: "json",
    limit: "6mb",
    reason: "Coach long-term memory blob",
  },
  {
    pathPrefix: "/api/chat",
    inflate: false,
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
    pathPrefix: "/api/billing/liqpay-callback",
    kind: "raw",
    limit: "128kb",
    reason: "LiqPay callback (sha1 signature over form `data` field)",
    type: "application/x-www-form-urlencoded",
  },
  {
    pathPrefix: "/api/billing/plata-charge",
    kind: "raw",
    limit: "128kb",
    reason: "Plata/monopay charge webhook (ECDSA X-Sign over raw body)",
    type: "application/json",
  },
  {
    pathPrefix: "/api/billing/plata-status",
    kind: "raw",
    limit: "128kb",
    reason: "Plata/monopay status webhook (ECDSA X-Sign over raw body)",
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
    inflate: false,
    kind: "raw",
    limit: "10mb",
    reason: "Voice transcription (audio blob, not JSON)",
    type: "audio/*",
  },
  {
    // sec-11: Better Auth `/sign-in/email` і OAuth-колбеки приймають
    // `application/x-www-form-urlencoded`. Без цього парсера `req.body`
    // для form-тіла порожній, і `authAccountRateLimit` (ключ = email із
    // `req.body`) пропускав запит повз бакет — обхід per-account ліміту
    // зміною Content-Type. Тіло після парсингу Better Auth дістає з
    // `req.body` (better-call повторно серіалізує його у форму), тож
    // Apple `response_mode=form_post` на `/api/auth/callback/apple`
    // працює без змін.
    pathPrefix: "/api/auth",
    inflate: false,
    kind: "urlencoded",
    limit: "16kb",
    reason:
      "Better Auth form-тіла (sign-in/sign-up, OAuth form_post callback): email мусить бути в req.body до per-account rate-limit",
  },
  {
    pathPrefix: "/",
    inflate: false,
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
  if (rule.kind === "urlencoded") {
    const urlOpts: Parameters<typeof express.urlencoded>[0] = {
      extended: false,
      limit: rule.limit,
    };
    if (rule.inflate !== undefined) urlOpts.inflate = rule.inflate;
    return express.urlencoded(urlOpts);
  }
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
    if (rule.inflate !== undefined) opts.inflate = rule.inflate;
    if (rule.type !== undefined) opts.type = rule.type;
    if (verify !== undefined) opts.verify = verify;
    return express.json(opts);
  }
  const rawOpts: Parameters<typeof express.raw>[0] = {
    limit: rule.limit,
    type: rule.type,
  };
  if (rule.inflate !== undefined) rawOpts.inflate = rule.inflate;
  return express.raw(rawOpts);
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
