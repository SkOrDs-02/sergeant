// apps/server/src/routes/rateLimitSessionOrder.test.ts
//
// Guard test for PR-A3 (`docs/work/specs/audits/2026-09-13-product-full-review.md`)
// — a recidive of knahidka B31 (`chat.ts`, `docs/work/specs/audits/ai-testing-2026-08-25.md`).
//
// Two invariants, and both matter independently:
//
//   1. `rateLimitSubject` (`http/rateLimit.ts`) reads `req.user.id` and only
//      falls back to `ip:<addr>` when there is no session. If the PER-USER
//      rate-limiter runs BEFORE `requireSession()`/`requireSessionSoft()`
//      on a given route, `req.user` is always unset at check-time and the
//      bucket is silently always per-IP — an IPv6 client with a /64 evades
//      the "per-user" budget by rotating address, and a shared NAT/office/
//      CGNAT connection shares one bucket across many people.
//   2. `requireSession()`/`requireSessionSoft()` respond 401/503 on failure
//      and do NOT call `next()`. So fixing (1) by moving the session guard
//      first has a flip side: an unauthenticated request (no/forged cookie)
//      never reaches the per-user limiter at all — the pre-auth IP-keyed
//      limiter that used to sit in front of everything (a single shared
//      `r.use(...)`) is what caught that traffic before. Without a
//      standalone pre-auth IP limiter placed BEFORE the session guard,
//      unauthenticated flooding is unbounded even though `getSessionUser`
//      still does session-store work on every such request.
//
// This bit five router files at once (sync, nutrition, ai-memory,
// transcribe, push); this test parses the route source directly (the same
// "the test reads the actual artifact, not a description of it" approach as
// `scripts/__tests__/ci-bundle-budget-gates.test.mjs`) so neither ordering
// bug can recur silently again.
//
// The parser is intentionally simple and file-specific — like
// `ci-bundle-budget-gates.test.mjs`'s `extractJobBlock`/`extractSteps`, it
// leans on known anchors in each file rather than a general-purpose JS
// parser. Comments are stripped first: several of the fixed files now
// mention `requireSession()`/`rateLimitExpress(`/pre-auth IP limiters in
// prose inside comments, which would otherwise confuse a naive
// substring/regex scan. None of these route files put `//` or `/*` inside
// an actual string literal (paths are plain `/api/...` segments), so
// comment-stripping is safe here.

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
 * Asserts that, within `code.slice(scopeStart, scopeEnd)`, `earlierRegex`
 * matches at an earlier index than `laterRegex`. Generic ordering check
 * shared by both invariants below — only the regexes and failure message
 * differ per call site.
 */
function assertOrder(
  code: string,
  scopeStartRegex: RegExp,
  scopeEndRegex: RegExp | null,
  earlierRegex: RegExp,
  earlierLabel: string,
  laterRegex: RegExp,
  laterLabel: string,
  scopeLabel: string,
  failureMessage: string,
): void {
  const scopeStart = mustSearch(
    code,
    scopeStartRegex,
    0,
    `${scopeLabel}: scope start`,
  );
  const scopeEnd = scopeEndRegex
    ? mustSearch(
        code,
        scopeEndRegex,
        scopeStart + 1,
        `${scopeLabel}: scope end`,
      )
    : code.length;
  const scope = code.slice(scopeStart, scopeEnd);
  const earlierIdx = mustSearch(
    scope,
    earlierRegex,
    0,
    `${scopeLabel}: ${earlierLabel}`,
  );
  const laterIdx = mustSearch(
    scope,
    laterRegex,
    0,
    `${scopeLabel}: ${laterLabel}`,
  );
  expect(earlierIdx, `${scopeLabel}: ${failureMessage}`).toBeLessThan(laterIdx);
}

/** Invariant (1): session guard must precede the PER-USER rate limiter. */
function assertSessionBeforeLimiter(
  code: string,
  scopeStartRegex: RegExp,
  scopeEndRegex: RegExp | null,
  sessionRegex: RegExp,
  limiterRegex: RegExp,
  label: string,
): void {
  assertOrder(
    code,
    scopeStartRegex,
    scopeEndRegex,
    sessionRegex,
    "session guard",
    limiterRegex,
    "per-user rate limiter",
    label,
    "requireSession()/requireSessionSoft() має стояти ПЕРЕД per-user rateLimitExpress() — інакше rateLimitSubject завжди фолбечиться на IP (PR-A3 / рецидив B31)",
  );
}

/**
 * Invariant (2): a standalone pre-auth, IP-keyed rate limiter must precede
 * the session guard, so unauthenticated flooding (no/forged cookie) is
 * still bounded even though `requireSession()`/`requireSessionSoft()` never
 * call `next()` on failure.
 */
function assertPreAuthIpBeforeSession(
  code: string,
  scopeStartRegex: RegExp,
  scopeEndRegex: RegExp | null,
  preAuthIpRegex: RegExp,
  sessionRegex: RegExp,
  label: string,
): void {
  assertOrder(
    code,
    scopeStartRegex,
    scopeEndRegex,
    preAuthIpRegex,
    "pre-auth IP rate limiter",
    sessionRegex,
    "session guard",
    label,
    "pre-auth IP-лімітер має стояти ПЕРЕД requireSession()/requireSessionSoft() — інакше requireSession() 401-ить безсесійний флуд без next(), і жоден лімітер його не бачить",
  );
}

