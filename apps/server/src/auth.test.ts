import { describe, it, expect, vi } from "vitest";

/**
 * Auth-конфіг не потребує реального Postgres для цього тесту — ми
 * перевіряємо тільки статичну конфігурацію (наявність плагінів, basePath,
 * emailAndPassword). DB-pool мокається на рівні модуля, тож
 * `betterAuth({ database: pool })` отримує stub без мережі.
 */
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
}));

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

vi.mock("./obs/logger.js", () => ({ logger: loggerMock }));

const { auth } = await import("./auth.js");

type DeleteUserHooks = {
  options: {
    user?: {
      deleteUser?: {
        enabled?: boolean;
        beforeDelete?: (
          user: { id: string; email: string },
          request?: Request,
        ) => Promise<void>;
      };
    };
  };
};

/**
 * `POST /api/auth/delete-user` мусить лишатись ЗАКРИТИМ.
 *
 * До появи 30-денного вікна (спека
 * `docs/work/specs/user-deletion-grace-window.md`) цей ендпоінт БУВ живим
 * шляхом видалення: хук `beforeDelete` кликав `deleteUserData`, і акаунт
 * зникав одразу. З вікном шлях переїхав у `DELETE /api/me`
 * (`routes/me.ts`) — той лише СТАВИТЬ мітку `deletion_requested_at`, а
 * незворотну частину через `ACCOUNT_DELETION_GRACE_DAYS` днів виконує
 * `AccountDeletionPoller`.
 *
 * Пін на `enabled: false` — не «тест під код». Доки ендпоінт Better Auth
 * відкритий, він видаляє акаунт НЕГАЙНО і повз вікно, тобто тихо скасовує
 * всю фічу: людина, яка передумала, не мала б куди повертатись.
 *
 * Другий пін — що хука немає ВЗАГАЛІ. Хук тут не рятує: Better Auth після
 * `beforeDelete` БЕЗУМОВНО виконує власний `internalAdapter.deleteUser`
 * (`dist/api/routes/update-user.mjs`), тож єдиним способом зупинити
 * видалення було б кинути помилку на успішному шляху. Без цього піна
 * наступний «полагодить» вікно, повернувши хук назад.
 *
 * Де перевіряється те, що тримає планку ТЕПЕР (тут не дублюємо):
 * пароль і свіжість сесії — `routes/me.delete.route.test.ts`
 * (§ «DELETE /api/me»); мітка й скасування — `modules/me/dataRights.test.ts`;
 * добивання після вікна — `modules/me/deletionPoller.test.ts`.
 */
