/**
 * Last validated: 2026-08-02
 * Status: Active
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * `env` читається на рівні модуля через getter-и, тому кожен кейс міняє
 * `process.env` і перевантажує модуль. Реального Better Auth / Postgres тут
 * немає — це чистий unit на побудову посилання.
 */
async function loadModule(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("./verificationMail.js");
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

const BETTER_AUTH_URL_KEYS = {
  WEB_APP_URL: undefined,
  ALLOWED_ORIGINS: undefined,
  BETTER_AUTH_URL: undefined,
};

describe("getWebAppOrigin — пріоритет джерел", () => {
  it("WEB_APP_URL перемагає ALLOWED_ORIGINS", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      WEB_APP_URL: "https://app.example.com",
      ALLOWED_ORIGINS: "https://other.example.com",
    });
    expect(m.getWebAppOrigin()).toBe("https://app.example.com");
  });

  it("без WEB_APP_URL бере перший http(s)-запис ALLOWED_ORIGINS", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      ALLOWED_ORIGINS: "https://app.example.com, https://second.example.com",
    });
    expect(m.getWebAppOrigin()).toBe("https://app.example.com");
  });

  /**
   * Deep-link-схеми стоять першими у `trustedOrigins` мобільного флоу і легко
   * опиняються першими і тут. Клік із поштового клієнта на десктопі по
   * `sergeant://` нікуди не веде, тож такі записи пропускаємо.
   */
  it("пропускає кастомні схеми (sergeant://, exp://)", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      ALLOWED_ORIGINS: "sergeant://, exp://, https://app.example.com",
    });
    expect(m.getWebAppOrigin()).toBe("https://app.example.com");
  });

  it("зрізає хвостовий слеш", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      WEB_APP_URL: "https://app.example.com/",
    });
    expect(m.getWebAppOrigin()).toBe("https://app.example.com");
  });

  it("падає назад на BETTER_AUTH_URL, коли web-origin ніде не заданий", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      BETTER_AUTH_URL: "https://api.example.com",
    });
    expect(m.getWebAppOrigin()).toBe("https://api.example.com");
  });

  it("у чистому dev-оточенні дає Vite-дефолт", async () => {
    const m = await loadModule({ ...BETTER_AUTH_URL_KEYS, NODE_ENV: "test" });
    expect(m.getWebAppOrigin()).toBe("http://localhost:5173");
  });

  /**
   * Audit ws-11 навмисно вигнав localhost із prod-`trustedOrigins`. Оскільки
   * `auth.ts` додає результат цієї функції у той самий список, dev-дефолт у
   * проді повернув би дірку через задні двері — порожній рядок означає
   * «origin невідомий, нічого не переписуй і нічого не довіряй».
   */
  it("у production НЕ вигадує localhost-дефолт", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      NODE_ENV: "production",
    });
    expect(m.getWebAppOrigin()).toBe("");
  });

  it("без відомого origin посилання лишається як його побудував Better Auth", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      NODE_ENV: "production",
    });
    const original =
      "https://api.example.com/api/auth/verify-email?token=t&callbackURL=%2F";
    expect(m.withWebCallbackURL(original)).toBe(original);
  });
});

describe("withWebCallbackURL — перезапис callbackURL", () => {
  const BETTER_AUTH_LINK =
    "https://api.example.com/api/auth/verify-email?token=jwt.token.here&callbackURL=%2F";

  it("замінює дефолтний «/» на абсолютний web-URL, не чіпаючи токен", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      WEB_APP_URL: "https://app.example.com",
    });
    const url = new URL(m.withWebCallbackURL(BETTER_AUTH_LINK));

    expect(url.origin).toBe("https://api.example.com");
    expect(url.pathname).toBe("/api/auth/verify-email");
    expect(url.searchParams.get("token")).toBe("jwt.token.here");
    expect(url.searchParams.get("callbackURL")).toBe(
      "https://app.example.com/verify-email",
    );
  });

  /**
   * Регресійний якір на головний баг: `callbackURL=/` резолвився у корінь
   * API-домену, який не роздає SPA (`config.servesFrontend === false`), і
   * користувач після підтвердження отримував 404 JSON.
   */
  it("після перезапису callbackURL більше не вказує на API-домен", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      WEB_APP_URL: "https://app.example.com",
      BETTER_AUTH_URL: "https://api.example.com",
    });
    const callback = new URL(
      new URL(m.withWebCallbackURL(BETTER_AUTH_LINK)).searchParams.get(
        "callbackURL",
      )!,
    );
    expect(callback.origin).not.toBe("https://api.example.com");
    expect(callback.pathname).toBe(m.VERIFY_EMAIL_CALLBACK_PATH);
  });

  it("невалідний URL повертає як є — лист важливіший за красивий редирект", async () => {
    const m = await loadModule(BETTER_AUTH_URL_KEYS);
    expect(m.withWebCallbackURL("not-a-url")).toBe("not-a-url");
  });
});

