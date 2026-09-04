import { logger } from "../obs/logger.js";
import { isDeployedProduction } from "./env.js";

function resolveBetterAuthBaseURL(): string {
  if (process.env["BETTER_AUTH_URL"]) return process.env["BETTER_AUTH_URL"];
  return `http://localhost:${process.env["PORT"] || "3000"}`;
}

const WEAK_BETTER_AUTH_SECRETS = new Set([
  "change_me_to_a_long_random_string_32chars",
  "changeme",
  "secret",
  "better-auth-secret",
]);

/**
 * Викликати на старті процесу (до `createApp`). У продакшн-середовищі
 * падає з помилкою, якщо `BETTER_AUTH_SECRET` відсутній або занадто слабкий.
 * Додатково — warn-и для типових misconfig (HTTPS base, CORS origins).
 */
export function assertBetterAuthStartupEnv(): void {
  if (!isDeployedProduction()) {
    return;
  }

  const secret = process.env["BETTER_AUTH_SECRET"]?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production and must be at least 32 characters (see README / docs/02-engineering/integrations/railway-vercel.md).",
    );
  }
  const lower = secret.toLowerCase();
  if (WEAK_BETTER_AUTH_SECRETS.has(lower)) {
    throw new Error(
      "BETTER_AUTH_SECRET matches a known placeholder — set a unique random value (e.g. openssl rand -base64 32).",
    );
  }

  const base = resolveBetterAuthBaseURL();
  if (base.startsWith("http://") && !base.includes("localhost")) {
    logger.warn({
      msg: "better_auth_baseurl_insecure",
      hint: "Set BETTER_AUTH_URL to the public HTTPS API URL on Railway.",
    });
  }

  const crossSiteCookiesOff =
    process.env["BETTER_AUTH_CROSS_SITE_COOKIES"] === "0";
  const hasWebOrigins = Boolean(process.env["ALLOWED_ORIGINS"]?.trim());

  if (base.startsWith("https://") && !crossSiteCookiesOff && !hasWebOrigins) {
    logger.warn({
      msg: "better_auth_allowed_origins_empty",
      hint: "If the web app is on another origin (e.g. Vercel), set ALLOWED_ORIGINS to that origin (comma-separated) for CORS and ensure it matches Better Auth trustedOrigins patterns.",
    });
  }

  if (!process.env["RESEND_API_KEY"]?.trim()) {
    // Better Auth acknowledges a queued verification request before the
    // asynchronous mail dispatcher sees this value. Starting production in
    // this state therefore made `send-verification-email` return 200 while no
    // message could ever be delivered (global QA 2026-08-04, finding 17).
    // Refuse the unhealthy deployment rather than offering a false success.
    throw new Error(
      "RESEND_API_KEY is required in production: verification, password-reset, and change-email messages cannot be delivered without it (see .env.example).",
    );
  }
}
