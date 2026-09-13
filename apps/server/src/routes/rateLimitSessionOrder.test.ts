// apps/server/src/routes/rateLimitSessionOrder.test.ts
//
// Guard test for PR-A3 (`docs/work/specs/audits/2026-09-13-product-full-review.md`)
// — a recidive of knahidka B31 (`chat.ts`, `docs/90-work/audits/ai-testing-2026-08-25.md`).
//
// `rateLimitSubject` (`http/rateLimit.ts`) reads `req.user.id` and only falls
// back to `ip:<addr>` when there is no session. If the rate-limiter runs
// BEFORE `requireSession()`/`requireSessionSoft()` on a given route, `req.user`
// is always unset at check-time and the bucket is silently always per-IP —
// an IPv6 client with a /64 evades the "per-user" budget by rotating address,
// and a shared NAT/office/CGNAT connection shares one bucket across many
// people. This bit five router files at once (sync, nutrition, ai-memory,
// transcribe, push); this test parses the route source directly (the same
// "the test reads the actual artifact, not a description of it" approach as
// `scripts/__tests__/ci-bundle-budget-gates.test.mjs`) so the ordering bug
// cannot recur silently a third time.
//
// The parser is intentionally simple and file-specific — like
// `ci-bundle-budget-gates.test.mjs`'s `extractJobBlock`/`extractSteps`, it
// leans on known anchors in each file rather than a general-purpose JS
// parser. Comments are stripped first: several of the fixed files now
// mention `requireSession()`/`rateLimitExpress(` in prose inside comments,
// which would otherwise confuse a naive substring/regex scan. None of these
// route files put `//` or `/*` inside an actual string literal (paths are
// plain `/api/...` segments), so comment-stripping is safe here.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readRouteSource(fileName: string): string {
  return readFileSync(resolve(__dirname, fileName), "utf8");
}

/** Strips `/* … *\/` and `// …` comments. Safe here — see file header. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * First index of `regex` in `haystack`, starting the search at `from`.
 * Throws instead of returning -1 so a future refactor that removes/renames
 * the anchor fails the test loudly ("update this test") rather than passing
 * vacuously because neither anchor was found.
 */
function mustSearch(
  haystack: string,
  regex: RegExp,
  from: number,
  label: string,
): number {
  const scoped = haystack.slice(from);
  const m = scoped.match(regex);
  if (!m || m.index === undefined) {
    throw new Error(
      `rateLimitSessionOrder.test.ts: анкер "${label}" (${regex}) не знайдено — файл змінив форму, онови цей тест`,
    );
  }
  return from + m.index;
}

/**
 * Asserts that, within `code.slice(scopeStart, scopeEnd)`, `sessionRegex`
 * (a `requireSession()`/`requireSessionSoft()` call, or an identifier that
 * carries one) matches at an earlier index than `limiterRegex` (a
 * `rateLimitExpress(...)` call or a reference to a const built from one).
 */
function assertSessionBeforeLimiter(
  code: string,
  scopeStartRegex: RegExp,
  scopeEndRegex: RegExp | null,
  sessionRegex: RegExp,
  limiterRegex: RegExp,
  label: string,
): void {
  const scopeStart = mustSearch(
    code,
    scopeStartRegex,
    0,
    `${label}: scope start`,
  );
  const scopeEnd = scopeEndRegex
    ? mustSearch(code, scopeEndRegex, scopeStart + 1, `${label}: scope end`)
    : code.length;
  const scope = code.slice(scopeStart, scopeEnd);
  const sessionIdx = mustSearch(
    scope,
    sessionRegex,
    0,
    `${label}: session guard`,
  );
  const limiterIdx = mustSearch(
    scope,
    limiterRegex,
    0,
    `${label}: rate limiter`,
  );
  expect(
    sessionIdx,
    `${label}: requireSession()/requireSessionSoft() має стояти ПЕРЕД rateLimitExpress() — інакше rateLimitSubject завжди фолбечиться на IP (PR-A3 / рецидив B31)`,
  ).toBeLessThan(limiterIdx);
}

