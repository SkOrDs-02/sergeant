import { JWT } from "google-auth-library";
import { logger } from "../obs/logger.js";

/**
 * Lazy FCM HTTP v1 клієнт — OAuth2 service-account → Bearer access_token.
 *
 * v1 API (`/v1/projects/{project_id}/messages:send`) обовʼязково вимагає
 * Bearer OAuth2 token зі scope-ом `firebase.messaging`. Старий legacy API з
 * `Authorization: key=...` Google деприкейтнув (Jun 2024) — не використовуємо.
 *
 * Access-token кешуємо у модулі з маржею 60 с до `expiresAt` — щоб не
 * попадати у лотерею, коли токен протух між тест-імплементацією та мережевим
 * запитом. JWT-обʼєкт з google-auth-library сам ре-підписує access-token-и;
 * ми просто тримаємо його інстанс і `authorize()`-имо per-call.
 */

interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface FcmAccessToken {
  accessToken: string;
  /** Unix ms when access token expires (as reported by Google). */
  expiresAt: number;
}

let cachedConfig: FcmConfig | null | undefined = undefined;
let cachedJwt: JWT | null = null;
let cachedToken: FcmAccessToken | null = null;
let warnedDisabled = false;

/** Margin before expiry at which we proactively refresh the token. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * Decode a base64 service-account JSON blob and extract the three fields
 * we actually need. Returns `null` (with a warn-log) for any failure mode —
 * missing env, invalid base64, unparseable JSON, missing fields — so the
 * sender gracefully degrades instead of crashing boot.
 */
function loadConfigFromEnv(): FcmConfig | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) {
    if (!warnedDisabled) {
      logger.warn({
        msg: "push sender disabled — no FCM_SERVICE_ACCOUNT_JSON",
      });
      warnedDisabled = true;
    }
    return null;
  }
  let decoded: string;
  try {
    // `.trim()` — Railway/Docker-env іноді додають trailing newline; base64
    // decoder на нього кидає «Invalid character». Ідемпотентно для чистих вводів.
    decoded = Buffer.from(raw.trim(), "base64").toString("utf8");
  } catch (e) {
    logger.warn({
      msg: "push sender disabled — FCM_SERVICE_ACCOUNT_JSON invalid base64",
      err: { message: e instanceof Error ? e.message : String(e) },
    });
    warnedDisabled = true;
    return null;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(decoded) as Record<string, unknown>;
  } catch (e) {
    logger.warn({
      msg: "push sender disabled — FCM_SERVICE_ACCOUNT_JSON invalid JSON",
      err: { message: e instanceof Error ? e.message : String(e) },
    });
    warnedDisabled = true;
    return null;
  }
  const projectId =
    typeof parsed.project_id === "string" ? parsed.project_id : null;
  const clientEmail =
    typeof parsed.client_email === "string" ? parsed.client_email : null;
  const privateKey =
    typeof parsed.private_key === "string" ? parsed.private_key : null;
  if (!projectId || !clientEmail || !privateKey) {
    logger.warn({
      msg: "push sender disabled — FCM service account missing fields",
      hasProjectId: Boolean(projectId),
      hasClientEmail: Boolean(clientEmail),
      hasPrivateKey: Boolean(privateKey),
    });
    warnedDisabled = true;
    return null;
  }
  return { projectId, clientEmail, privateKey };
}

function getFcmConfig(): FcmConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  cachedConfig = loadConfigFromEnv();
  return cachedConfig;
}

function getJwt(): JWT | null {
  if (cachedJwt) return cachedJwt;
  const cfg = getFcmConfig();
  if (!cfg) return null;
  cachedJwt = new JWT({
    email: cfg.clientEmail,
    key: cfg.privateKey,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  return cachedJwt;
}

/**
 * Return a valid FCM OAuth2 Bearer token, refreshing lazily. Returns `null`
 * when FCM is disabled (missing/invalid service account).
 *
 * Throws only if Google's token endpoint replies with something we cannot
 * interpret — caller (`sendFCM`) handles the throw as a transient error and
 * retries with backoff.
 */
export async function getFcmAccessToken(): Promise<string | null> {
  const jwt = getJwt();
  if (!jwt) return null;
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - REFRESH_MARGIN_MS > now) {
    return cachedToken.accessToken;
  }
  const resp = await jwt.authorize();
  if (!resp.access_token) {
    throw new Error("FCM token request returned no access_token");
  }
  const expiresAt =
    typeof resp.expiry_date === "number" && resp.expiry_date > 0
      ? resp.expiry_date
      : now + 3_600_000; // fallback: 1h (Google's default)
  cachedToken = { accessToken: resp.access_token, expiresAt };
  return resp.access_token;
}

/** FCM project id або `null`, якщо конфіг не валідний. */
export function fcmProjectId(): string | null {
  return getFcmConfig()?.projectId ?? null;
}
