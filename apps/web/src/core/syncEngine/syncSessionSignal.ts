/**
 * Last validated: 2026-10-04
 * Status: Active
 *
 * Сигнал «синк не бачить сесії» (аудит 2026-10-01, `sec-18`).
 *
 * AI-CONTEXT: коли сесія спливає посеред роботи (TTL, вихід на іншому
 * пристрої), `getSession()` віддає `data: null` без помилки, `resolveUserId`
 * у `singleton.ts` повертає `null`, а drain черги мовчки повертає `[]`. Записи
 * далі стають у чергу, лічильник росте, а людина не знає, що вони нікуди не
 * їдуть (`/api/v1/me` у вкладці не перезапитується, тож `AuthContext` ще
 * вважає її залогіненою). Цей модуль лише ЗАПАМʼЯТОВУЄ спостереження драйна;
 * чи показувати його, вирішує споживач за статусом `AuthContext`
 * (`useSyncStatus`): без сесії на анонімному пристрої `null` — норма, і
 * банера там бути не має.
 *
 * «Сесії немає» ≠ «не вдалося спитати». Офлайн чи 5xx теж дають `data: null`,
 * але з `error`; такий тік нічого не каже про сесію, тому стан він не міняє
 * (інакше кожен обрив мережі малював би «Сесія завершилась»). 401/403 від
 * get-session — справжнє «немає», як і у reader-і (`data-04`).
 *
 * AI-DANGER: файл без React і без імпортів. Його викликає `singleton.ts` на
 * write-path кожного тіку; будь-який імпорт `AuthContext` чи компонента зшив б
 * граф sync-ядра з графом авторизації (циклічна залежність, що вже валила прод
 * TDZ-крашем — див. початок `singleton.ts`). Тримай його таким.
 */

/** Структурна проєкція відповіді `getSession()`, потрібна цьому модулю. */
export interface SyncSessionLookup {
  readonly data?: {
    readonly user?: { readonly id?: string | null } | null;
  } | null;
  readonly error?: { readonly status?: number } | null;
}

let sessionMissing = false;
const listeners = new Set<() => void>();

function setSessionMissing(next: boolean): void {
  if (sessionMissing === next) return;
  sessionMissing = next;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      setTimeout(() => {
        throw err;
      }, 0);
    }
  });
}

/**
 * Читає відповідь `getSession()`, оновлює сигнал і повертає `userId` (або
 * `null`) — рівно те, що раніше повертав `resolveUserId`.
 */
export function observeSyncSession(session: SyncSessionLookup): string | null {
  const userId = session.data?.user?.id ?? null;
  if (userId) {
    setSessionMissing(false);
    return userId;
  }
  const status = session.error?.status;
  const confirmedMissing = !session.error || status === 401 || status === 403;
  if (confirmedMissing) setSessionMissing(true);
  return null;
}

/** Останнє спостереження драйна: `true` — сесії немає. */
export function readSyncSessionMissing(): boolean {
  return sessionMissing;
}

export function subscribeSyncSessionMissing(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Скидає спостереження «сесії немає», зроблене ДО входу. Анонімний пристрій
 * бачить `data: null` від `get-session` на кожному тіку writer-а (це норма), і
 * без скидання щойно залогінена людина бачила б «Сесія завершилась» аж до
 * наступного тіку (до ~36 с): `login`/`register` у SPA не перезавантажують
 * сторінку. Нове спостереження драйна після входу виставить сигнал знову, якщо
 * сесії справді нема.
 */
export function resetSyncSessionMissing(): void {
  setSessionMissing(false);
}

/** Test-only: скинути стан і слухачів між специфікаціями. */
export function __resetSyncSessionSignalForTests(): void {
  sessionMissing = false;
  listeners.clear();
}