describe("PR-A3 / рецидив B31 — session guard vs. rate limiters", () => {
  describe("requireSession()/requireSessionSoft() перед per-user лімітером", () => {
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

  describe("pre-auth IP-лімітер перед requireSession()/requireSessionSoft()", () => {
    it("sync.ts: /api/sync (r.use-чейн)", () => {
      const code = stripComments(readRouteSource("sync.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.use\(\s*["']\/api\/sync["']\s*,\s*setModule\(\s*["']sync["']\s*\)\s*\)/,
        /r\.get\(\s*["']\/api\/sync\/audit["']/,
        /rateLimitExpress\(\s*\{\s*key:\s*["']api:sync:ip["']/,
        /requireSession\(\)/,
        "/api/sync",
      );
    });

    it("sync.ts: /api/v2/sync (r.use-чейн)", () => {
      const code = stripComments(readRouteSource("sync.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.use\(\s*["']\/api\/v2\/sync["']\s*,\s*setModule\(\s*["']syncV2["']\s*\)\s*\)/,
        /r\.post\(\s*["']\/api\/v2\/sync\/push["']/,
        /rateLimitExpress\(\s*\{\s*key:\s*["']api:v2:sync:ip["']/,
        /requireSession\(\)/,
        "/api/v2/sync",
      );
    });

    it("nutrition.ts: /api/nutrition top-level guard (r.use-чейн)", () => {
      const code = stripComments(readRouteSource("nutrition.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.use\(\s*["']\/api\/nutrition["']\s*,\s*setModule\(\s*["']nutrition["']\s*\)\s*\)/,
        /const aiVision/,
        /rateLimitExpress\(\s*\{\s*key:\s*["']api:nutrition:ip["']/,
        /requireSession\(\)/,
        "/api/nutrition",
      );
    });

    it("ai-memory.ts: POST /api/ai-memory/recall", () => {
      const code = stripComments(readRouteSource("ai-memory.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.post\(\s*["']\/api\/ai-memory\/recall["']/,
        /r\.delete\(\s*["']\/api\/ai-memory["']/,
        /heavyPreAuthIp/,
        /requireSession\(\)/,
        "/api/ai-memory/recall",
      );
    });

    it("ai-memory.ts: DELETE /api/ai-memory", () => {
      const code = stripComments(readRouteSource("ai-memory.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.delete\(\s*["']\/api\/ai-memory["']/,
        /r\.get\(\s*["']\/api\/ai-memory\/list["']/,
        /browsePreAuthIp/,
        /requireSession\(\)/,
        "DELETE /api/ai-memory",
      );
    });

    it("ai-memory.ts: GET /api/ai-memory/list", () => {
      const code = stripComments(readRouteSource("ai-memory.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.get\(\s*["']\/api\/ai-memory\/list["']/,
        /r\.delete\(\s*["']\/api\/ai-memory\/:id["']/,
        /browsePreAuthIp/,
        /requireSession\(\)/,
        "/api/ai-memory/list",
      );
    });

    it("ai-memory.ts: DELETE /api/ai-memory/:id", () => {
      const code = stripComments(readRouteSource("ai-memory.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.delete\(\s*["']\/api\/ai-memory\/:id["']/,
        null,
        /browsePreAuthIp/,
        /requireSession\(\)/,
        "/api/ai-memory/:id",
      );
    });

    it("transcribe.ts: POST /api/transcribe", () => {
      const code = stripComments(readRouteSource("transcribe.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.post\(\s*["']\/api\/transcribe["']/,
        null,
        /rateLimitExpress\(\s*\{\s*key:\s*["']api:transcribe:ip["']/,
        /requireSession\(\)/,
        "/api/transcribe",
      );
    });

    it("push.ts: POST /api/push/register", () => {
      const code = stripComments(readRouteSource("push.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.post\(\s*["']\/api\/push\/register["']/,
        /r\.post\(\s*["']\/api\/push\/unregister["']/,
        /preAuthIpRateLimit/,
        /requireSession\(\)/,
        "/api/push/register",
      );
    });

    it("push.ts: POST /api/push/unregister", () => {
      const code = stripComments(readRouteSource("push.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.post\(\s*["']\/api\/push\/unregister["']/,
        /r\.post\(\s*["']\/api\/push\/send["']/,
        /preAuthIpRateLimit/,
        /requireSession\(\)/,
        "/api/push/unregister",
      );
    });

    // `/api/push/test` теж потребує pre-auth гейта, і саме тому, що
    // `requireSession()` стоїть там першим: до реордингу спільний
    // `r.use("/api/push", broadRateLimit)` різав безсесійний трафік на ВСІХ
    // push-роутах, `test` включно. Після реордингу сесія стала першою — тобто
    // 401 без `next()` — і `test` втратив той захист рівно так само, як
    // register/unregister. `send` лишається єдиним винятком нижче.
    it("push.ts: POST /api/push/test", () => {
      const code = stripComments(readRouteSource("push.ts"));
      assertPreAuthIpBeforeSession(
        code,
        /r\.post\(\s*["']\/api\/push\/test["']/,
        null,
        /preAuthIpRateLimit/,
        /requireSession\(\)/,
        "/api/push/test",
      );
    });
  });
});
