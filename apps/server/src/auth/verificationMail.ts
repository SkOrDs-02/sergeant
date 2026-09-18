/**
 * Last validated: 2026-08-02
 * Status: Active
 *
 * Тексти й посилання транзакційних листів Better Auth (verify-email,
 * password-reset, change-email confirmation).
 *
 * Чому окремий модуль, а не інлайн у `auth.ts`:
 *   1. `auth.ts` уже впритул до `max-lines: 600` (Hard Rule #18), а
 *      верифікаційний флоу — це три шаблони + перезапис callback-URL-а.
 *   2. Логіку `withWebCallbackURL()` треба покривати юніт-тестами без
 *      підняття всього Better Auth instance-у (той тягне Drizzle + pool).
 *
 * AI-CONTEXT: `withWebCallbackURL` — єдине місце, де вирішується, куди
 * потрапляє користувач після кліку в листі. Better Auth будує URL сам і
 * дефолтить `callbackURL` у `"/"`, тобто в корінь **API**-домену. У нас
 * `config.servesFrontend === false` (`apps/server/src/config.ts`), тож
 * такий редирект віддає 404 JSON замість застосунку. Тому ми перезаписуємо
 * параметр на web-origin. Якщо тут щось зламати — верифікація все одно
 * спрацює (рядок у БД оновиться), але користувач побачить білу сторінку.
 */
import { env } from "../env/env.js";

/**
 * Шлях лендинга у `apps/web`, який показує результат верифікації.
 * Дзеркалить `VERIFY_EMAIL_PATH` у `apps/web/src/core/app/appPaths.ts` —
 * пара перевіряється контракт-тестом `verificationMail.test.ts`.
 */
export const VERIFY_EMAIL_CALLBACK_PATH = "/verify-email";

/** Дефолт для локального dev — Vite-сервер `pnpm dev:web`. */
const DEV_WEB_ORIGIN = "http://localhost:5173";

/**
 * Повний набір символів, небезпечних у HTML — і в тілі елемента, і всередині
 * значення атрибута (як у подвійних, так і в одинарних лапках).
 */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Екранування для будь-якої позиції в HTML-тілі листа.
 *
 * AI-DANGER: єдиний барʼєр між користувацьким рядком (`newEmail`) і HTML,
 * який ми надсилаємо поштою. Міняти тільки разом із тестами у
 * `verificationMail.test.ts` — і не звужувати набір символів.
 *
 * Раніше тут жила пара `escapeHtmlAttr` / `escapeHtmlText`, де атрибутний
 * варіант свідомо не чіпав `>` і `'` (всередині подвійних лапок вони
 * нешкідливі). Формально це було коректно, але вимагало доводити
 * контекст кожного call-site вручну — саме на це лаявся CodeQL (CWE-79,
 * неповна санітизація). Один прохід по повному класу символів знімає і
 * попередження, і потребу тримати відповідність «функція ↔ контекст» у
 * голові при кожній правці шаблонів.
 *
 * Один `replace` із character-class-ом, а не ланцюжок — ланцюжок
 * `&`-first працює лише за рахунок порядку, і будь-яка перестановка
 * рядків дає подвійне екранування.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Перший http(s)-origin із `ALLOWED_ORIGINS`. Кастомні схеми
 * (`sergeant://`, `exp://`) навмисно пропускаємо — deep-link не є
 * валідною ціллю для кліку з поштового клієнта на десктопі.
 */
function firstHttpOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  for (const candidate of raw.split(",")) {
    const trimmed = candidate.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return stripTrailingSlash(trimmed);
    }
  }
  return null;
}