describe("шаблони листів", () => {
  it("верифікаційний лист несе перезаписане посилання", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      WEB_APP_URL: "https://app.example.com",
    });
    const mail = m.verificationMail(
      "https://api.example.com/api/auth/verify-email?token=t&callbackURL=%2F",
    );
    expect(mail.subject).toContain("Підтвердження email");
    expect(mail.text).toContain(
      "callbackURL=https%3A%2F%2Fapp.example.com%2Fverify-email",
    );
    expect(mail.html).toContain("<a href=");
  });

  /**
   * Лист про зміну email іде на СТАРУ адресу — власник має бачити, куди саме
   * її намагаються перевести, інакше перехоплена сесія міняє пошту непомітно.
   */
  it("лист про зміну email показує нову адресу і попереджає про чужий запит", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      WEB_APP_URL: "https://app.example.com",
    });
    const mail = m.changeEmailConfirmationMail(
      "new@example.com",
      "https://api.example.com/api/auth/verify-email?token=t&callbackURL=%2F",
    );
    expect(mail.text).toContain("new@example.com");
    expect(mail.html).toContain("new@example.com");
    expect(mail.text).toContain("зміни пароль");
  });

  it("екранує HTML у адресі, що потрапляє в тіло листа", async () => {
    const m = await loadModule(BETTER_AUTH_URL_KEYS);
    const mail = m.changeEmailConfirmationMail(
      '"><script>alert(1)</script>@example.com',
      "https://api.example.com/api/auth/verify-email?token=t",
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

/**
 * Екранування винесене в окремий describe після того, як CodeQL позначив
 * попередню пару `escapeHtmlAttr`/`escapeHtmlText` як неповну санітизацію
 * (CWE-79). Тепер це одна функція на повний клас символів, і сюїт фіксує
 * саме повноту — щоб «оптимізація» назад до контекстно-звужених варіантів
 * не пройшла мовчки.
 */
describe("escapeHtml", () => {
  it("покриває всі пʼять небезпечних символів", async () => {
    const m = await loadModule(BETTER_AUTH_URL_KEYS);
    expect(m.escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("екранує КОЖНЕ входження, не лише перше", async () => {
    const m = await loadModule(BETTER_AUTH_URL_KEYS);
    expect(m.escapeHtml("a<b<c")).toBe("a&lt;b&lt;c");
  });

  /**
   * Класична пастка ланцюжка `.replace()`: якщо `&` екранується не першим,
   * власні `&` попередніх замін проходять другий раунд і дають `&amp;lt;`.
   * Один прохід по character-class-у це виключає структурно — тест
   * стереже саме цю властивість.
   */
  it("не екранує двічі власний вивід", async () => {
    const m = await loadModule(BETTER_AUTH_URL_KEYS);
    expect(m.escapeHtml("<")).toBe("&lt;");
    expect(m.escapeHtml("&amp;")).toBe("&amp;amp;");
    expect(m.escapeHtml(m.escapeHtml("<"))).toBe("&amp;lt;");
  });

  it("лишає безпечний текст недоторканим", async () => {
    const m = await loadModule(BETTER_AUTH_URL_KEYS);
    const plain = "user.name+tag@example.com — звичайний текст";
    expect(m.escapeHtml(plain)).toBe(plain);
  });

  /**
   * Одинарна лапка раніше не екранувалась (в атрибуті у подвійних лапках
   * вона нешкідлива). Тримаємо явний кейс: якщо хтось колись перепише
   * шаблон на одинарні лапки, атака не відкриється разом із ним.
   */
  it("закриває вихід із атрибута в одинарних лапках", async () => {
    const m = await loadModule(BETTER_AUTH_URL_KEYS);
    expect(m.escapeHtml("' onmouseover='alert(1)")).not.toContain("'");
  });

  /**
   * Reset-пароля має власний лендинг (`/reset-password`) і власний
   * `redirectTo`, який ставить клієнт — його URL ми НЕ чіпаємо.
   */
  it("лист скидання пароля лишає посилання недоторканим", async () => {
    const m = await loadModule({
      ...BETTER_AUTH_URL_KEYS,
      WEB_APP_URL: "https://app.example.com",
    });
    const original =
      "https://api.example.com/api/auth/reset-password/abc?callbackURL=%2Freset-password";
    expect(m.passwordResetMail(original).text).toContain(original);
  });
});
