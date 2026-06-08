import { parseTrustProxy, type TrustProxyValue } from "./lib/trustProxy.js";

/**
 * Runtime config for the server process.
 *
 * The server runs in a single mode: **Railway** — API-only deploy (HTTPS,
 * separate frontend on Vercel) with a strict API CSP. (The historical
 * `replit` unified-process mode was removed 2026-06-08; Replit is no longer a
 * deploy target.)
 */
type ServerMode = "railway";

const mode: ServerMode = "railway";

interface ServerConfig {
  mode: ServerMode;
  role: ServerMode;
  port: number;
  servesFrontend: boolean;
  distPath: string | null;
  trustProxy: TrustProxyValue;
}

/**
 * Frozen runtime config consumed by `server/index.js` and `server/app.js`:
 * port 3000, trust proxy level 1 (override via `TRUST_PROXY`), API-only,
 * strict CSP.
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
 * Якщо `TRUST_PROXY` не заданий — fallback до Railway behaviour (1).
 */
export const config: Readonly<ServerConfig> = Object.freeze({
  mode,
  role: mode,
  port: Number(process.env["PORT"]) || 3000,
  servesFrontend: false,
  distPath: null,
  trustProxy: parseTrustProxy({
    raw: process.env["TRUST_PROXY"],
    fallback: 1,
  }),
});
