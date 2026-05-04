import { createHash } from "node:crypto";

import type { Pool } from "pg";

import {
  enqueueFtuxDripMail,
  registerFtuxDripDispatcher,
  type FtuxDripJobData,
} from "../lib/jobs/ftuxDrip.js";
import { logger } from "../obs/logger.js";
import { ftuxDripJobsProcessedTotal } from "../obs/metrics.js";
import {
  buildFtuxDripTemplate,
  FTUX_DRIP_CAMPAIGN_FAMILY,
  FTUX_DRIP_CAMPAIGN_KEY,
  FTUX_DRIP_DELAY_MS,
  type FtuxDripDay,
} from "./ftuxDripCopy.js";
import {
  buildUnsubscribeUrl,
  signUnsubscribeToken,
} from "./ftuxUnsubscribeToken.js";

/**
 * FTUX-drip-листи (Day 0 / 1 / 3) через Resend HTTP API.
 *
 * Контракт із chunk-ом auth-mail:
 *   - durable BullMQ-черга `ftux-drip` із 3-ма job-name-ами
 *     (`day_0`, `day_1`, `day_3`); Day 1 з delay 24h, Day 3 з 72h.
 *   - Без `REDIS_URL` — Day 0 шлеться синхронно (in-process), Day 1 + 3
 *     ПРОПУСКАЮТЬСЯ із warn-логом. Це навмисно: у нас нема in-memory
 *     persistence для 3-денних delayed-job-ів, а fake-setTimeout-чергу
 *     ми будувати не будемо (рестарт процесу вб'є її).
 *
 * Idempotency:
 *   - `email_unsubscribes` (user_id, campaign_family) — opt-out перевіряється
 *     ПЕРЕД send-ом. Якщо є запис — skip.
 *   - `email_campaigns_log` (campaign_key, recipient_id) UNIQUE — INSERT з
 *     ON CONFLICT DO NOTHING. Якщо row вже є — лист не шлеться (не плодимо
 *     дублікатів через retry-и BullMQ або race у concurrent-deploy-ах).
 *   - Перевірка `user`-ряду перед send-ом: якщо юзера видалено між Day 0
 *     та Day 3 (cascade), drip-job помічається `skipped_user_deleted`.
 *
 * Спостережуваність:
 *   - Метрики `ftux_drip_jobs_processed_total{outcome,day}` + duration.
 *   - Лог-event `ftux_drip_email_sent` після успішного send-у з email-hash-ем
 *     (без plaintext PII), `email_campaigns_log.id` і Resend message-id.
 *
 * PostHog server-side capture (`email_sent`) свідомо ВИНЕСЕНИЙ у follow-up
 * PR — потребує окремого Project API key, який не у тому ж env-обʼєкті, що
 * фронтовий `VITE_POSTHOG_KEY`.
 */

const FTUX_DRIP_LOOKUP_USER_QUERY = `
  SELECT id, email, name
  FROM "user"
  WHERE id = $1
  LIMIT 1
`;

const FTUX_DRIP_OPTOUT_QUERY = `
  SELECT 1
  FROM email_unsubscribes
  WHERE user_id = $1 AND campaign_family = $2
  LIMIT 1
`;

const FTUX_DRIP_INSERT_LOG_QUERY = `
  INSERT INTO email_campaigns_log (
    campaign_key, recipient_id, recipient_email_hash,
    provider, provider_message_id, variant, raw
  ) VALUES ($1, $2, $3, 'resend', $4, $5, $6::jsonb)
  ON CONFLICT (campaign_key, recipient_id) DO NOTHING
  RETURNING id
`;

interface UserRow {
  id: string;
  email: string;
  name: string | null;
}

function emailFingerprint(email: string): string {
  return createHash("sha256")
    .update(email.toLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 12);
}

function isDeployedProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RAILWAY_SERVICE_NAME)
  );
}

function getAppUrl(): string {
  const candidates = [
    process.env.PUBLIC_APP_URL,
    process.env.VITE_PUBLIC_APP_URL,
    process.env.WEB_APP_URL,
    process.env.BETTER_AUTH_URL,
  ];
  for (const c of candidates) {
    const trimmed = c?.trim();
    if (trimmed) return trimmed.replace(/\/+$/, "");
  }
  return "https://app.sergeant.fit";
}

interface FtuxDripDispatcherDeps {
  pool: Pool;
}

let dispatcherDeps: FtuxDripDispatcherDeps | null = null;

/**
 * Реєструє Postgres pool, потрібний для opt-out + idempotency-перевірок.
 * Викликається з `index.ts` під час bootstrap-у — до того моменту job-и
 * у будь-якому випадку не процесяться (worker не стартував).
 */
