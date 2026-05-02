import { createHash } from "node:crypto";

import {
  enqueueAuthMail,
  registerAuthMailDispatcher,
  type AuthMailJobData,
} from "../lib/jobs/authMail.js";
import { logger } from "../obs/logger.js";

function isDeployedProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RAILWAY_SERVICE_NAME)
  );
}

function emailFingerprint(email: string): string {
  return createHash("sha256")
    .update(email.toLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 12);
}

export type AuthMailKind = AuthMailJobData["kind"];

/**
 * Транзакційні листи Better Auth (reset / verify) через Resend HTTP API.
 *
 * **Durability:** при наявному `REDIS_URL` лист потрапляє у BullMQ-чергу
 * (`auth-mail`) з 5-ма ретраями та exponential-backoff (5min → 6h). Без
 * Redis — fallback у in-process direct-dispatch (як було раніше),
 * тестовано у `authTransactionalMail.test.ts`.
 *
 * Без `RESEND_API_KEY`: у dev — лог `info` (без URL/токенів),
 * у prod — `warn` без токена.
 *
 * Caller (Better Auth callback) НЕ блокується — `void` тут навмисний:
 * enqueue має латентність ~ms, але у fallback-режимі це fetch до Resend,
 * блокувати auth-callback на цьому ми не хочемо.
 */
export function queueAuthTransactionalEmail(args: {
  kind: AuthMailKind;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): void {
  void enqueueAuthMail(args).catch((err: unknown) => {
    logger.error({
      msg: "auth_mail_enqueue_unexpected_failure",
      kind: args.kind,
      emailHash: emailFingerprint(args.to),
      err: err instanceof Error ? err.message : String(err),
    });
  });
}

async function dispatchAuthTransactionalEmail(
  args: AuthMailJobData,
): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (isDeployedProduction()) {
      logger.warn({
        msg: "auth_transactional_email_skipped_no_provider",
        kind: args.kind,
        emailHash: emailFingerprint(args.to),
      });
    } else {
      logger.info({
        msg: "auth_transactional_email_skipped_dev_no_resend",
        kind: args.kind,
        emailHash: emailFingerprint(args.to),
      });
    }
    return;
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
      ...(args.html ? { html: args.html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  logger.info({
    msg: "auth_transactional_email_sent",
    kind: args.kind,
    emailHash: emailFingerprint(args.to),
  });
}

// Реєструємо dispatcher один раз при імпорті модуля. Кругова залежність
// уникнена через цей register-pattern: `lib/jobs/authMail.ts` НЕ імпортує
// з `./authTransactionalMail.ts`.
registerAuthMailDispatcher(dispatchAuthTransactionalEmail);
