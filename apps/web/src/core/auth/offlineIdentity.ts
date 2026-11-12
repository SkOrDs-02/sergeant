/**
 * Класифікація збою `GET /api/v1/me` і локальні мітки для офлайн холодного
 * старту (`docs/work/specs/offline-cold-start.md`).
 *
 * AI-DANGER: eager-чанк (імпортується з `AuthContext`). Жодних runtime-
 * імпортів `@sergeant/shared`, лише `import type`: білий екран на буті, див.
 * `apps/web/AGENTS.md`. Ключі тут літерали під pin-тестом
 * `offlineIdentity.test.ts`.
 *
 * Сховище, як у `sessionExpiredMarker.ts`: сирий LS через `resolveLsStore`
 * (синхронно, переживає reload), префікс `auth_` поза allowlist-ом
 * `purgeAppOwnedLocalData`, тож вихід і teardown знімають мітки явно
 * ({@link clearOfflineAuthMarkers}). priv-08: тут лише мітка часу і дата
 * видалення, жодного поля профілю.
 */
import { logger } from "@shared/lib";
import { resolveLsStore } from "@shared/lib/storage/storage";

/** Мітка часу (мс) останньої успішної відповіді `me`. */
export const LAST_ME_OK_AT_KEY = "auth_last_me_ok_at_v1";
/** `scheduledPurgeAt` з останньої 403 `account_pending_deletion` (або ""). */
export const PENDING_DELETION_KEY = "auth_pending_deletion_v1";

/**
 * Серверний код 403 для акаунта у вікні видалення. Літерал замість
 * `ACCOUNT_PENDING_DELETION_CODE` (див. AI-DANGER вище); синхрон тримає
 * `offlineIdentity.test.ts`.
 */
export const ACCOUNT_PENDING_DELETION_CODE = "account_pending_deletion";

export type MeFailure =
  | { kind: "signed-out" }
  | { kind: "pending-deletion"; scheduledPurgeAt: string | null }
  | { kind: "offline" }
  | { kind: "unavailable" };

/**
 * Що означає помилка `GET /api/v1/me`.
 *
 * Виходом із акаунта вважається лише ВИРІШАЛЬНА відповідь сервера: 401 (сесії
 * немає) і 403 (не пускають). Решта це «не знаю», а не «вийшов»: до цього всі
 * вони схлопувались у `unauthenticated`, і identity-wipe стирав кеш та
 * перезавантажував застосунок у анонімну партицію (аудит 2026-10-01, rel-02).
 *
 * `offline` лише для `kind === "network"` (fetch упав без відповіді): SW
 * `/api/v1/me` не перехоплює, тож офлайн дає саме його. 5xx, 429, битий JSON і
 * `aborted` (зокрема таймаут) лишаються `unavailable`.
 *
 * Duck-typing замість `isApiError`: runtime-імпорт заборонений (AI-DANGER).
 * `kind` є лише в `ApiError`; помилка без нього з числовим `status` це
 * легасі-форма, читаємо її як HTTP.
 */
export function classifyMeFailure(err: unknown): MeFailure {
  const e = (typeof err === "object" && err !== null ? err : {}) as {
    kind?: unknown;
    status?: unknown;
    body?: unknown;
  };
  if (e.kind === "network") return { kind: "offline" };
  const isHttp = e.kind === undefined || e.kind === "http";
  const status = typeof e.status === "number" ? e.status : 0;
  if (isHttp && status === 401) return { kind: "signed-out" };
  if (isHttp && status === 403) {
    const body =
      typeof e.body === "object" && e.body !== null
        ? (e.body as { code?: unknown; scheduledPurgeAt?: unknown })
        : {};
    if (body.code === ACCOUNT_PENDING_DELETION_CODE) {
      return {
        kind: "pending-deletion",
        scheduledPurgeAt:
          typeof body.scheduledPurgeAt === "string"
            ? body.scheduledPurgeAt
            : null,
      };
    }
    return { kind: "signed-out" };
  }
  return { kind: "unavailable" };
}

/** `me` не відповів, але це не рішення сервера про сесію. */
export function isMeOutage(kind: MeFailure["kind"] | undefined): boolean {
  return kind === "unavailable" || kind === "offline";
}

function write(key: string, value: string): void {
  try {
    resolveLsStore()?.setString(key, value);
  } catch (err) {
    logger.warn("[auth.offlineIdentity] write failed", err);
  }
}

function read(key: string): string | null {
  try {
    return resolveLsStore()?.getString(key) ?? null;
  } catch {
    return null;
  }
}

/** 200 від `me`: сесія жива зараз, вікно видалення (якщо було) закрите. */
export function noteMeOk(at: number): void {
  write(LAST_ME_OK_AT_KEY, String(at));
  clear(PENDING_DELETION_KEY);
}

/** 403 `account_pending_deletion` від `me`. */
export function notePendingDeletion(scheduledPurgeAt: string | null): void {
  write(PENDING_DELETION_KEY, scheduledPurgeAt ?? "");
}

/** `null` — маркера немає; `""` — маркер є, дати 403 не віддав. */
export function readPendingDeletionMarker(): string | null {
  return read(PENDING_DELETION_KEY);
}

export function readLastMeOkAt(): number | null {
  const raw = read(LAST_ME_OK_AT_KEY);
  const at = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(at) ? at : null;
}

function clear(key: string): void {
  try {
    resolveLsStore()?.remove(key);
  } catch (err) {
    logger.warn("[auth.offlineIdentity] clear failed", err);
  }
}

/** 401 від `me`, втрата сесії, свідомий вихід. */
export function clearOfflineAuthMarkers(): void {
  clear(LAST_ME_OK_AT_KEY);
  clear(PENDING_DELETION_KEY);
}
