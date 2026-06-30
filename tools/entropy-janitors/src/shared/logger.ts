import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REDACT_KEYS = [
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "github_token",
  "pat",
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (/^ghp_[A-Za-z0-9]{20,}$/.test(value)) return "[redacted:github-pat]";
    if (/^xox[abp]-[A-Za-z0-9-]{10,}$/.test(value)) return "[redacted:slack]";
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      const isSecret = REDACT_KEYS.some((rk) => lower.includes(rk));
      out[k] = isSecret ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(
  level: "info" | "warn" | "error",
  msg: string,
  data?: unknown,
): void {
  const ts = new Date().toISOString();
  const payload = data === undefined ? null : redact(data);
  const text = payload === null ? msg : `${msg} ${JSON.stringify(payload)}`;
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(`[${ts}] [${level.toUpperCase()}] ${text}\n`);
}

export const logger = {
  info: (msg: string, data?: unknown): void => emit("info", msg, data),
  warn: (msg: string, data?: unknown): void => emit("warn", msg, data),
  error: (msg: string, data?: unknown): void => emit("error", msg, data),
};

export const WORKTREE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
