import { describe, expect, it } from "vitest";

/**
 * Розширене покриття `parseDeepLink()` — edge-кейси, які `src/index.test.ts`
 * не тестує (trailing slash, multi-segment paths, URL-encoded chars,
 * empty / root paths тощо). Крадькома від нативного Capacitor-рантайму:
 * сама функція не тягне `@capacitor/app`, тому тест живе в node-env без
 * будь-яких моків.
 */

import {
  ALLOWED_DEEP_LINK_PATH_PREFIXES,
  DEEP_LINK_HTTPS_HOSTS,
  isSafeShellPath,
  parseDeepLink,
} from "../index.js";

describe("parseDeepLink — розширені edge-кейси", () => {
  describe("валідні варіанти", () => {
    it.each([
      ["com.sergeant.shell://chat", "/chat"],
      ["com.sergeant.shell:///chat", "/chat"],
      ["com.sergeant.shell://nutrition/scan", "/nutrition/scan"],
      [
        "com.sergeant.shell://finyk/transactions/123",
        "/finyk/transactions/123",
      ],
    ])("витягає path з %s → %s", (url, expected) => {
      expect(parseDeepLink(url)).toBe(expected);
    });

    it("зберігає trailing slash як окремий сегмент (`/chat/`)", () => {
      // React Router трактує `/chat` і `/chat/` трохи по-різному
      // (trailing slash → матч по `children` префіксу у деяких
      // конфігураціях). Навмисно НЕ стрипаємо — не наша справа
      // інтерпретувати, це робота роутера на web-стороні.
      expect(parseDeepLink("com.sergeant.shell://chat/")).toBe("/chat/");
    });

    it("зберігає query string як є", () => {
      expect(parseDeepLink("com.sergeant.shell://chat?q=protein")).toBe(
        "/chat?q=protein",
      );
    });

    it("зберігає кілька query-параметрів", () => {
      expect(
        parseDeepLink("com.sergeant.shell://chat?q=protein&sort=date&n=5"),
      ).toBe("/chat?q=protein&sort=date&n=5");
    });

    it("зберігає URL-encoded символи у query без повторного декодування", () => {
      // Якщо b щось деклогодилось, `?q=hello world` ламав би парсер
      // query-string React Router-а на пробілі.
      expect(parseDeepLink("com.sergeant.shell://chat?q=hello%20world")).toBe(
        "/chat?q=hello%20world",
      );
    });

    it("зберігає fragment (`#frag`)", () => {
      expect(parseDeepLink("com.sergeant.shell://routine#habits")).toBe(
        "/routine#habits",
      );
    });

    it("зберігає fragment разом з query (`?x=1#frag`)", () => {
      expect(parseDeepLink("com.sergeant.shell://routine?x=1#habits")).toBe(
        "/routine?x=1#habits",
      );
    });

    it("віддає `/` для порожнього path-у (`com.sergeant.shell://`)", () => {
      // Android `am start -d com.sergeant.shell://` технічно валідний —
      // трактуємо як «відкрий home».
      expect(parseDeepLink("com.sergeant.shell://")).toBe("/");
    });

    it("нормалізує потрійний слеш (`com.sergeant.shell:///`) у `/`", () => {
      expect(parseDeepLink("com.sergeant.shell:///")).toBe("/");
    });

    it("зберігає тільки query без path (`?x=1`)", () => {
      expect(parseDeepLink("com.sergeant.shell://?x=1")).toBe("/?x=1");
    });

    it("зберігає тільки fragment без path (`#frag`)", () => {
      expect(parseDeepLink("com.sergeant.shell://#frag")).toBe("/#frag");
    });
  });

  describe("відхилення чужих URL (повертає `null`)", () => {
    it.each([
      "https://sergeant.app/home", // не наш домен
      "http://sergeant.vercel.app/home", // http — явно відхиляємо
      "https://evil.com/home",
      "https://sergeant.vercel.app.evil.com/home", // suffix-attack
      "https://evil.com.sergeant.vercel.app@phish.com/home", // userinfo-injection (`host` = phish.com)
      "foo://home",
      "com.sergeant.app://home", // RN bundle id — навмисно інший
      "com.sergeant.shel://home", // typo в схемі
      "com.sergeant.shells://home", // надлишкова `s`
      "COM.SERGEANT.SHELL://home", // case-sensitive
      "//com.sergeant.shell://home", // префіксний noise
      " com.sergeant.shell://home", // leading whitespace
      "",
      "about:blank",
      "javascript:alert(1)", // захист від injection через intent
    ])("повертає `null` для `%s`", (url) => {
      expect(parseDeepLink(url)).toBeNull();
    });
  });

  describe("HTTPS Universal / App Links", () => {
    it("експонує список дозволених хостів для синхронізації з manifest / AASA", () => {
      // Smoke-guard: якщо хтось перейменує чи винесе список, тест-файл
      // fail-ить відразу і нагадує оновити AndroidManifest + AASA.
      expect(DEEP_LINK_HTTPS_HOSTS).toEqual([
        "sergeant.vercel.app",
        "sergeant.2dmanager.com.ua",
      ]);
    });

    it.each([
      ["https://sergeant.vercel.app/chat", "/chat"],
      ["https://sergeant.2dmanager.com.ua/chat", "/chat"],
      ["https://sergeant.vercel.app/nutrition/scan", "/nutrition/scan"],
      [
        "https://sergeant.2dmanager.com.ua/finyk/transactions/123",
        "/finyk/transactions/123",
      ],
    ])("витягає path з %s → %s", (url, expected) => {
      expect(parseDeepLink(url)).toBe(expected);
    });

    it("повертає `/` для кореня HTTPS URL (без path)", () => {
      expect(parseDeepLink("https://sergeant.vercel.app")).toBe("/");
      expect(parseDeepLink("https://sergeant.vercel.app/")).toBe("/");
    });

    it("зберігає trailing slash у HTTPS варіанті (`/chat/`)", () => {
      expect(parseDeepLink("https://sergeant.vercel.app/chat/")).toBe("/chat/");
    });

    it("зберігає query-string у HTTPS варіанті", () => {
      expect(
        parseDeepLink("https://sergeant.vercel.app/chat?q=protein&n=5"),
      ).toBe("/chat?q=protein&n=5");
    });

    it("зберігає URL-encoded символи у query HTTPS варіанті", () => {
      expect(
        parseDeepLink("https://sergeant.vercel.app/chat?q=hello%20world"),
      ).toBe("/chat?q=hello%20world");
    });

    it("зберігає fragment у HTTPS варіанті", () => {
      expect(
        parseDeepLink("https://sergeant.2dmanager.com.ua/routine#habits"),
      ).toBe("/routine#habits");
    });

    it("приймає host у різному регістрі (case-insensitive)", () => {
      // Android Intent іноді нормалізує host у lowercase, iOS — нерідко
      // зберігає original-case. `new URL()` тримає host як є, тож порівняння
      // обовʼязково має бути case-insensitive (RFC 3986 §3.2.2).
      expect(parseDeepLink("https://Sergeant.Vercel.App/chat")).toBe("/chat");
      expect(parseDeepLink("https://SERGEANT.VERCEL.APP/chat")).toBe("/chat");
    });

    it("ігнорує :port як частину host-matching — :443 не губить match", () => {
      // Default port 443 для https — `new URL().host` повертає без `:443`.
      expect(parseDeepLink("https://sergeant.vercel.app:443/chat")).toBe(
        "/chat",
      );
    });

    it("ненаш HTTPS-порт (з non-default) трактуємо як інший host", () => {
      // `new URL("https://sergeant.vercel.app:8443/x").host` = `sergeant.vercel.app:8443`.
      // Для App Links це нерелевантно (Android не бʼє по port), але з точки
      // зору нашого коду — це інший host, strict-reject.
      expect(parseDeepLink("https://sergeant.vercel.app:8443/chat")).toBeNull();
    });

    it("відхиляє http:// навіть для нашого host (ніяких cleartext deep link-ів)", () => {
      expect(parseDeepLink("http://sergeant.vercel.app/chat")).toBeNull();
      expect(parseDeepLink("http://sergeant.2dmanager.com.ua/chat")).toBeNull();
    });

    it("відхиляє суб-домени нашого домена як fail-closed", () => {
      // Якщо колись зʼявиться `api.sergeant.vercel.app` — це має бути
      // свідомо додано до DEEP_LINK_HTTPS_HOSTS, а не мовчки прийнято.
      expect(parseDeepLink("https://api.sergeant.vercel.app/chat")).toBeNull();
      expect(parseDeepLink("https://www.sergeant.vercel.app/chat")).toBeNull();
    });

    it("відхиляє malformed URL (invalid constructor input)", () => {
      expect(parseDeepLink("https://")).toBeNull();
      expect(parseDeepLink("https:///chat")).toBeNull(); // empty host
    });
  });

  describe("M19 — sanitization vs unsafe schemes / unknown prefixes", () => {
    // ── unsafe URL-схеми, інжектовані у query/fragment ───────────────
    // Атакер шле intent типу `com.sergeant.shell://?next=javascript:alert(1)`
    // або `com.sergeant.shell://chat?nav=data:text/html,<script>` — ціль
    // не shell-ова навігація, а просочити XSS-схему у downstream
    // `<a href={next}>` чи `navigate(...)` після bridge-а. `parseDeepLink()`
    // має відрізати такий path до того, як він покине нативний бік.
    it.each([
      "com.sergeant.shell://?next=javascript:alert(1)",
      "com.sergeant.shell://chat?next=javascript:alert(1)",
      "com.sergeant.shell://chat?next=JaVaScRiPt:alert(1)",
      "com.sergeant.shell://chat?next=data:text/html,<script>alert(1)</script>",
      "com.sergeant.shell://chat?next=vbscript:msgbox(1)",
      "com.sergeant.shell://chat#javascript:alert(1)",
      "com.sergeant.shell://chat?a=1&b=javascript:alert(1)",
      "https://sergeant.vercel.app/?next=javascript:alert(1)",
      "https://sergeant.vercel.app/chat?next=javascript:alert(1)",
      "https://sergeant.vercel.app/chat#javascript:alert(1)",
    ])("повертає `null` для unsafe-схеми у `%s`", (url) => {
      expect(parseDeepLink(url)).toBeNull();
    });

    // ── невідомі top-level префікси ──────────────────────────────────
    // Закриваємо vector-а «redirect у будь-який path, який ми колись
    // приймемо за роут». Наприклад `/admin/...` чи `/internal/...` —
    // якщо такі шляхи зʼявляться у майбутньому, мають бути додані у
    // `ALLOWED_DEEP_LINK_PATH_PREFIXES` свідомо.
    it.each([
      ["com.sergeant.shell://admin/users", "/admin/users"],
      ["com.sergeant.shell://internal/health", "/internal/health"],
      ["com.sergeant.shell://api/v1/me", "/api/v1/me"],
      ["com.sergeant.shell://random", "/random"],
      ["https://sergeant.vercel.app/admin/users", "/admin/users"],
      ["https://sergeant.vercel.app/random", "/random"],
    ])("повертає `null` для path-у поза whitelist-ом (`%s`)", (url) => {
      expect(parseDeepLink(url)).toBeNull();
    });

    // ── позитивні приклади для відомих префіксів ─────────────────────
    it.each([
      ["com.sergeant.shell://sign-in", "/sign-in"],
      ["com.sergeant.shell://welcome", "/welcome"],
      ["com.sergeant.shell://chat?q=hello", "/chat?q=hello"],
      [
        "com.sergeant.shell://auth/callback?code=xyz",
        "/auth/callback?code=xyz",
      ],
      [
        "com.sergeant.shell://oauth/callback#token=abc",
        "/oauth/callback#token=abc",
      ],
      ["https://sergeant.vercel.app/finyk/transactions", "/finyk/transactions"],
    ])("приймає known-prefix path (`%s`)", (url, expected) => {
      expect(parseDeepLink(url)).toBe(expected);
    });

    // ── корінь — окремий допустимий випадок ──────────────────────────
    it("приймає `/` як top-level home (порожній path-у)", () => {
      expect(parseDeepLink("com.sergeant.shell://")).toBe("/");
      expect(parseDeepLink("com.sergeant.shell:///")).toBe("/");
      expect(parseDeepLink("https://sergeant.vercel.app/")).toBe("/");
    });
  });
});

