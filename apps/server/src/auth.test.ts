import { describe, it, expect, vi } from "vitest";

/**
 * Auth-конфіг не потребує реального Postgres для цього тесту — ми
 * перевіряємо тільки статичну конфігурацію (наявність плагінів, basePath,
 * emailAndPassword). DB-pool мокається на рівні модуля, тож
 * `betterAuth({ database: pool })` отримує stub без мережі.
 */
vi.mock("./db.js", () => {
  const pool = {
    query: vi.fn(),
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  return { default: pool, pool, query: pool.query, ensureSchema: vi.fn() };
});

const { auth } = await import("./auth.js");

describe("auth config — bearer plugin інтегрований у Better Auth", () => {
  /**
   * Мобільний Capacitor-shell ходить по Authorization: Bearer, а не
   * cookie. Без `bearer()` плагіна сервер не резолвитиме сесію з header-а
   * і shell буде розлогінений на кожен cold start — щось, що ми свідомо
   * виправляємо у цьому PR. Якщо хтось прибере плагін — тест кричить.
   */
  it("плагін з id='bearer' зареєстрований у options.plugins", () => {
    const options = (auth as unknown as { options: { plugins?: unknown[] } })
      .options;
    const plugins = Array.isArray(options.plugins) ? options.plugins : [];
    const ids = plugins
      .map((p) => (p as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string");
    expect(ids).toContain("bearer");
  });

  /**
   * Захист від випадкової зміни префіксу: `/api/auth` зашитий у
   * `apps/web/src/shared/lib/api/apiUrl.ts` (виняток у версіонуванні) і у
   * `apps/server/src/routes/auth.ts` (router path). Якщо basePath
   * зʼїде — веб/mobile-shell одразу побачать 404 на всіх auth-ендпоінтах.
   */
  it("basePath лишається '/api/auth'", () => {
    const options = (auth as unknown as { options: { basePath?: string } })
      .options;
    expect(options.basePath).toBe("/api/auth");
  });

  it("emailAndPassword увімкнений (ми не працюємо в OAuth-only режимі)", () => {
    const options = (
      auth as unknown as {
        options: { emailAndPassword?: { enabled?: boolean } };
      }
    ).options;
    expect(options.emailAndPassword?.enabled).toBe(true);
  });

  /**
   * `socialProviders.google` має вмикатися ТІЛЬКИ коли пара
   * `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` обидві задані.
   * У тестовому середовищі ці env-и порожні — тож конфіг має
   * стартувати без `socialProviders`, інакше Better Auth впав би
   * на старті з валідаційною помилкою.
   */
  it("без env-ів socialProviders НЕ передається у Better Auth", () => {
    const options = (
      auth as unknown as { options: { socialProviders?: unknown } }
    ).options;
    expect(options.socialProviders).toBeUndefined();
  });

  /**
   * H5 — `exp://` (Expo Go dev scheme) не повинен потрапляти у
   * `trustedOrigins` у production. Це не bound-до-аппки схема: будь-який
   * Expo Go застосунок на пристрої може її claim-ити, що відкриває OAuth
   * code / bearer interception. Дивись
   * `docs/security/hardening/H5-trusted-origins-exp-scheme.md`.
   */
  it("H5: trustedOrigins у production НЕ містять exp://", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    // Не задаємо BETTER_AUTH_TRUSTED_NATIVE_SCHEMES — перевіряємо саме
    // дефолти у проді. Інші prod-only env (encryption key) перевіряються у
    // `assertStartupEnv`, але `auth.ts` сам по собі читає їх лише через
    // encrypting-adapter factory — для статичного конфіг-чеку це не треба.
    try {
      const { auth: prodAuth } = await import("./auth.js");
      const options = (
        prodAuth as unknown as { options: { trustedOrigins?: string[] } }
      ).options;
      const origins = options.trustedOrigins ?? [];
      expect(origins).toContain("sergeant://");
      expect(origins).not.toContain("exp://");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("H5: у dev (NODE_ENV != production) trustedOrigins містять і sergeant://, і exp://", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    try {
      const { auth: devAuth } = await import("./auth.js");
      const options = (
        devAuth as unknown as { options: { trustedOrigins?: string[] } }
      ).options;
      const origins = options.trustedOrigins ?? [];
      expect(origins).toContain("sergeant://");
      expect(origins).toContain("exp://");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("H5: BETTER_AUTH_TRUSTED_NATIVE_SCHEMES override повністю замінює дефолти (включно з exp://)", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "BETTER_AUTH_TRUSTED_NATIVE_SCHEMES",
      "sergeant-staging://, custom-scheme://",
    );
    try {
      const { auth: stagingAuth } = await import("./auth.js");
      const options = (
        stagingAuth as unknown as { options: { trustedOrigins?: string[] } }
      ).options;
      const origins = options.trustedOrigins ?? [];
      expect(origins).toContain("sergeant-staging://");
      expect(origins).toContain("custom-scheme://");
      expect(origins).not.toContain("sergeant://");
      // Even у dev — override має пріоритет: якщо ops явно прибрали `exp://`
      // зі списку, ми не повертаємо його через "merge with defaults".
      expect(origins).not.toContain("exp://");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("із заданими GOOGLE_CLIENT_ID/SECRET вмикається google-провайдер", async () => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "GOCSPX-test-secret");
    try {
      const { auth: authWithGoogle } = await import("./auth.js");
      const options = (
        authWithGoogle as unknown as {
          options: {
            socialProviders?: {
              google?: { clientId?: string; clientSecret?: string };
            };
          };
        }
      ).options;
      expect(options.socialProviders?.google?.clientId).toBe(
        "test-client-id.apps.googleusercontent.com",
      );
      expect(options.socialProviders?.google?.clientSecret).toBe(
        "GOCSPX-test-secret",
      );
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("налаштовані sendResetPassword та emailVerification (Resend у рантаймі)", () => {
    const options = (
      auth as unknown as {
        options: {
          emailAndPassword?: { sendResetPassword?: unknown };
          emailVerification?: { sendVerificationEmail?: unknown };
        };
      }
    ).options;
    expect(typeof options.emailAndPassword?.sendResetPassword).toBe("function");
    expect(typeof options.emailVerification?.sendVerificationEmail).toBe(
      "function",
    );
  });

  /**
   * Перевіряємо, що `databaseHooks.user.{create,update}.before` пропускає payload
   * через `sanitizeUserImage`. Без цього регресія повертає 90+с зависання логіну
   * для юзерів з 19 КБ data:image у `user.image` (інцидент 2026-05-02).
   *
   * Тут ми не запускаємо реальний Better Auth — лише викликаємо hook напряму
   * як це робить `db/with-hooks.mjs`. Контракт: повертає `{ data }` де `image`
   * нулиться для data: URL, інакше пропускає без змін.
   */
  it("databaseHooks.user.create.before стрипає data: URL у image", async () => {
    const options = (
      auth as unknown as {
        options: {
          databaseHooks?: {
            user?: {
              create?: {
                before?: (
                  data: Record<string, unknown>,
                ) => Promise<{ data: Record<string, unknown> } | false | void>;
              };
            };
          };
        };
      }
    ).options;
    const before = options.databaseHooks?.user?.create?.before;
    expect(typeof before).toBe("function");
    const result = await before!({
      email: "test@example.com",
      name: "Тест",
      image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
    });
    expect(result).toBeTruthy();
    if (result && typeof result === "object" && "data" in result) {
      expect(result.data["image"]).toBeNull();
      expect(result.data["name"]).toBe("Тест");
    }
  });

  it("databaseHooks.user.update.before стрипає надмірно довгий URL", async () => {
    const options = (
      auth as unknown as {
        options: {
          databaseHooks?: {
            user?: {
              update?: {
                before?: (
                  data: Record<string, unknown>,
                ) => Promise<{ data: Record<string, unknown> } | false | void>;
              };
            };
          };
        };
      }
    ).options;
    const before = options.databaseHooks?.user?.update?.before;
    expect(typeof before).toBe("function");
    const longUrl = "https://example.com/" + "x".repeat(3000);
    const result = await before!({ image: longUrl });
    expect(result).toBeTruthy();
    if (result && typeof result === "object" && "data" in result) {
      expect(result.data["image"]).toBeNull();
    }
  });

  it("databaseHooks.user.update.before пропускає звичайний HTTPS URL", async () => {
    const options = (
      auth as unknown as {
        options: {
          databaseHooks?: {
            user?: {
              update?: {
                before?: (
                  data: Record<string, unknown>,
                ) => Promise<{ data: Record<string, unknown> } | false | void>;
              };
            };
          };
        };
      }
    ).options;
    const before = options.databaseHooks?.user?.update?.before;
    const url = "https://lh3.googleusercontent.com/a/AAcHTtdXyz=s96-c";
    const result = await before!({ image: url });
    expect(result).toBeTruthy();
    if (result && typeof result === "object" && "data" in result) {
      expect(result.data["image"]).toBe(url);
    }
  });

  /**
   * H3 — `databaseHooks.session.create.before` ріже `ipAddress` до /24
   * (IPv4) або /64 (IPv6) prefix-а. Без цього в `session.ipAddress` лежить
   * повний IP, який для нас не несе додаткової інформації, але є PII у
   * 30-денному запису. Закриває
   * `docs/security/hardening/H3-session-revoke-and-binding.md`.
   */
  it("H3: databaseHooks.session.create.before truncates ipAddress to /24 (IPv4)", async () => {
    const before = (
      auth as unknown as {
        options: {
          databaseHooks?: {
            session?: {
              create?: {
                before?: (
                  data: Record<string, unknown>,
                ) => Promise<{ data: Record<string, unknown> } | false | void>;
              };
            };
          };
        };
      }
    ).options.databaseHooks?.session?.create?.before;
    expect(typeof before).toBe("function");
    const result = await before!({
      id: "s-1",
      userId: "u-1",
      token: "t-1",
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0",
    });
    expect(result).toBeTruthy();
    if (result && typeof result === "object" && "data" in result) {
      expect(result.data["ipAddress"]).toBe("203.0.113.0/24");
      // userAgent зберігаємо повністю — він не PII у тому ж сенсі, що IP,
      // і потрібен буквально для UA-drift detection.
      expect(result.data["userAgent"]).toBe("Mozilla/5.0");
    }
  });

  it("H3: databaseHooks.session.create.before truncates ipAddress to /64 (IPv6)", async () => {
    const before = (
      auth as unknown as {
        options: {
          databaseHooks?: {
            session?: {
              create?: {
                before?: (
                  data: Record<string, unknown>,
                ) => Promise<{ data: Record<string, unknown> } | false | void>;
              };
            };
          };
        };
      }
    ).options.databaseHooks?.session?.create?.before;
    const result = await before!({
      id: "s-1",
      userId: "u-1",
      token: "t-1",
      ipAddress: "2001:db8::1",
    });
    expect(result).toBeTruthy();
    if (result && typeof result === "object" && "data" in result) {
      expect(result.data["ipAddress"]).toBe("2001:db8:0:0::/64");
    }
  });

  it("H3: databaseHooks.session.create.before — no-op коли ipAddress вже prefix", async () => {
    const before = (
      auth as unknown as {
        options: {
          databaseHooks?: {
            session?: {
              create?: {
                before?: (
                  data: Record<string, unknown>,
                ) => Promise<{ data: Record<string, unknown> } | false | void>;
              };
            };
          };
        };
      }
    ).options.databaseHooks?.session?.create?.before;
    // Якщо повторно прогнати ту ж сесію (наприклад через update path, що
    // інколи зачитує дані назад), не повинно бути розширення/пере-обрізки.
    // Наша імплементація повертає `void` коли значення вже у фінальному
    // вигляді — Better Auth тоді залишає payload як є.
    const result = await before!({
      id: "s-1",
      userId: "u-1",
      token: "t-1",
      ipAddress: "203.0.113.0/24",
    });
    expect(result).toBeUndefined();
  });

  it("H3: hooks.before примусово додає revokeOtherSessions=true для /change-password", async () => {
    const before = (
      auth as unknown as {
        options: { hooks?: { before?: unknown } };
      }
    ).options.hooks?.before;
    expect(typeof before).toBe("function");
    // Better Auth-міддлвара очікує MiddlewareInputContext. Передаємо
    // мінімальну форму, яку наш handler читає (`path`, `body`).
    const ctx = {
      path: "/change-password",
      body: { newPassword: "n", currentPassword: "c" } as Record<
        string,
        unknown
      >,
    };
    await (before as (input: unknown) => Promise<unknown>)(ctx);
    expect(ctx.body["revokeOtherSessions"]).toBe(true);
  });

  it("H3: hooks.before не чіпає інші endpoint-и", async () => {
    const before = (
      auth as unknown as {
        options: { hooks?: { before?: unknown } };
      }
    ).options.hooks?.before;
    const ctx = {
      path: "/sign-in/email",
      body: { email: "x@y.z", password: "p" } as Record<string, unknown>,
    };
    await (before as (input: unknown) => Promise<unknown>)(ctx);
    expect(ctx.body["revokeOtherSessions"]).toBeUndefined();
  });

  /**
   * PR-48 round-2 — session policy pinned до 7-денного hard-expiry з
   * 1-денним rolling refresh. Якщо хтось випадково повернеться до 30d
   * (старе значення) — тест відстрелить.
   * Audit-док: `docs/security/better-auth-audit-2026-05.md`. ADR-0017.
   */
  it("PR-48: session.expiresIn = 7 діб", () => {
    const options = (
      auth as unknown as {
        options: {
          session?: { expiresIn?: number; updateAge?: number };
        };
      }
    ).options;
    expect(options.session?.expiresIn).toBe(60 * 60 * 24 * 7);
    // Rolling refresh — 1 доба. Активний юзер ніколи не бачить logout.
    expect(options.session?.updateAge).toBe(60 * 60 * 24);
  });
});
