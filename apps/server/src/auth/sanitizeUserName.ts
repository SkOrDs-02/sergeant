/**
 * Валідація `user.name` перед записом у Postgres (аудит 2026-10-01, `sec-16`).
 *
 * ЧОМУ окремий модуль, поруч із `sanitizeUserImage`. Better Auth кладе ВЕСЬ
 * `user` у `session_data` (cookieCache, HMAC-підписаний JSON, чанкований по
 * ~4 КБ). `name` ніким не обмежений: `POST /update-user` приймає тіло як
 * `z.record(z.any())`, а sign-up — `z.string()` без `max`. 20-КБ імʼя давало
 * 8 чанків куки, сукупний `Cookie` 28 КБ > 16 КБ ліміту Node, і КОЖЕН запит
 * браузера (включно з `get-session`, виправленням імені й `sign-out`)
 * отримував 431. Самовідновлення немає: будь-яка нова сесія кешує той самий
 * роздутий `user`. Той самий клас, що інцидент 2026-05-02 з 19-КБ аватаркою.
 *
 * ВІДМІННІСТЬ від `sanitizeUserImage`: тут відхиляємо, а не стрипаємо.
 * `image` зайвий — його можна відкинути, лишивши решту оновлення; `name`
 * обовʼязкове поле, і мовчки обрізане імʼя користувач не просив. Винятком є
 * записи, ініційовані НЕ користувачем (OAuth-провайдер, внутрішні синки):
 * там відмова заблокувала б вхід, який людина виправити не може, тож `name`
 * обрізається (`mode: "truncate"`).
 *
 * Типи: `/update-user` пропускає будь-що, а БД-шар коерсить (`12345` → `'12345'`,
 * `{a:1}` → `'{"a":1}'`). Не-рядок відхиляємо завжди.
 */

import { APIError } from "better-auth/api";

/** ≥ веб-ліміту `max(80)` у `PersonalInfoSection.tsx`; запас для інших клієнтів. */
export const MAX_USER_NAME_LENGTH = 100;

export type UserNameProblem = "not_string" | "too_long";

export type SanitizeNameResult<T> =
  | { ok: true; data: T; truncated: boolean }
  | { ok: false; reason: UserNameProblem };

/**
 * - `mode: "reject"` (запит користувача): не-рядок / задовге → `ok: false`;
 * - `mode: "truncate"` (провайдер/внутрішній запис): не-рядок → `ok: false`,
 *   задовге → обрізане до `MAX_USER_NAME_LENGTH`.
 *
 * Поле `name` відсутнє або `undefined` — без змін (часта гілка оновлень
 * `image`-only). `null` — не-рядок: колонка `NOT NULL`, а записати його БД не дасть.
 */
export function sanitizeUserName<T extends Record<string, unknown>>(
  data: T,
  mode: "reject" | "truncate",
): SanitizeNameResult<T> {
  if (!("name" in data) || data["name"] === undefined) {
    return { ok: true, data, truncated: false };
  }
  const value = data["name"];
  if (typeof value !== "string") return { ok: false, reason: "not_string" };
  if (value.length <= MAX_USER_NAME_LENGTH) {
    return { ok: true, data, truncated: false };
  }
  if (mode === "reject") return { ok: false, reason: "too_long" };
  // Не розрізаємо сурогатну пару посередині: обірваний high-surrogate —
  // зламаний рядок, який Postgres відхилить при записі в UTF-8.
  let cut = value.slice(0, MAX_USER_NAME_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return {
    ok: true,
    data: { ...data, name: cut } as T,
    truncated: true,
  };
}

export function userNameErrorMessage(reason: UserNameProblem): string {
  return reason === "too_long"
    ? `Імʼя задовге: максимум ${MAX_USER_NAME_LENGTH} символів.`
    : "Імʼя має бути рядком.";
}

/**
 * Обгортка для `databaseHooks.user.{create,update}.before` в `auth.ts`:
 * вибирає режим за шляхом ендпоінта й перетворює відмову на 400 `INVALID_NAME`.
 *
 * Запит людини — `/sign-up*` (create) і `/update-user` (update): відхиляємо.
 * Усе інше (колбек провайдера, внутрішній синк при лінкуванні, `context`
 * відсутній) — обрізаємо, бо людина виправити це не може, а відмова
 * заблокувала б вхід.
 */
export function guardUserName<T extends Record<string, unknown>>(
  data: T,
  context: { path?: string } | null | undefined,
  op: "create" | "update",
): T {
  const path = context?.path ?? "";
  const userRequest =
    op === "create" ? path.startsWith("/sign-up") : path === "/update-user";
  const result = sanitizeUserName(data, userRequest ? "reject" : "truncate");
  if (!result.ok) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_NAME",
      message: userNameErrorMessage(result.reason),
    });
  }
  return result.data;
}