/**
 * Origin веб-застосунку (Vercel у проді, Vite у dev). Порядок:
 *
 *   1. `WEB_APP_URL` — явний override для ops.
 *   2. Перший http(s)-запис у `ALLOWED_ORIGINS` — zero-config для проду,
 *      бо там уже стоїть домен Vercel (інакше не працював би CORS).
 *   3. `BETTER_AUTH_URL` — degradation до попередньої (зламаної) поведінки
 *      замість викидання посилання без хоста.
 *   4. Vite-дефолт — **лише поза production**.
 *
 * Результат обовʼязково має бути у `trustedOrigins` — Better Auth ганяє
 * `callbackURL` через `originCheck` і 403-ить чужий origin. `auth.ts`
 * додає це значення у список саме через це, і тут же криється причина
 * NODE_ENV-гейта на кроці 4: audit ws-11 прибрав localhost із prod-списку
 * (session-cookies їдуть `SameSite=None`, а `/api/auth/*` виключений з
 * X-Requested-With CSRF-guard-а, тож будь-який dev-сервер на машині жертви
 * проходив би origin-check проти прод-API). Дефолт, доданий тут, повернув би
 * ту саму дірку через задні двері — регресію ловить
 * `auth.test.ts > ws-11: trustedOrigins у production НЕ містять localhost`.
 *
 * Порожній рядок = «origin невідомий»: `withWebCallbackURL` тоді лишає
 * посилання Better Auth як є, а `auth.ts` нічого не додає у trustedOrigins.
 * Реалістично це лише мисконфіг прод-деплою (ні `WEB_APP_URL`, ні
 * `ALLOWED_ORIGINS`, ні `BETTER_AUTH_URL`).
 */
export function getWebAppOrigin(): string {
  const explicit = env.WEB_APP_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);
  const fromAllowed = firstHttpOrigin(env.ALLOWED_ORIGINS);
  if (fromAllowed) return fromAllowed;
  if (env.BETTER_AUTH_URL) return stripTrailingSlash(env.BETTER_AUTH_URL);
  return env.NODE_ENV === "production" ? "" : DEV_WEB_ORIGIN;
}

/**
 * Перезаписує `callbackURL` у побудованому Better Auth посиланні на
 * абсолютний web-URL. Приймає рівно ту форму, яку віддає бібліотека:
 * `{authBaseURL}/verify-email?token=…&callbackURL=…`.
 *
 * Невалідний URL повертаємо як є — краще надіслати оригінальне посилання
 * (верифікація спрацює, редирект буде кривий), ніж не надіслати лист.
 */
export function withWebCallbackURL(url: string): string {
  const origin = getWebAppOrigin();
  if (!origin) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(
      "callbackURL",
      `${origin}${VERIFY_EMAIL_CALLBACK_PATH}`,
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

export interface AuthMailContent {
  subject: string;
  text: string;
  html: string;
}

export function verificationMail(url: string): AuthMailContent {
  const link = withWebCallbackURL(url);
  return {
    subject: "Підтвердження email · Sergeant",
    text: `Підтверди адресу електронної пошти:\n\n${link}\n\nЯкщо ти не реєструвався, просто проігноруй цей лист.`,
    html: `<p>Підтверди email:</p><p><a href="${escapeHtml(link)}">Підтвердити</a></p><p>Якщо ти не реєструвався, просто проігноруй цей лист.</p>`,
  };
}

export function passwordResetMail(url: string): AuthMailContent {
  return {
    subject: "Скидання пароля · Sergeant",
    text: `Перейди за посиланням, щоб задати новий пароль (діє обмежений час):\n\n${url}\n\nЯкщо ти не запитував скидання, просто проігноруй цей лист.`,
    html: `<p>Перейди за посиланням, щоб задати новий пароль:</p><p><a href="${escapeHtml(url)}">Скинути пароль</a></p><p>Якщо ти не запитував скидання, просто проігноруй цей лист.</p>`,
  };
}

/**
 * Лист-підтвердження зміни email. Йде на **стару** (підтверджену) адресу:
 * Better Auth спершу питає дозволу у власника поточної скриньки і лише
 * після кліку шле верифікацію на нову. Тому в тексті обовʼязково видно,
 * на яку саме адресу піде зміна — інакше перехоплений акаунт міняє пошту
 * непомітно для власника.
 */
export function changeEmailConfirmationMail(
  newEmail: string,
  url: string,
): AuthMailContent {
  const link = withWebCallbackURL(url);
  return {
    subject: "Підтвердження зміни email · Sergeant",
    text: `Ти попросив змінити адресу акаунта на ${newEmail}.\n\nПідтверди зміну:\n\n${link}\n\nЯкщо це був не ти, НЕ переходь за посиланням і зміни пароль: адресу акаунта намагаються перепривʼязати.`,
    html: `<p>Ти попросив змінити адресу акаунта на <strong>${escapeHtml(newEmail)}</strong>.</p><p><a href="${escapeHtml(link)}">Підтвердити зміну</a></p><p>Якщо це був не ти, НЕ переходь за посиланням і зміни пароль: адресу акаунта намагаються перепривʼязати.</p>`,
  };
}
