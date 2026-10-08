/**
 * Last validated: 2026-10-04
 * Status: Active
 *
 * Маркер «вихід не підтверджено сервером» (аудит 2026-10-01, `sec-07`).
 *
 * AI-DANGER: `logout()` раніше ковтав помилку `signOut()`, чистив локальні
 * дані і вів на `/sign-in`. httpOnly-куку better-auth клієнт стерти не може,
 * тож без успішного `POST /api/auth/sign-out` серверна сесія жила до 7 днів, а
 * наступне відкриття застосунку знову входило в акаунт: людина без мережі
 * натискала «Вийти», віддавала пристрій, і наступний власник бачив хаб
 * попередньої. Тепер `logout()` ставить маркер ДО запиту і знімає його лише
 * коли сервер підтвердив (2xx або 401, див. {@link isSignOutConfirmed}).
 * Поки маркер стоїть, `AuthContext` трактує цей пристрій як розлогінений і
 * повторює sign-out на старті та при появі мережі, а `/api/v1/me` не слухає
 * (його відповідь може бути зі SW-кешу).
 *
 * Сховище. Ключ навмисно НЕ під жодним префіксом allowlist-а
 * `purgeAppOwnedLocalData` (`hub_`, `finyk_`, …, `sergeant.`): purge іде
 * вже ПІСЛЯ запису маркера і стер би його разом з рештою. Читаємо і пишемо
 * напряму через `localStorage`-адаптер (`resolveLsStore`), а не `webKVStore`:
 * тепла кеш-копія SQLite чиститься `wipeSqliteDb`, а маркеру потрібен
 * синхронний запис, що вціліє при reload одразу після `assign`.
 * Кожен доступ у try/catch: заблокований storage не має ламати вихід.
 *
 * AI-DANGER: eager-чанк (його імпортує `AuthContext`). Тут НЕ можна мати
 * runtime-імпорт `@sergeant/shared`: білий екран на буті, див.
 * `apps/web/AGENTS.md`. Тому і ключ — літерал.
 */
import { logger } from "@shared/lib";
import { resolveLsStore } from "@shared/lib/storage/storage";

export const PENDING_SIGN_OUT_KEY = "auth_pending_signout_v1";

/** Мінімум, потрібний від відповіді `signOut()` (better-fetch `{data, error}`). */
export interface SignOutResultLike {
  readonly error?: { readonly status?: number } | null;
}

export type SignOutFn = () => Promise<
  SignOutResultLike | null | undefined | void
>;

/** Результат спроби повторити sign-out. */
export type PendingSignOutOutcome = "none" | "confirmed" | "failed";

/**
 * Чи підтвердив сервер вихід. 2xx (немає `error`) — так; 401 — сесії на
 * сервері вже нема (протухла чи відкликана), тож закривати нічого. Решта
 * (мережа, 5xx, 429) — ні: сесія може бути жива.
 */
export function isSignOutConfirmed(
  result: SignOutResultLike | null | undefined | void,
): boolean {
  const error = result?.error;
  if (!error) return true;
  return error.status === 401;
}

export function hasPendingSignOut(): boolean {
  try {
    return resolveLsStore()?.getString(PENDING_SIGN_OUT_KEY) != null;
  } catch {
    return false;
  }
}

export function markPendingSignOut(): void {
  try {
    resolveLsStore()?.setString(PENDING_SIGN_OUT_KEY, "1");
  } catch (err) {
    logger.warn("[auth.pendingSignOut] mark failed", err);
  }
}

export function clearPendingSignOut(): void {
  try {
    resolveLsStore()?.remove(PENDING_SIGN_OUT_KEY);
  } catch (err) {
    logger.warn("[auth.pendingSignOut] clear failed", err);
  }
}

/**
 * Один запит sign-out із `logout()`: маркер (його вже поставлено) знімається,
 * лише якщо сервер підтвердив вихід. Виняток (офлайн) і `{error}` без 401
 * лишають маркер; сама функція ніколи не кидає.
 */
export async function settleSignOut(signOutFn: SignOutFn): Promise<void> {
  try {
    if (isSignOutConfirmed(await signOutFn())) clearPendingSignOut();
  } catch {
    // Маркер уже стоїть: повтор на старті чи на `online`.
  }
}

let inFlight: Promise<PendingSignOutOutcome> | null = null;

/**
 * Повторює sign-out, якщо маркер стоїть. `confirmed` знімає маркер; `failed`
 * лишає його (наступна спроба — на `online` чи при наступному старті).
 * Паралельні виклики ділять один запит. Без маркера запиту немає: вхід знімає
 * його (`clearPendingSignOut`), тож наступний повтор не торкнеться нової сесії.
 */
export function retryPendingSignOut(
  signOutFn: SignOutFn,
): Promise<PendingSignOutOutcome> {
  if (inFlight) return inFlight;
  if (!hasPendingSignOut()) return Promise.resolve("none");
  const attempt = (async (): Promise<PendingSignOutOutcome> => {
    try {
      if (!isSignOutConfirmed(await signOutFn())) return "failed";
    } catch {
      return "failed";
    }
    clearPendingSignOut();
    return "confirmed";
  })().finally(() => {
    inFlight = null;
  });
  inFlight = attempt;
  return attempt;
}