describe("auth config — user.deleteUser закритий на користь вікна скасування", () => {
  const hooks = () =>
    (auth as unknown as DeleteUserHooks).options.user?.deleteUser;

  it("deleteUser вимкнений, тож негайного видалення повз вікно немає", () => {
    expect(hooks()?.enabled).toBe(false);
  });

  it("beforeDelete-хука немає — він не здатен зупинити видалення", () => {
    expect(hooks()?.beforeDelete).toBeUndefined();
  });
});

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
      // sec-08: у проді `sergeant://` теж НЕ довіряємо за замовчуванням
      // (RN-контур на паузі, ADR-0094) — явне ввімкнення лише через
      // BETTER_AUTH_TRUSTED_NATIVE_SCHEMES.
      expect(origins).not.toContain("sergeant://");
      expect(origins).not.toContain("exp://");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("sec-08: у production BETTER_AUTH_TRUSTED_NATIVE_SCHEMES=sergeant:// явно вмикає схему", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_TRUSTED_NATIVE_SCHEMES", "sergeant://");
    try {
      const { auth: prodAuth } = await import("./auth.js");
      const options = (
        prodAuth as unknown as { options: { trustedOrigins?: string[] } }
      ).options;
      expect(options.trustedOrigins ?? []).toContain("sergeant://");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("ws-11: trustedOrigins у production НЕ містять localhost-origins", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    try {
      const { auth: prodAuth } = await import("./auth.js");
      const options = (
        prodAuth as unknown as { options: { trustedOrigins?: string[] } }
      ).options;
      const origins = options.trustedOrigins ?? [];
      // Audit 2026-06-11 ws-11: SameSite=None cookies + /api/auth/* поза
      // CSRF-guard-ом — сторінка на localhost жертви не повинна проходити
      // origin-check проти прод-API.
      expect(origins).not.toContain("http://localhost:5000");
      expect(origins).not.toContain("http://localhost:5173");
      expect(origins).not.toContain("http://localhost:8081");
      // Apple callback-origin лишається завжди.
      expect(origins).toContain("https://appleid.apple.com");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("ws-11: у dev trustedOrigins містять localhost dev-origins", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    try {
      const { auth: devAuth } = await import("./auth.js");
      const options = (
        devAuth as unknown as { options: { trustedOrigins?: string[] } }
      ).options;
      const origins = options.trustedOrigins ?? [];
      expect(origins).toContain("http://localhost:5173");
      expect(origins).toContain("http://localhost:8081");
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

  it("Apple провайдер вимкнений без повного квартета APPLE_* env-ів (3 з 4)", async () => {
    vi.resetModules();
    vi.stubEnv("APPLE_CLIENT_ID", "com.sergeant.web");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123456");
    vi.stubEnv("APPLE_KEY_ID", "KEY1234567");
    // APPLE_PRIVATE_KEY missing → провайдер не реєструється
    try {
      const { auth: authNoApple } = await import("./auth.js");
      const options = (
        authNoApple as unknown as {
          options: { socialProviders?: { apple?: unknown } };
        }
      ).options;
      expect(options.socialProviders?.apple).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("Apple провайдер з malformed PRIVATE_KEY логує помилку і не реєструється (fail-open)", async () => {
    vi.resetModules();
    vi.stubEnv("APPLE_CLIENT_ID", "com.sergeant.web");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123456");
    vi.stubEnv("APPLE_KEY_ID", "KEY1234567");
    vi.stubEnv("APPLE_PRIVATE_KEY", "not-a-valid-pkcs8-key");
    try {
      const { auth: authBadApple } = await import("./auth.js");
      const options = (
        authBadApple as unknown as {
          options: { socialProviders?: { apple?: unknown } };
        }
      ).options;
      // Сервер стартує без Apple провайдера; помилка генерації client_secret
      // логнута через `logger.error`. Краще, ніж crash на boot.
      expect(options.socialProviders?.apple).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("trustedOrigins завжди містять https://appleid.apple.com для Apple OAuth callback", () => {
    const options = (
      auth as unknown as { options: { trustedOrigins?: string[] } }
    ).options;
    expect(options.trustedOrigins).toContain("https://appleid.apple.com");
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

  /**
   * Другий бік тієї ж пари: `/change-password` покриває `hooks.before`
   * вище, а `/reset-password` — тільки цей прапорець (Better Auth дефолтить
   * його у `false`). Без нього вкрадена сесія переживає скидання пароля до
   * кінця 7-денного TTL.
   */
  it("emailAndPassword.revokeSessionsOnPasswordReset увімкнений", () => {
    const options = (
      auth as unknown as {
        options: {
          emailAndPassword?: { revokeSessionsOnPasswordReset?: boolean };
        };
      }
    ).options;
    expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
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
   * Audit-док: `docs/governance/security/better-auth-audit-2026-05.md`. ADR-0017.
   */
  /**
   * `ALLOWED_ORIGINS` — comma-separated ops-override для `trustedOrigins`,
   * додається поверх дефолтного списку (не замінює його, на відміну від
   * `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES`). Порожні записи між комами
   * відкидаються, пробіли навколо значення обрізаються.
   */
  it("ALLOWED_ORIGINS додає власні origin-и до trustedOrigins, тримуючи пробіли/порожні записи", async () => {
    vi.resetModules();
    vi.stubEnv(
      "ALLOWED_ORIGINS",
      "https://custom.example.com, https://second.example.com,,",
    );
    try {
      const { auth: authWithAllowed } = await import("./auth.js");
      const options = (
        authWithAllowed as unknown as {
          options: { trustedOrigins?: string[] };
        }
      ).options;
      const origins = options.trustedOrigins ?? [];
      expect(origins).toContain("https://custom.example.com");
      expect(origins).toContain("https://second.example.com");
      // Apple callback-origin і нативні схеми лишаються — ALLOWED_ORIGINS
      // тільки додає, не замінює.
      expect(origins).toContain("https://appleid.apple.com");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("без ALLOWED_ORIGINS trustedOrigins не містить сторонніх origin-ів", () => {
    const options = (
      auth as unknown as { options: { trustedOrigins?: string[] } }
    ).options;
    const origins = options.trustedOrigins ?? [];
    expect(origins).not.toContain("https://custom.example.com");
  });

  /**
   * `getAdvancedCookieOptions()` — SameSite=None/Secure вмикається лише коли
   * base URL API — HTTPS (типово прод) і `BETTER_AUTH_CROSS_SITE_COOKIES`
   * не виставлений у `"0"`. Без цього крос-сайтовий фронт (Vercel) не зміг
   * би тримати сесію: браузер відкидає SameSite=Lax cookie з іншого origin-у.
   */
  it("advanced.useSecureCookies вмикається, коли BETTER_AUTH_URL — https", async () => {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_URL", "https://api.example.com");
    try {
      const { auth: authHttps } = await import("./auth.js");
      const options = (
        authHttps as unknown as {
          options: {
            advanced?: {
              useSecureCookies?: boolean;
              defaultCookieAttributes?: { sameSite?: string; secure?: boolean };
            };
          };
        }
      ).options;
      expect(options.advanced?.useSecureCookies).toBe(true);
      expect(options.advanced?.defaultCookieAttributes?.sameSite).toBe("none");
      expect(options.advanced?.defaultCookieAttributes?.secure).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("advanced відсутній, коли BETTER_AUTH_CROSS_SITE_COOKIES=0 навіть на https base URL", async () => {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_URL", "https://api.example.com");
    vi.stubEnv("BETTER_AUTH_CROSS_SITE_COOKIES", "0");
    try {
      const { auth: authOptOut } = await import("./auth.js");
      const options = (
        authOptOut as unknown as { options: { advanced?: unknown } }
      ).options;
      expect(options.advanced).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("advanced відсутній для http (локальний dev) base URL", () => {
    // Default test env (no BETTER_AUTH_URL стаб) резолвиться у
    // `http://localhost:${PORT}` через getBaseURL() — не https.
    const options = (auth as unknown as { options: { advanced?: unknown } })
      .options;
    expect(options.advanced).toBeUndefined();
  });

  /**
   * Регресійний якір. `user.changeEmail` не існував у конфізі взагалі, а
   * `PersonalInfoSection` уже викликав `POST /api/auth/change-email` — Better
   * Auth першим рядком хендлера (`update-user.ts`) перевіряє саме цей прапорець
   * і повертав `400 CHANGE_EMAIL_DISABLED`. Кнопка «Змінити» у профілі не
   * працювала жодного разу. Юніт-тести профілю це не ловили, бо `changeEmail`
   * там замоканий — тому контракт стережеться саме тут, на боці сервера.
   */
  it("user.changeEmail увімкнений — інакше зміна email у профілі 400-ить", () => {
    const options = (
      auth as unknown as {
        options: {
          user?: {
            changeEmail?: {
              enabled?: boolean;
              updateEmailWithoutVerification?: boolean;
              sendChangeEmailConfirmation?: unknown;
            };
          };
        };
      }
    ).options;
    expect(options.user?.changeEmail?.enabled).toBe(true);
    // Без цього прапорця непідтверджений юзер (переважна більшість бази до
    // H6-sweep) не може змінити адресу взагалі: гілка `canSendConfirmation`
    // вимагає `emailVerified === true`, і Better Auth падає у
    // "Verification email isn't enabled".
    expect(options.user?.changeEmail?.updateEmailWithoutVerification).toBe(
      true,
    );
    // Підтверджений юзер отримує лист на СТАРУ адресу — без цього колбека
    // Better Auth мовчки пропускає крок підтвердження власника.
    expect(typeof options.user?.changeEmail?.sendChangeEmailConfirmation).toBe(
      "function",
    );
  });

  /**
   * `emailVerification.sendVerificationEmail` — єдиний канал, через який
   * користувач взагалі може підтвердити пошту (H6). Якщо колбек зникне,
   * `POST /api/auth/send-verification-email` почне віддавати
   * `VERIFICATION_EMAIL_NOT_ENABLED`, а кнопка «Надіслати» у профілі — тост
   * помилки.
   */
  it("emailVerification: sendOnSignUp + колбек надсилання на місці", () => {
    const options = (
      auth as unknown as {
        options: {
          emailVerification?: {
            sendOnSignUp?: boolean;
            sendVerificationEmail?: unknown;
          };
        };
      }
    ).options;
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    expect(typeof options.emailVerification?.sendVerificationEmail).toBe(
      "function",
    );
  });

  /**
   * Web-origin, на який ми самі шлемо `callbackURL` у листах, мусить бути у
   * `trustedOrigins`: Better Auth проганяє цей параметр через `originCheck` і
   * 403-ить усе, чого немає у списку. Розʼїзд означав би, що кожен клік у
   * листі впирається у 403 замість підтвердження.
   */
  it("trustedOrigins містять web-origin із WEB_APP_URL", async () => {
    vi.resetModules();
    vi.stubEnv("WEB_APP_URL", "https://app.example.com");
    try {
      const { auth: scopedAuth } = await import("./auth.js");
      const options = (
        scopedAuth as unknown as { options: { trustedOrigins?: string[] } }
      ).options;
      expect(options.trustedOrigins ?? []).toContain("https://app.example.com");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

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

/**
 * sec-08 (аудит 2026-10-01): нативний auth-контур не має працювати в проді
 * при паузі мобільного (ADR-0094). Два вектори:
 *  - `expo()` плагін додає анонімний `GET /api/auth/expo-authorization-proxy`:
 *    open redirect + підписана `state`-кука зі значенням з query (login CSRF);
 *  - довірена схема `sergeant://` приймається як `redirectTo` скидання пароля.
 * `bearer()` не чіпаємо: його використовує Capacitor-shell (mobile-shell).
 */
describe("auth config — sec-08: нативний контур вимкнений у production", () => {
  const PROXY_URL =
    "http://localhost:3000/api/auth/expo-authorization-proxy" +
    "?authorizationURL=" +
    encodeURIComponent("https://evil.example/phish?state=ATTACKER_STATE_123");

  type AuthLike = {
    handler: (req: Request) => Promise<Response>;
    options: { plugins?: unknown[] };
  };

  const pluginIds = (a: AuthLike) =>
    (a.options.plugins ?? [])
      .map((p) => (p as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string");

  const loadAuth = async (env: Record<string, string>): Promise<AuthLike> => {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const mod = await import("./auth.js");
    return mod.auth as unknown as AuthLike;
  };

  const cleanup = () => {
    vi.unstubAllEnvs();
    vi.resetModules();
  };

  it("production без прапорця: expo() не підключений, bearer() лишається", async () => {
    try {
      const prodAuth = await loadAuth({ NODE_ENV: "production" });
      expect(pluginIds(prodAuth)).not.toContain("expo");
      expect(pluginIds(prodAuth)).toContain("bearer");
    } finally {
      cleanup();
    }
  });

  it("production: GET /expo-authorization-proxy -> 404, без Location і Set-Cookie", async () => {
    try {
      const prodAuth = await loadAuth({ NODE_ENV: "production" });
      const res = await prodAuth.handler(new Request(PROXY_URL));
      expect(res.status).toBe(404);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("set-cookie")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("production: disabledPaths містить і /verify-password (sec-10), і проксі (sec-08)", async () => {
    // Два PR задавали `disabledPaths` окремо; spread одного тихо перезаписував
    // список іншого саме в production, а test-env (expo увімкнено) цього не
    // бачив. Пін продового складу і 404 на обох маршрутах.
    try {
      const prodAuth = (await loadAuth({
        NODE_ENV: "production",
      })) as AuthLike & {
        options: { disabledPaths?: string[] };
      };
      expect(prodAuth.options.disabledPaths).toEqual(
        expect.arrayContaining([
          "/verify-password",
          "/expo-authorization-proxy",
        ]),
      );
      const res = await prodAuth.handler(
        new Request("http://localhost:3000/api/auth/verify-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: "x" }),
        }),
      );
      expect(res.status).toBe(404);
    } finally {
      cleanup();
    }
  });

  it("production: явне AUTH_EXPO_PLUGIN_ENABLED=false теж дає 404", async () => {
    try {
      const prodAuth = await loadAuth({
        NODE_ENV: "production",
        AUTH_EXPO_PLUGIN_ENABLED: "false",
      });
      const res = await prodAuth.handler(new Request(PROXY_URL));
      expect(res.status).toBe(404);
    } finally {
      cleanup();
    }
  });

  it("production + AUTH_EXPO_PLUGIN_ENABLED=true: плагін підключається (явне ввімкнення працює)", async () => {
    try {
      const prodAuth = await loadAuth({
        NODE_ENV: "production",
        AUTH_EXPO_PLUGIN_ENABLED: "true",
      });
      expect(pluginIds(prodAuth)).toContain("expo");
    } finally {
      cleanup();
    }
  });

  it("development без прапорця: expo() увімкнений, apps/mobile працює локально", async () => {
    try {
      const devAuth = await loadAuth({ NODE_ENV: "development" });
      expect(pluginIds(devAuth)).toContain("expo");
      expect(pluginIds(devAuth)).toContain("bearer");
    } finally {
      cleanup();
    }
  });

  /**
   * Саме цю перевірку виконує `originCheck` для `redirectTo` скидання пароля
   * й OAuth `callbackURL`. Через `auth.handler` її не проганяємо: під vitest
   * Better Auth вмикає `skipOriginCheck` (`isTest()` читає NODE_ENV при
   * завантаженні модуля), тож HTTP-тест тут дав би хибний «пропустив».
   */
  it("production: redirectTo=sergeant://reset-password НЕ довірений, https-origin з ALLOWED_ORIGINS довірений", async () => {
    try {
      const prodAuth = (await loadAuth({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://app.example.com",
      })) as unknown as {
        $context: Promise<{
          isTrustedOrigin: (
            url: string,
            opts?: { allowRelativePaths?: boolean },
          ) => boolean;
        }>;
      };
      const ctx = await prodAuth.$context;
      const opts = { allowRelativePaths: true };
      expect(ctx.isTrustedOrigin("sergeant://reset-password", opts)).toBe(
        false,
      );
      expect(ctx.isTrustedOrigin("exp://reset-password", opts)).toBe(false);
      expect(
        ctx.isTrustedOrigin("https://app.example.com/reset-password", opts),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("development: sergeant:// лишається довіреним (apps/mobile локально)", async () => {
    try {
      const devAuth = (await loadAuth({
        NODE_ENV: "development",
      })) as unknown as {
        $context: Promise<{
          isTrustedOrigin: (
            url: string,
            opts?: { allowRelativePaths?: boolean },
          ) => boolean;
        }>;
      };
      const ctx = await devAuth.$context;
      expect(
        ctx.isTrustedOrigin("sergeant://reset-password", {
          allowRelativePaths: true,
        }),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });
});