describe("isSafeShellPath — defensive sanitiser", () => {
  it("експонує whitelist префіксів (synced з KNOWN_PATHS у appPaths.ts)", () => {
    // Smoke-guard: якщо хтось додає/видаляє новий top-level маршрут на
    // web-стороні — тест fail-ить і нагадує оновити цей список (інакше
    // deep-link просто перестане працювати в shell-і).
    expect(ALLOWED_DEEP_LINK_PATH_PREFIXES).toContain("/sign-in");
    expect(ALLOWED_DEEP_LINK_PATH_PREFIXES).toContain("/welcome");
    expect(ALLOWED_DEEP_LINK_PATH_PREFIXES).toContain("/chat");
    expect(ALLOWED_DEEP_LINK_PATH_PREFIXES).toContain("/finyk");
    expect(ALLOWED_DEEP_LINK_PATH_PREFIXES).toContain("/auth");
    // freeze-guard: масив імморталізований, щоб ніхто випадково не
    // мутував його у production-коді.
    expect(Object.isFrozen(ALLOWED_DEEP_LINK_PATH_PREFIXES)).toBe(true);
  });

  it.each([
    "/",
    "/chat",
    "/chat/",
    "/chat?q=1",
    "/chat#frag",
    "/finyk/transactions/123",
    "/auth/callback?code=abc",
    "/oauth/callback#token=xyz",
  ])("повертає true для valid path-у `%s`", (path) => {
    expect(isSafeShellPath(path)).toBe(true);
  });

  it.each([
    // не починається з `/`
    "",
    "chat",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.com/chat",
    // unsafe-схема у будь-якій позиції
    "/?next=javascript:alert(1)",
    "/chat?next=javascript:alert(1)",
    "/chat?next=JAVASCRIPT:alert(1)",
    "/chat?a=1&next=data:text/html,xx",
    "/chat?a=1&b=vbscript:msg",
    "/chat#javascript:alert(1)",
    // path поза whitelist-ом
    "/admin",
    "/admin/users",
    "/internal/health",
    "/random",
    "/api/v1/me",
  ])("повертає false для unsafe / поза-whitelist path-у `%s`", (path) => {
    expect(isSafeShellPath(path)).toBe(false);
  });

  it("повертає false для не-string вводу", () => {
    // Захист від `window.__sergeantShellNavigate(undefined)` від
    // зломаного нативного коду.
    expect(isSafeShellPath(undefined as unknown as string)).toBe(false);
    expect(isSafeShellPath(null as unknown as string)).toBe(false);
    expect(isSafeShellPath(42 as unknown as string)).toBe(false);
  });
});
