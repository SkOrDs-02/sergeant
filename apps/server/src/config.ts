import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parseTrustProxy, type TrustProxyValue } from "./lib/trustProxy.js";

/**
 * Determines which runtime mode the server is starting in.
 *
 * Modes:
 *  - `railway` — API-only deploy (HTTPS, separate frontend on Vercel). Strict API CSP.
 *  - `replit`  — Unified process serving SPA + API on one port. CSP disabled so
 *                the SPA can execute its Vite-PWA bootstrap scripts.
 *
 * Selection:
 *  1. `SERVER_MODE=railway|replit` wins if set.
 *  2. Otherwise, presence of `REPLIT_DEV_DOMAIN` or `REPLIT_DOMAINS` → `replit`.
 *  3. Default → `railway`.
 */
type ServerMode = "railway" | "replit";

function detectMode(): ServerMode {
  const raw = process.env.SERVER_MODE?.trim().toLowerCase();
  if (raw === "railway" || raw === "replit") return raw;
  if (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS) {
    return "replit";
  }
  return "railway";
}

const mode = detectMode();
const isReplit = mode === "replit";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ServerConfig {
  mode: ServerMode;
  role: ServerMode;
  port: number;
  servesFrontend: boolean;
  distPath: string | null;
  trustProxy: TrustProxyValue;
}

/**
 * Frozen runtime config consumed by `server/index.js` and `server/app.js`.
 * Preserves the exact behavior of the previous split entrypoints
 * (`railway.mjs` vs `replit.mjs`):
 *  - Railway: port 3000, trust proxy level 1 (override via `TRUST_PROXY`),
 *    API-only, strict CSP.
 *  - Replit:  port 5000, no trust proxy by default, serves built SPA from
 *    ../dist, CSP off.
 *
 * **M2** (`docs/security/hardening/M2-trust-proxy-parameterize.md`):
 * `trustProxy` тепер читається з `TRUST_PROXY` env-var-у через
 * `parseTrustProxy`, який підтримує:
 *   - `TRUST_PROXY=2` — кількість hops (для Cloudflare + Railway: 2).
 *   - `TRUST_PROXY=10.0.0.0/8,192.168.0.0/16` — CIDR allowlist.
 *   - `TRUST_PROXY=loopback,uniquelocal` — express keyword shortcuts.
 *   - `TRUST_PROXY=false` — повністю вимкнути парсинг X-Forwarded-For.
 *   - `TRUST_PROXY=true` — заборонено (open relay для req.ip spoofing).
 *
 * Якщо `TRUST_PROXY` не заданий — fallback до historical Railway/Replit
 * behaviour (1 для Railway, undefined для Replit).
 */
export const config: Readonly<ServerConfig> = Object.freeze({
  mode,
  role: mode,
  port: Number(process.env.PORT) || (isReplit ? 5000 : 3000),
  servesFrontend: isReplit,
  distPath: isReplit ? join(__dirname, "..", "dist") : null,
  trustProxy: parseTrustProxy({
    raw: process.env.TRUST_PROXY,
    fallback: isReplit ? undefined : 1,
  }),
});
