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
import { mailButton, mailNote, wrapMailHtml } from "../email/mailLayout.js";
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

/**
 * Службові листи входу. Верстка спільна з листами першого тижня
 * (`email/mailLayout.ts`): привітання, одне речення контексту, кнопка і
 * сірий рядок про строк дії та «якщо це не ти». Рід нейтральний («якщо це
 * не ти»), бо адресат невідомий. Строк дії токенів — дефолт Better Auth,
 * година (`createEmailVerificationToken`, `resetPasswordTokenExpiresIn`).
 * Голос команди «ми» в листах дозволено (style-guide §2, TXT-5).
 */
const HELLO = "Привіт.";
const LINK_LIFETIME = "Посилання діє годину.";

export function verificationMail(url: string): AuthMailContent {
  const link = withWebCallbackURL(url);
  const lead =
    "Підтверди цю адресу, щоб завершити реєстрацію в Sergeant. Кнопка одразу відкриє застосунок.";
  const note = "Якщо це не ти, проігноруй цей лист.";
  return {
    subject: "Підтверди пошту · Sergeant",
    text: `${HELLO}\n\n${lead}\n\nПідтвердити пошту:\n${link}\n\n${LINK_LIFETIME} ${note}`,
    html: wrapMailHtml(
      `<p>${HELLO}</p><p>${lead}</p>` +
        mailButton(link, "Підтвердити пошту") +
        mailNote(`${LINK_LIFETIME} ${note}`),
    ),
  };
}

export function passwordResetMail(url: string): AuthMailContent {
  const lead = "Задай новий пароль для свого акаунта Sergeant.";
  const note = "Якщо це не ти, проігноруй цей лист: старий пароль працює далі.";
  return {
    subject: "Новий пароль · Sergeant",
    text: `${HELLO}\n\n${lead}\n\nЗадати новий пароль:\n${url}\n\n${LINK_LIFETIME} ${note}`,
    html: wrapMailHtml(
      `<p>${HELLO}</p><p>${lead}</p>` +
        mailButton(url, "Задати новий пароль") +
        mailNote(`${LINK_LIFETIME} ${note}`),
    ),
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
  const after = "Після підтвердження лист для перевірки прийде на нову адресу.";
  const warn =
    "Якщо це не ти, не натискай кнопку і зміни пароль у профілі: хтось намагається перепривʼязати акаунт.";
  return {
    subject: "Підтверди зміну пошти · Sergeant",
    text: `${HELLO}\n\nДля акаунта Sergeant попросили змінити пошту на ${newEmail}. ${after}\n\nПідтвердити зміну:\n${link}\n\n${warn}`,
    html: wrapMailHtml(
      `<p>${HELLO}</p><p>Для акаунта Sergeant попросили змінити пошту на <strong>${escapeHtml(newEmail)}</strong>. ${after}</p>` +
        mailButton(link, "Підтвердити зміну") +
        mailNote(warn),
    ),
  };
}

/**
 * Сповіщення на СТАРУ адресу, коли непідтверджений акаунт уже змінив email
 * (`sec-06`). Підтвердження тут не просимо: зміна відбулась, і це єдиний
 * сигнал власнику скриньки, що акаунт можуть перехоплювати. Тому в тексті
 * є нова адреса і шлях повернення акаунта.
 */
export function emailChangedNoticeMail(newEmail: string): AuthMailContent {
  const ok = "Якщо це ти, нічого робити не треба.";
  const bad =
    "Якщо ні, акаунт могли перехопити. Напиши з цієї адреси на support@sergeant.app, і ми допоможемо його повернути.";
  return {
    subject: "Пошту акаунта змінено · Sergeant",
    text: `${HELLO}\n\nПошту акаунта Sergeant змінено на ${newEmail}.\n\n${ok}\n\n${bad}`,
    html: wrapMailHtml(
      `<p>${HELLO}</p><p>Пошту акаунта Sergeant змінено на <strong>${escapeHtml(newEmail)}</strong>.</p><p>${ok}</p><p>${bad}</p>`,
    ),
  };
}

/**
 * Сторінка входу у вебі. `?forgot=1` одразу відкриває панель «Забули
 * пароль?» (`apps/web/src/core/auth/AuthPage.tsx`).
 */
export const SIGN_IN_CALLBACK_PATH = "/sign-in";
export const FORGOT_PASSWORD_QUERY = "forgot=1";

/**
 * sec-46 / priv-29: лист на адресу, з якою спробували зареєструватись, хоча
 * акаунт на неї вже є. Реєстрація при цьому відповідає так само, як для
 * нової адреси («перевір пошту»), тож про наявність акаунта дізнається лише
 * власник скриньки. Готового токена скидання тут немає: його видає
 * `request-password-reset`, і це був би другий лист, тому посилання веде на
 * вхід із відкритою панеллю скидання.
 *
 * Без web-origin (мисконфіг проду, див. `getWebAppOrigin`) посилань немає,
 * а текст лишається правдивим.
 */
export function accountExistsMail(): AuthMailContent {
  const origin = getWebAppOrigin();
  const intro =
    "Цю адресу щойно вказали під час реєстрації в Sergeant. Акаунт на неї вже є, тож новий ми не створювали.";
  const outro =
    "Якщо це не ти, проігноруй цей лист: без пароля чи доступу до цієї пошти в акаунт не увійти.";
  if (!origin) {
    const hint =
      "Відкрий Sergeant і увійди. Не памʼятаєш пароль? На сторінці входу натисни «Забули пароль?».";
    return {
      subject: "У тебе вже є акаунт · Sergeant",
      text: `${HELLO}\n\n${intro}\n\n${hint}\n\n${outro}`,
      html: wrapMailHtml(
        `<p>${HELLO}</p><p>${intro}</p><p>${hint}</p>` + mailNote(outro),
      ),
    };
  }
  const signIn = `${origin}${SIGN_IN_CALLBACK_PATH}`;
  const reset = `${signIn}?${FORGOT_PASSWORD_QUERY}`;
  return {
    subject: "У тебе вже є акаунт · Sergeant",
    text: `${HELLO}\n\n${intro}\n\nУвійти:\n${signIn}\n\nНе памʼятаєш пароль? Скинь його тут:\n${reset}\n\n${outro}`,
    html: wrapMailHtml(
      `<p>${HELLO}</p><p>${intro}</p>` +
        mailButton(signIn, "Увійти") +
        `<p>Не памʼятаєш пароль? <a href="${escapeHtml(reset)}">Скинути пароль</a></p>` +
        mailNote(outro),
    ),
  };
}
