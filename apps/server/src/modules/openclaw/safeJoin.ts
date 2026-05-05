/**
 * `safeJoin` — path-traversal-resistant join для OpenClaw tool-implementations.
 *
 * Контекст — L8 (`docs/security/hardening/L8-openclaw-repo-root-traversal.md`).
 * `OPENCLAW_REPO_ROOT=/app` пінне у проді, але кожен tool, що бере path-аргумент
 * від LLM (наприклад, `read_strategy_docs`, майбутній `git_diff`), мусить:
 *   1) нормалізувати vars `..`, `.`, multiple `/`,
 *   2) вирішити absolute path у межах `root`,
 *   3) переконатися, що результат фізично залишається всередині `root`.
 *
 * Кейс, який ми хочемо виключити — LLM запитує `path: "../../etc/passwd"` →
 * `path.join(root, candidate)` повертає `/etc/passwd`. Тривіальна помилка
 * втечі з allowlist-prefix-у. `safeJoin` падає з `OpenClawPathTraversalError`
 * до того, як filesystem-call виконається.
 *
 * Контракт:
 *   - rejects absolute candidates (`/etc/passwd`, `C:\Windows`) — навіть
 *     якщо `root` дозволяє абсолютні шляхи, ми завжди трактуємо candidate
 *     як relative-to-root, бо саме так LLM-tool оголошений у JSON-schema;
 *   - rejects будь-які `..`-сегменти, які виводять resolved-path за межі
 *     `path.resolve(root) + path.sep`;
 *   - повертає the resolved absolute path (готовий до `fs.readFile`).
 *
 * `OpenClawPathTraversalError` — окремий клас, щоб caller-и могли
 * відрізнити traversal-attempt (security-audit-log entry) від звичайної
 * not-allowed-prefix-помилки (M14 audit `allowlist_fail`).
 */

import path from "node:path";

export class OpenClawPathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawPathTraversalError";
  }
}

/**
 * Resolves `candidate` relative to `root` and verifies the result stays
 * inside `root`. Throws {@link OpenClawPathTraversalError} on any escape.
 *
 * Examples (`root = "/app"`):
 *   `safeJoin("/app", "docs/strategy.md")`     → `/app/docs/strategy.md`
 *   `safeJoin("/app", "./docs/strategy.md")`   → `/app/docs/strategy.md`
 *   `safeJoin("/app", "docs/../README.md")`    → `/app/README.md`
 *   `safeJoin("/app", "../etc/passwd")`        → throws
 *   `safeJoin("/app", "/etc/passwd")`          → throws
 *   `safeJoin("/app", "")`                     → throws (empty candidate)
 */
export function safeJoin(root: string, candidate: string): string {
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new OpenClawPathTraversalError(
      "safeJoin: candidate path is required",
    );
  }
  // NUL bytes truncate filesystem paths in libuv; reject defensively even
  // though Node's fs APIs already error out — fail-closed before ever
  // calling out to the resolver.
  if (candidate.includes("\0")) {
    throw new OpenClawPathTraversalError(
      "safeJoin: NUL byte in candidate path",
    );
  }
  // Treat candidate as relative-to-root. Absolute candidates would let the
  // LLM bypass `root` entirely (`path.resolve(root, "/etc/passwd")` returns
  // `/etc/passwd` on POSIX).
  if (path.isAbsolute(candidate)) {
    throw new OpenClawPathTraversalError(
      `safeJoin: absolute path is not allowed: '${candidate}'`,
    );
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);

  // `path.resolve` already collapses `..` segments. The remaining check is
  // whether the result still sits inside `resolvedRoot`. Use the
  // `prefix + path.sep` guard so `/app-other` does not match `/app`.
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new OpenClawPathTraversalError(
      `safeJoin: path '${candidate}' escapes root '${resolvedRoot}'`,
    );
  }
  return resolved;
}
