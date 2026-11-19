/**
 * Стартова перевірка HMAC-підпису на `/api/internal/*` (AIP-20260805-B27).
 *
 * Прапорець `WEBHOOK_HMAC_REQUIRED` обіцяє «непідписане відхиляємо», але сам
 * верифікатор — no-op без секрета (`verifyWebhookRequest` →
 * `if (!opts.secret) return ok`). Така конфігурація виглядає захищеною і
 * мовчить — рівно та форма «гейт, якого насправді немає», через яку в цьому
 * репо вже двічі тихо ріс борг.
 *
 * У проді це throw (рішення власника 2026-11-19): інакше `/api/internal/*`
 * тримається на одному статичному bearer-токені. Викликачі в репо
 * (`scripts/replay-dlq.mjs`, `scripts/replay-webhook.mjs`) підписують через
 * `scripts/lib/sign-internal-request.mjs`; n8n виведено (ADR-0090). Поза
 * продом лишається warning, щоб dev не вимагав секрета. Свідомий opt-out —
 * `WEBHOOK_HMAC_REQUIRED=false`.
 */
export function checkWebhookHmacPosture(
  env: {
    readonly WEBHOOK_HMAC_REQUIRED: boolean;
    readonly WEBHOOK_HMAC_SECRET: string;
    readonly INTERNAL_API_KEY: string;
  },
  isProduction: boolean,
  warnings: string[],
): void {
  if (
    !env.WEBHOOK_HMAC_REQUIRED ||
    !env.INTERNAL_API_KEY ||
    env.WEBHOOK_HMAC_SECRET
  ) {
    return;
  }
  if (isProduction) {
    throw new Error(
      "WEBHOOK_HMAC_SECRET is required in production when INTERNAL_API_KEY is set: without it signature checking on /api/internal/* is OFF and the routes rest on the bearer token alone. Generate one with `openssl rand -hex 32` and set it in Coolify (and in the env of whoever runs scripts/replay-*.mjs). A deliberate opt-out is WEBHOOK_HMAC_REQUIRED=false.",
    );
  }
  warnings.push(
    "WEBHOOK_HMAC_REQUIRED=true but WEBHOOK_HMAC_SECRET is empty — signature checking is OFF (the verifier no-ops without a secret). /api/internal/* is protected by the bearer token alone. Set WEBHOOK_HMAC_SECRET to make the flag mean anything.",
  );
}
