/**
 * Last validated: 2026-09-14
 * Status: Active
 */
// Напряму з пакета, а не через `@shared/api`: цей модуль підмішується в
// `useServerPreference`, а його тест (`useServerPreference.race.test.ts`)
// мокає весь `@shared/api` цілком, лишаючи там сам `meApi`. Імпорт через
// барель зробив би `isApiError` тут `undefined` у кожному такому тесті, і
// класифікатор падав би на виклику. Пряма форма — усталена практика в цьому
// застосунку (49 файлів на 2026-09-14).
import { isApiError } from "@sergeant/api-client";

/**
 * Чому провалився GET серверних налаштувань — у трьох станах, які людині
 * треба показувати по-різному.
 *
 * AI-CONTEXT: до 2026-09-14 обидва споживачі (`PrivacySection.tsx` і
 * `useServerPreference.ts`) ковтали помилку через `.catch(() => …)` і на
 * БУДЬ-ЯКИЙ збій писали «Увійди в акаунт». Тобто залогінена людина в метро
 * або під час 500-ки читала, що вона не залогінена, і йшла перелогінюватись
 * (знахідка PR-S2 огляду 2026-09-13). `ApiError` увесь цей час ніс рівно те,
 * чого бракувало: `isAuth` (401/403) і `kind: "network"`.
 *
 * **Чому НЕ `useOnlineStatus` (як пропонував текст знахідки) і не
 * `ApiError.isOffline`.** Обидва впираються в `navigator.onLine`, а він
 * бреше: iOS Safari і Capacitor WebView залипають на `false` після
 * перемикання Wi-Fi → LTE і не шлють подію `online` (розбір і замір — у
 * докстрінгу `shared/hooks/useOnlineStatus.ts`). `kind === "network"` цього
 * недоліку не має: він означає, що сам `fetch` кинув, тобто до сервера
 * фактично не достукались. Це і дешевше (без `/livez`-проби), і чесніше.
 *
 * **Порядок гілок навмисний.** «Увійди» кажемо ЛИШЕ на позитивний `isAuth`.
 * Усе інше, включно з не-`ApiError`, падає в `failure`: помилитись у бік
 * «не вдалося, спробуй ще» дешево, а в бік «ти не залогінений» дорого, бо
 * це неправдиве твердження про стан акаунта.
 */
export type PreferenceLoadFailure = "auth" | "offline" | "failure";

export function classifyPreferenceLoadFailure(
  err: unknown,
): PreferenceLoadFailure {
  if (!isApiError(err)) return "failure";
  if (err.isAuth) return "auth";
  if (err.kind === "network") return "offline";
  return "failure";
}

/**
 * Копія для двох не-auth станів. Auth-рядок лишається за викликачем: він
 * різний за змістом (у Приватності — про керування згодами, у Сповіщеннях —
 * про те, кому Сержант пише), і зводити його в одне означало б зробити
 * обидва місця менш конкретними.
 */
export const PREFERENCE_LOAD_FAILURE_COPY: Record<
  Exclude<PreferenceLoadFailure, "auth">,
  string
> = {
  offline: "Немає звʼязку з сервером. Перевір інтернет і спробуй ще раз.",
  failure: "Не вдалося завантажити налаштування. Спробуй ще раз.",
};