export function configureFtuxDripDispatcher(
  deps: FtuxDripDispatcherDeps,
): void {
  dispatcherDeps = deps;
}

async function fetchUserRow(
  pool: Pool,
  userId: string,
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(FTUX_DRIP_LOOKUP_USER_QUERY, [
    userId,
  ]);
  return result.rows[0] ?? null;
}

async function isOptedOut(pool: Pool, userId: string): Promise<boolean> {
  const result = await pool.query<{ "?column?": number }>(
    FTUX_DRIP_OPTOUT_QUERY,
    [userId, FTUX_DRIP_CAMPAIGN_FAMILY],
  );
  return result.rows.length > 0;
}

async function reserveLogRow(
  pool: Pool,
  args: {
    campaignKey: string;
    recipientId: string;
    emailHash: string;
    providerMessageId: string | null;
    variant: string | null;
    raw: Record<string, unknown>;
  },
): Promise<{ id: number; isNew: boolean }> {
  const result = await pool.query<{ id: string }>(FTUX_DRIP_INSERT_LOG_QUERY, [
    args.campaignKey,
    args.recipientId,
    args.emailHash,
    args.providerMessageId,
    args.variant,
    JSON.stringify(args.raw),
  ]);
  // ON CONFLICT DO NOTHING → no row returned. Це означає, що лист уже був
  // зареєстрований раніше — caller повинен skip.
  if (result.rows.length === 0) {
    return { id: 0, isNew: false };
  }
  const id = Number(result.rows[0]?.id ?? 0);
  return { id, isNew: true };
}

/**
 * Update запису `email_campaigns_log` після успішного send-у — підтягує
 * provider_message_id (Resend `id`), яким ми потім крос-референсимо
 * webhook-події у `email_events`.
 */
async function updateLogWithProvider(
  pool: Pool,
  args: { id: number; providerMessageId: string },
): Promise<void> {
  if (!args.id) return;
  await pool.query(
    `UPDATE email_campaigns_log
       SET provider_message_id = $2
     WHERE id = $1
       AND provider_message_id IS NULL`,
    [args.id, args.providerMessageId],
  );
}

interface ResendCreateEmailResponse {
  id?: string;
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ providerMessageId: string | null }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (isDeployedProduction()) {
      logger.warn({
        msg: "ftux_drip_email_skipped_no_provider",
        emailHash: emailFingerprint(args.to),
      });
    } else {
      logger.info({
        msg: "ftux_drip_email_skipped_dev_no_resend",
        emailHash: emailFingerprint(args.to),
      });
    }
    return { providerMessageId: null };
  }

  const from =
    process.env.RESEND_FROM?.trim() || "Sergeant <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      html: args.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res
    .json()
    .catch(() => null)) as ResendCreateEmailResponse | null;
  return { providerMessageId: json?.id ?? null };
}

/**
 * Skip-маркер. Кидаємо його з dispatcher-а, щоб worker зміг визначити
 * outcome без помилок-як-control-flow в обличчя BullMQ. Worker-side
 * (`processFtuxDripJob`) розпізнає інстанс і ставить outcome у відповідну
 * категорію (`skipped_optout` / `skipped_already_sent` / `skipped_user_deleted`).
 */
export class FtuxDripSkip extends Error {
  readonly outcome:
    | "skipped_optout"
    | "skipped_already_sent"
    | "skipped_user_deleted";
  constructor(outcome: FtuxDripSkip["outcome"], message: string) {
    super(message);
    this.outcome = outcome;
    this.name = "FtuxDripSkip";
  }
}

/**
 * Real worker-payload. Кидає `FtuxDripSkip` для м'яких skip-ів і real
 * `Error` для retryable / permanent failures.
 *
 * Caller (BullMQ-worker) вирізняє `FtuxDripSkip` через `instanceof` і
 * закриває job як completed з відповідною outcome-міткою.
 */
