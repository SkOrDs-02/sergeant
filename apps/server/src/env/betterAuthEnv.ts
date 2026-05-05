import { logger } from "../obs/logger.js";

function isDeployedProduction(): boolean {
  return (
    process.env["NODE_ENV"] === "production" ||
    Boolean(process.env["RAILWAY_ENVIRONMENT"]) ||
    Boolean(process.env["RAILWAY_SERVICE_NAME"])
  );
}

function resolveBetterAuthBaseURL(): string {
  if (process.env["BETTER_AUTH_URL"]) return process.env["BETTER_AUTH_URL"];
  if (process.env["REPLIT_DEV_DOMAIN"])
    return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  if (process.env["REPLIT_DOMAINS"]) {
    const first = process.env["REPLIT_DOMAINS"].split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  return `http://localhost:${process.env["PORT"] || "5000"}`;
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
 * Додатково — warn-и для типових misconfig (HTTPS base, CORS origins, Resend).
 */
export function assertBetterAuthStartupEnv(): void {
  if (!isDeployedProduction()) {
    return;
  }

  const secret = process.env["BETTER_AUTH_SECRET"]?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production and must be at least 32 characters (see README / docs/integrations/railway-vercel.md).",
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
  const hasWebOrigins =
    Boolean(process.env["ALLOWED_ORIGINS"]?.trim()) ||
    Boolean(process.env["REPLIT_DEV_DOMAIN"]) ||
    Boolean(process.env["REPLIT_DOMAINS"]?.trim());

  if (base.startsWith("https://") && !crossSiteCookiesOff && !hasWebOrigins) {
    logger.warn({
      msg: "better_auth_allowed_origins_empty",
      hint: "If the web app is on another origin (e.g. Vercel), set ALLOWED_ORIGINS to that origin (comma-separated) for CORS and ensure it matches Better Auth trustedOrigins patterns.",
    });
  }

  if (!process.env["RESEND_API_KEY"]?.trim()) {
    logger.warn({
      msg: "resend_api_key_missing",
      hint: "Password reset and verification emails are skipped until RESEND_API_KEY is set (see .env.example).",
    });
  }
}
