/**
 * Мапить помилку з Better Auth / `@better-fetch/fetch` у людську українську
 * UX-копію.
 *
 * Контекст — F5 з `docs/audits/2026-05-13-web-frontend-ergonomics-roast.md`:
 * у Profile-секціях ми робили `toast.error(res.error.message ?? "...")`, де
 * `res.error.message` — це сирий backend-string (`"Invalid password"`,
 * `"Failed to update user"`, `"validation_error: ..."`). Він не локалізований
 * і не написаний у tone-of-voice продукту.
 *
 * `BetterFetchError` віддає `{ code, message, status, statusText }` (див.
 * `node_modules/@better-fetch/fetch/dist/index.d.ts` + `error.mjs`). `code`
 * приходить із серверного body — Better Auth кладе туди ключ
 * `BASE_ERROR_CODES` (`INVALID_PASSWORD`, `USER_ALREADY_EXISTS`, ...). Ми
 * мапимо саме `code` бо він стабільний — `message` сервер може змінити при
 * upgrade Better Auth, а `code` залишиться.
 *
 * Якщо `code` відсутній (network error, custom 5xx), пробуємо мапити
 * `status` через `friendlyApiError` — той самий 401/403/429 fallback, що
 * використовують інші модулі.
 *
 * Останній рубіж — generic UX-fallback. Не використовуємо `error.message` як
 * fallback навмисно: якщо потрапили сюди, значить backend дав щось
 * unrecognized, і показувати юзеру `"Failed to fetch"` або
 * `"validation_error: name too long"` — гірше за generic-фразу.
 */
import { friendlyApiError } from "./friendlyApiError";

/**
 * Shape, який віддає Better Auth client (`AuthResult["error"]`) і
 * `BetterFetchError`. Усі поля опційні — обережно тримаємось duck-typing,
 * щоб мапер можна було викликати з будь-якого `res.error`.
 */
export interface ApiErrorLike {
  code?: string | null | undefined;
  message?: string | null | undefined;
  status?: number | undefined;
  statusText?: string | undefined;
}

const DEFAULT_FALLBACK = "Не вдалося виконати запит";

/**
 * Канонічна мапа `code` → UA-копія. Лишаємо мінімально необхідний набір
 * Better-Auth-кодів, що реально зустрічаються у Profile-флоу (зміна
 * пароля / email / delete-account / revoke-session). Додавай нові коди при
 * появі — і додавай юніт-тест.
 *
 * Джерело кодів: `node_modules/@better-auth/core/dist/error/codes.mjs`
 * (`BASE_ERROR_CODES`).
 *
 * Також покриваємо 8 канонічних `@sergeant/api-client` lowercase кодів,
 * що можуть прийти з не-Better-Auth ендпоінтів сервера:
 * `validation_error`, `unauthenticated`, `forbidden`, `rate_limited`,
 * `network_error`, `conflict`, `not_found`, `server_error`.
 */
const CODE_TO_UA_COPY: Readonly<Record<string, string>> = {
  // ── Better Auth BASE_ERROR_CODES (UPPER_SNAKE_CASE) ──────────────────
  INVALID_PASSWORD: "Невірний поточний пароль.",
  INVALID_EMAIL: "Невірний формат email.",
  INVALID_EMAIL_OR_PASSWORD: "Невірний email або пароль.",
  PASSWORD_TOO_SHORT: "Пароль занадто короткий. Мінімум 10 символів.",
  PASSWORD_TOO_LONG: "Пароль занадто довгий. Максимум 128 символів.",
  USER_NOT_FOUND: "Користувача не знайдено.",
  USER_ALREADY_EXISTS: "Користувач з таким email вже існує.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Користувач з таким email вже існує. Використай інший.",
  EMAIL_ALREADY_VERIFIED: "Email уже підтверджено.",
  EMAIL_NOT_VERIFIED: "Email ще не підтверджено.",
  EMAIL_CAN_NOT_BE_UPDATED: "Email не можна оновити для цього акаунту.",
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    "Для цього акаунту немає пароля — увійди через соцмережу.",
  SESSION_EXPIRED: "Сесія завершилась. Увійди ще раз.",
  SESSION_NOT_FRESH: "Для цієї дії потрібен свіжий вхід. Увійди ще раз.",
  INVALID_TOKEN: "Посилання недійсне або застаріле.",
  TOKEN_EXPIRED: "Посилання застаріло. Спробуй ще раз.",
  VALIDATION_ERROR: "Деякі поля заповнені некоректно. Перевір введені дані.",
  MISSING_FIELD: "Заповни всі обовʼязкові поля.",
  FAILED_TO_UPDATE_USER: "Не вдалося оновити дані. Спробуй ще раз.",
  FAILED_TO_CREATE_USER: "Не вдалося створити акаунт. Спробуй ще раз.",

  // ── @sergeant/api-client canonical codes (lowercase_snake_case) ───────
  // Ці коди надходять із сервера через не-Better-Auth ендпоінти.
  validation_error: "Деякі поля заповнені некоректно. Перевір введені дані.",
  unauthenticated: "Доступ заборонено. Увійди ще раз.",
  forbidden: "Недостатньо прав для цієї дії.",
  rate_limited: "Забагато запитів. Спробуй через хвилину.",
  network_error: "Немає зʼєднання з сервером. Перевір мережу.",
  conflict: "Дані змінено іншим пристроєм. Онови сторінку і спробуй ще раз.",
  not_found: "Ресурс не знайдено.",
  server_error: "Помилка сервера. Спробуй ще раз пізніше.",
};

/**
 * Перетворює `error` у людський UX-string. Викликай з `useMutation.onError`
 * або сирим `if (res.error)` блоком:
 *
 * ```ts
 * const res = await updateUser({ name });
 * if (res.error) {
 *   toast.error(mapApiErrorToUserCopy(res.error, "Не вдалося оновити імʼя"));
 *   return;
 * }
 * ```
 *
 * @param error  Опційний обʼєкт помилки (Better Auth / better-fetch / null).
 * @param fallback Контекстна копія, якщо ні `code`, ні `status` не дали
 *                 збігу. За замовчуванням — generic `"Не вдалося виконати
 *                 запит"`.
 */
export function mapApiErrorToUserCopy(
  error: ApiErrorLike | null | undefined,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (!error) return fallback;

  const code = typeof error.code === "string" ? error.code : null;
  if (code) {
    const mapped = CODE_TO_UA_COPY[code];
    if (mapped) return mapped;
  }

  if (typeof error.status === "number" && error.status > 0) {
    const httpMsg = friendlyApiError(error.status);
    if (!/^Помилка \d+$/.test(httpMsg)) {
      return httpMsg;
    }
  }

  return fallback;
}