describe("PR-A3 / рецидив B31 — requireSession() має йти перед rateLimitExpress()", () => {
  it("sync.ts: /api/sync (r.use-чейн)", () => {
    const code = stripComments(readRouteSource("sync.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.use\(\s*["']\/api\/sync["']\s*,\s*setModule\(\s*["']sync["']\s*\)\s*\)/,
      /r\.get\(\s*["']\/api\/sync\/audit["']/,
      /requireSession\(\)/,
      /rateLimitExpress\(\s*\{\s*key:\s*["']api:sync["']/,
      "/api/sync",
    );
  });

  it("sync.ts: /api/v2/sync (r.use-чейн)", () => {
    const code = stripComments(readRouteSource("sync.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.use\(\s*["']\/api\/v2\/sync["']\s*,\s*setModule\(\s*["']syncV2["']\s*\)\s*\)/,
      /r\.post\(\s*["']\/api\/v2\/sync\/push["']/,
      /requireSession\(\)/,
      /rateLimitExpress\(\s*\{\s*key:\s*["']api:v2:sync["']/,
      "/api/v2/sync",
    );
  });

  it("nutrition.ts: /api/nutrition top-level guard (r.use-чейн)", () => {
    const code = stripComments(readRouteSource("nutrition.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.use\(\s*["']\/api\/nutrition["']\s*,\s*setModule\(\s*["']nutrition["']\s*\)\s*\)/,
      /const aiVision/,
      /requireSession\(\)/,
      /rateLimitExpress\(\s*\{\s*key:\s*["']api:nutrition["']/,
      "/api/nutrition",
    );
  });

  it("ai-memory.ts: POST /api/ai-memory/recall", () => {
    const code = stripComments(readRouteSource("ai-memory.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.post\(\s*["']\/api\/ai-memory\/recall["']/,
      /r\.delete\(\s*["']\/api\/ai-memory["']/,
      /requireSession\(\)/,
      /heavyRateLimit/,
      "/api/ai-memory/recall",
    );
  });

  it("ai-memory.ts: DELETE /api/ai-memory", () => {
    const code = stripComments(readRouteSource("ai-memory.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.delete\(\s*["']\/api\/ai-memory["']/,
      /r\.get\(\s*["']\/api\/ai-memory\/list["']/,
      /requireSession\(\)/,
      /browseRateLimit/,
      "DELETE /api/ai-memory",
    );
  });

  it("ai-memory.ts: GET /api/ai-memory/list", () => {
    const code = stripComments(readRouteSource("ai-memory.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.get\(\s*["']\/api\/ai-memory\/list["']/,
      /r\.delete\(\s*["']\/api\/ai-memory\/:id["']/,
      /requireSession\(\)/,
      /browseRateLimit/,
      "/api/ai-memory/list",
    );
  });

  it("ai-memory.ts: DELETE /api/ai-memory/:id", () => {
    const code = stripComments(readRouteSource("ai-memory.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.delete\(\s*["']\/api\/ai-memory\/:id["']/,
      null,
      /requireSession\(\)/,
      /browseRateLimit/,
      "/api/ai-memory/:id",
    );
  });

  it("transcribe.ts: POST /api/transcribe", () => {
    const code = stripComments(readRouteSource("transcribe.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.post\(\s*["']\/api\/transcribe["']/,
      null,
      /requireSession\(\)/,
      /rateLimitExpress\(\s*\{\s*key:\s*["']api:transcribe["']/,
      "/api/transcribe",
    );
  });

  it("push.ts: POST /api/push/subscribe (requireSessionSoft)", () => {
    const code = stripComments(readRouteSource("push.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.post\(\s*["']\/api\/push\/subscribe["']/,
      /r\.delete\(\s*["']\/api\/push\/subscribe["']/,
      /requireSessionSoft\(\)/,
      /broadRateLimit/,
      "POST /api/push/subscribe",
    );
  });

  it("push.ts: DELETE /api/push/subscribe (requireSessionSoft)", () => {
    const code = stripComments(readRouteSource("push.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.delete\(\s*["']\/api\/push\/subscribe["']/,
      /r\.post\(\s*["']\/api\/push\/register["']/,
      /requireSessionSoft\(\)/,
      /broadRateLimit/,
      "DELETE /api/push/subscribe",
    );
  });

  it("push.ts: POST /api/push/register", () => {
    const code = stripComments(readRouteSource("push.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.post\(\s*["']\/api\/push\/register["']/,
      /r\.post\(\s*["']\/api\/push\/unregister["']/,
      /requireSession\(\)/,
      /broadRateLimit/,
      "/api/push/register",
    );
  });

  it("push.ts: POST /api/push/unregister", () => {
    const code = stripComments(readRouteSource("push.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.post\(\s*["']\/api\/push\/unregister["']/,
      /r\.post\(\s*["']\/api\/push\/send["']/,
      /requireSession\(\)/,
      /broadRateLimit/,
      "/api/push/unregister",
    );
  });

  it("push.ts: POST /api/push/test (session перед ОБОМА лімітерами)", () => {
    const code = stripComments(readRouteSource("push.ts"));
    assertSessionBeforeLimiter(
      code,
      /r\.post\(\s*["']\/api\/push\/test["']/,
      null,
      /requireSession\(\)/,
      /broadRateLimit/,
      "/api/push/test (broad)",
    );
    assertSessionBeforeLimiter(
      code,
      /r\.post\(\s*["']\/api\/push\/test["']/,
      null,
      /requireSession\(\)/,
      /rateLimitExpress\(\s*\{\s*key:\s*["']api:push:test["']/,
      "/api/push/test (per-route)",
    );
  });

  it("push.ts: POST /api/push/send лишається навмисно без сесії (internal-only, IP-бакет)", () => {
    // Не регресія B31/PR-A3: `send` захищений мережевим allowlist-ом +
    // `X-Api-Secret`, а не сесією користувача, тож per-IP тут — задум, не
    // баг. Тест фіксує це явно: якщо колись хтось додасть сюди
    // requireSession(), це не має зламати цей файл мовчки.
    const code = stripComments(readRouteSource("push.ts"));
    const scopeStart = mustSearch(
      code,
      /r\.post\(\s*["']\/api\/push\/send["']/,
      0,
      "/api/push/send: scope start",
    );
    const scopeEnd = mustSearch(
      code,
      /r\.post\(\s*["']\/api\/push\/test["']/,
      scopeStart + 1,
      "/api/push/send: scope end",
    );
    const scope = code.slice(scopeStart, scopeEnd);
    expect(scope).not.toMatch(/requireSession\(\)/);
    expect(scope).not.toMatch(/requireSessionSoft\(\)/);
  });
});