async function dispatchFtuxDripEmail(data: FtuxDripJobData): Promise<void> {
  const deps = dispatcherDeps;
  if (!deps) {
    throw new Error(
      "ftuxDripMail: dispatcherDeps not configured (call configureFtuxDripDispatcher at boot).",
    );
  }
  const { pool } = deps;

  const user = await fetchUserRow(pool, data.userId);
  if (!user) {
    throw new FtuxDripSkip(
      "skipped_user_deleted",
      `user ${data.userId} not found at drip dispatch time`,
    );
  }

  // Re-check email — у юзера могла мінятись адреса між моментом enqueue
  // і send-ом (Day 1+3). Беремо актуальну з БД, а не кешовану з payload-у.
  const to = user.email;

  if (await isOptedOut(pool, data.userId)) {
    throw new FtuxDripSkip(
      "skipped_optout",
      `user ${data.userId} opted out from ${FTUX_DRIP_CAMPAIGN_FAMILY}`,
    );
  }

  const emailHash = emailFingerprint(to);

  // Pre-check campaigns_log: якщо row існує — точно skip.
  // INSERT з ON CONFLICT DO NOTHING нижче дає той самий ефект, плюс
  // race-safe (concurrent worker-и не send-ять двічі), але pre-check
  // економить fetch до Resend у normal-path-і.
  const reserved = await reserveLogRow(pool, {
    campaignKey: FTUX_DRIP_CAMPAIGN_KEY[data.day],
    recipientId: data.userId,
    emailHash,
    providerMessageId: null,
    variant: data.variant ?? null,
    raw: { day: data.day, attempts: 0 },
  });

  if (!reserved.isNew) {
    throw new FtuxDripSkip(
      "skipped_already_sent",
      `${FTUX_DRIP_CAMPAIGN_KEY[data.day]} already logged for user ${data.userId}`,
    );
  }

  const token = signUnsubscribeToken({ userId: data.userId });
  const appUrl = getAppUrl();
  const unsubscribeUrl = token
    ? buildUnsubscribeUrl({ appUrl, token })
    : `${appUrl}/api/email/unsubscribe?u=missing-secret`;

  const tpl = buildFtuxDripTemplate(data.day, {
    recipientName: user.name?.trim() || null,
    unsubscribeUrl,
    appUrl,
  });

  // Залишаємо row у `email_campaigns_log` НАВІТЬ якщо Resend поверне 5xx:
  // ретрай BullMQ на тому ж job-id побачить існуючий log-row і м'яко
  // заскіпає (`skipped_already_sent`). Це безпечніше ніж дублікат на
  // 0.1% non-idempotent-кейсів (Resend accept→reply-5xx race).
  const { providerMessageId } = await sendViaResend({
    to,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
  });

  if (providerMessageId) {
    await updateLogWithProvider(pool, {
      id: reserved.id,
      providerMessageId,
    });
  }

  logger.info({
    msg: "ftux_drip_email_sent",
    day: data.day,
    emailHash,
    campaignLogId: reserved.id,
    providerMessageId,
  });
}

/**
 * Public API: enqueue 3 drip-job-и (Day 0 immediate + Day 1 + Day 3 delayed)
 * для свіжо-зареєстрованого юзера. Викликається з `auth.ts`
 * `databaseHooks.user.create.after`.
 *
 * Не блокує caller — `void` всередині. Помилки enqueue-ить логуються,
 * не пробрасуються в auth-flow.
 */
export function queueFtuxDripForNewUser(args: {
  userId: string;
  email: string;
}): void {
  const days: FtuxDripDay[] = ["day_0", "day_1", "day_3"];
  for (const day of days) {
    void enqueueFtuxDripMail({
      kind: "ftux_drip",
      day,
      userId: args.userId,
      email: args.email,
      delayMs: FTUX_DRIP_DELAY_MS[day],
    }).catch((err: unknown) => {
      logger.error({
        msg: "ftux_drip_enqueue_unexpected_failure",
        day,
        emailHash: emailFingerprint(args.email),
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Direct-side callback (for tests). Коли є skipped-причина — caller-side
 * не пробрасує помилку нагору, а інкрементить процесінг-метрику з
 * відповідним outcome-ом. У production-flow цього callback-у не існує
 * (job processor сам розрулює skip → outcome).
 */
export function classifyDispatchOutcome(err: unknown): {
  outcome:
    | "ok"
    | "retry"
    | "permanent_fail"
    | "skipped_optout"
    | "skipped_already_sent"
    | "skipped_user_deleted";
} {
  if (err instanceof FtuxDripSkip) return { outcome: err.outcome };
  if (!err) return { outcome: "ok" };
  // Фактичну retry-vs-permanent-класифікацію виставляє worker через
  // `isRetryableMailError`; тут лишаємо `retry` як generic-default для
  // тестів які мокають dispatcher.
  return { outcome: "retry" };
}

// Реєструємо dispatcher один раз на імпорті. Кругова залежність уникнена
// через цей register-pattern (як в `email/authTransactionalMail.ts`).
registerFtuxDripDispatcher(dispatchFtuxDripEmail);

// Re-export Skip для зовнішніх тестів (worker-side) без витягання з
// internal symbol.
export { ftuxDripJobsProcessedTotal };
