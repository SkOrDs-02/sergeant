// ─────────────────────────────────────────────────────────────────────────
// read_strategy_docs — file system з prefix-allowlist
// ─────────────────────────────────────────────────────────────────────────

import { promises as fs } from "node:fs";
import path from "node:path";
import { OpenClawPathTraversalError, safeJoin } from "./safeJoin.js";
import { READ_STRATEGY_DOCS_ALLOWED_PATHS } from "./types.js";
import { OpenClawAllowlistError, OpenClawNotFoundError } from "./tools-errors.js";

export interface ReadStrategyDocsInput {
  /**
   * Relative path від repo root (наприклад, `docs/strategy/openclaw.md`).
   * Path traversal (`..`) blocked-кається через `path.resolve` +
   * prefix-check.
   */
  path: string;
}

export interface ReadStrategyDocsOutput {
  path: string;
  contents: string;
  /** Розмір у bytes. */
  size: number;
}

/**
 * Resolve `repoRoot`. Lazy-читання `OPENCLAW_REPO_ROOT` (а не module-load
 * snapshot) щоб тести могли під-сетати fake-root через `process.env.X = ...`
 * у `beforeAll` без re-import-у tools.ts. Production override
 * прийде з Dockerfile.api `ENV OPENCLAW_REPO_ROOT=/app`.
 *
 * Default fallback (env unset): три рівні вище від цього файлу. У дев-середе
 * (`tsx`) це лежить у `apps/server/src/modules/openclaw/tools.ts` → repo
 * root. У бандлі (esbuild → `apps/server/dist-server/index.js`) той же
 * розрахунок дає `/` всередині Docker-image, тому prod-overrider
 * `OPENCLAW_REPO_ROOT=/app` обов'язковий — без нього `read_strategy_docs`
 * валив 5xx.
 */
function resolveRepoRoot(): string {
  const envRoot = process.env["OPENCLAW_REPO_ROOT"];
  if (envRoot) return path.resolve(envRoot);
  return path.resolve(import.meta.dirname ?? __dirname, "../../../../..");
}

export async function readStrategyDoc(
  input: ReadStrategyDocsInput,
): Promise<ReadStrategyDocsOutput> {
  const repoRoot = resolveRepoRoot();
  // Strip leading slashes so the LLM-supplied `docs/strategy/foo.md` and
  // `/docs/strategy/foo.md` resolve identically; `safeJoin` itself rejects
  // truly absolute paths (`/etc/passwd`, `C:\...`) before any traversal
  // attempt reaches the filesystem.
  const requested = input.path.replace(/^\/+/, "");
  let resolved: string;
  try {
    resolved = safeJoin(repoRoot, requested);
  } catch (err) {
    if (err instanceof OpenClawPathTraversalError) {
      // L8 — surface traversal attempts as allowlist violations so the
      // routes-handler maps them to 4xx (not 5xx via Sentry-fatal).
      // Wrap rather than re-throw so callers keep one error type to
      // match against.
      throw new OpenClawAllowlistError(
        `Path '${input.path}' is not in read_strategy_docs allowlist (path traversal blocked)`,
      );
    }
    throw err;
  }

  // Prefix-allowlist: resolved-path має починатися з repoRoot/<allowed>.
  const isAllowed = READ_STRATEGY_DOCS_ALLOWED_PATHS.some((prefix) => {
    const allowedRoot = path.resolve(repoRoot, prefix);
    return (
      resolved === allowedRoot || resolved.startsWith(allowedRoot + path.sep)
    );
  });
  if (!isAllowed) {
    throw new OpenClawAllowlistError(
      `Path '${input.path}' is not in read_strategy_docs allowlist`,
    );
  }

  // Stat first — якщо це директорія, повертаємо її вміст списком (для
  // index-у). Якщо файл — повертаємо contents.
  //
  // Allowlist-prefix може посилатися на директорію, що ще не існує (напр.
  // `docs/decisions/` до першого `record_decision`-PR-у або aspirational
  // `docs/strategy/` до першого `commit_to_strategy_doc`). У runtime image
  // (Dockerfile.api) також копіюються тільки існуючі subdir-и. У таких
  // випадках раніше `fs.stat` бабахав ENOENT → asyncHandler → Sentry fatal.
  // Тепер мапаємо на `OpenClawNotFoundError`, який routes-handler віддає
  // як 404 з `{ error: 'not_found' }`. Allowlist-семантика залишається
  // окремо — `allowlist_fail` лише для path-traversal/forbidden-prefix.
  let stat: import("node:fs").Stats;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- `resolved` validated by `isAllowed`/path-traversal check at lines 123-128
    stat = await fs.stat(resolved);
  } catch (err) {
    if (isEnoentError(err)) {
      throw new OpenClawNotFoundError(
        `Path '${input.path}' not found in read_strategy_docs tree`,
      );
    }
    throw err;
  }
  if (stat.isDirectory()) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- `resolved` validated by `isAllowed`/path-traversal check at lines 123-128
    const entries = await fs.readdir(resolved);
    return {
      path: input.path,
      contents: entries.sort().join("\n"),
      size: entries.length,
    };
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- `resolved` validated by `isAllowed`/path-traversal check at lines 123-128
  const contents = await fs.readFile(resolved, "utf-8");
  return {
    path: input.path,
    contents,
    size: stat.size,
  };
}

function isEnoentError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
