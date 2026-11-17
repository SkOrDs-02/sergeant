/**
 * Last validated: 2026-10-22
 * Status: Active
 */
import {
  safeListSSKeys,
  safeReadStringSS,
  safeRemoveSS,
  safeWriteSS,
} from "./storage";

/**
 * Чернетки форм під замком застосунку (sec-13, priv-15, рішення власника
 * 2026-10-22).
 *
 * Під `locked`/`lockedOut` дерево маршруту розмонтоване, тож незбережена форма
 * зникла б разом із ним, а замок спрацьовує й при поверненні на вкладку. Форма,
 * яку люди реально заповнюють, зберігає чернетку при розмонтуванні, а після
 * розблокування відновлює її один раз.
 *
 * Життєвий цикл:
 * 1. Розмонтування форми кладе знімок у памʼять (`stashFormDraft`). Це
 *    відбувається при КОЖНОМУ розмонтуванні, не лише під замком.
 * 2. Оболонка, побачивши перехід у `locked`/`lockedOut`, викликає
 *    `commitStashedFormDrafts`: у sessionStorage потрапляє лише те, що
 *    розмонтувалось у цьому ж коміті (вікно {@link STASH_COMMIT_WINDOW_MS}).
 *    Звичайна навігація чернеток не лишає.
 * 3. Форма на маунті читає чернетку (`peekFormDraft`), застосовує і стирає
 *    (`clearFormDraft`): відновлення одноразове.
 * 4. Незатребувані чернетки стирає оболонка через
 *    {@link UNCLAIMED_SWEEP_MS} після розблокування, а при виході з акаунта їх
 *    стирає `purgeAppOwnedSessionStorage` (ключі з префіксом `sergeant.`).
 *    Ключ містить id користувача, а `discardFormDraftsExcept` прибирає чужі.
 *
 * Перехоплення бази іншою вкладкою (data-45): форма там не розмонтована до
 * кінця, тож живі форми реєструються (`registerLiveFormDraft`), а оболонка
 * перед віддачею бази викликає `flushLiveFormDrafts` - знімки йдуть прямо в
 * sessionStorage, і відновлення після перезавантаження - те саме `peekFormDraft`.
 *
 * AI-CONTEXT: sessionStorage читається інспектором, як і весь клієнтський
 * стан; замок закриває DOM, а не сховище. Чернетка живе лише між замиканням і
 * розблокуванням однієї вкладки.
 */
/** Id форм, що зберігають чернетку під замком (один на форму). */
export const FORM_DRAFT_IDS = {
  finykManualExpense: "finyk.manualExpense",
  nutritionMeal: "nutrition.meal",
  routineHabit: "routine.habit",
  hubChatInput: "hub.chatInput",
} as const;

const KEY_PREFIX = "sergeant.formDraft.v1|";

/** Скільки живе знімок у памʼяті до коміту: розмонтування й ефект замка в одному коміті. */
export const STASH_COMMIT_WINDOW_MS = 1000;
/** Скільки чекаємо після розблокування, поки форми заберуть свої чернетки. */
export const UNCLAIMED_SWEEP_MS = 10_000;
/** Чернетка старша за це не відновлюється. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface Envelope {
  savedAt: number;
  data: unknown;
}

interface StashEntry {
  data: unknown;
  stashedAt: number;
}

const stash = new Map<string, StashEntry>();
let currentUserKey = "anon";

function userKeyOf(userId: string | null): string {
  return userId ? encodeURIComponent(userId) : "anon";
}

function keyFor(userKey: string, formId: string): string {
  return `${KEY_PREFIX}${userKey}|${formId}`;
}

/** Користувач, чиєю партицією читаються чернетки (виставляє оболонка). */
export function setFormDraftUser(userId: string | null): void {
  currentUserKey = userKeyOf(userId);
}

/** Запамʼятати знімок форми в памʼяті; у сховище він потрапить лише при замку. */
export function stashFormDraft(formId: string, data: unknown): void {
  stash.set(formId, { data, stashedAt: Date.now() });
}

/**
 * Записати в sessionStorage знімки, що розмонтувались щойно (у цьому ж
 * коміті), і спорожнити памʼять. Повертає кількість записаних чернеток.
 */
export function commitStashedFormDrafts(userId: string | null): number {
  const now = Date.now();
  const userKey = userKeyOf(userId);
  let written = 0;
  for (const [formId, entry] of stash) {
    if (now - entry.stashedAt > STASH_COMMIT_WINDOW_MS) continue;
    let raw: string;
    try {
      const envelope: Envelope = { savedAt: now, data: entry.data };
      raw = JSON.stringify(envelope);
    } catch {
      continue;
    }
    if (safeWriteSS(keyFor(userKey, formId), raw)) written += 1;
  }
  stash.clear();
  return written;
}

const live = new Map<string, () => unknown>();

/**
 * Зареєструвати живу форму: читач її поточного знімка (або `null`). Потрібно
 * для випадку, коли форму не розмонтовано, а вкладка мусить віддати базу
 * (`flushLiveFormDrafts`). Повертає функцію зняття реєстрації.
 */
export function registerLiveFormDraft(
  formId: string,
  read: () => unknown,
): () => void {
  live.set(formId, read);
  return () => {
    if (live.get(formId) === read) live.delete(formId);
  };
}

/**
 * Синхронно записати в sessionStorage знімки всіх ЖИВИХ форм (data-45:
 * перехоплення бази іншою вкладкою). Викликається ДО віддачі бази і лока:
 * sessionStorage-запис синхронний і дешевий, тож окремого дедлайну не треба,
 * а інша вкладка не чекає довше, ніж триває `setItem`. Повертає кількість
 * записаних чернеток.
 */
export function flushLiveFormDrafts(userId: string | null): number {
  const now = Date.now();
  const userKey = userKeyOf(userId);
  let written = 0;
  for (const [formId, read] of live) {
    let data: unknown;
    try {
      data = read();
    } catch {
      continue;
    }
    if (data === null || data === undefined) continue;
    try {
      const envelope: Envelope = { savedAt: now, data };
      if (safeWriteSS(keyFor(userKey, formId), JSON.stringify(envelope))) {
        written += 1;
      }
    } catch {
      continue;
    }
  }
  return written;
}

/** Прочитати чернетку, не стираючи її. `null` — немає, прострочена чи зіпсована. */
export function peekFormDraft<T>(formId: string): T | null {
  const key = keyFor(currentUserKey, formId);
  const raw = safeReadStringSS(key, "");
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as Partial<Envelope> | null;
    if (
      !envelope ||
      typeof envelope.savedAt !== "number" ||
      Date.now() - envelope.savedAt > MAX_AGE_MS ||
      envelope.data === undefined ||
      envelope.data === null
    ) {
      safeRemoveSS(key);
      return null;
    }
    return envelope.data as T;
  } catch {
    safeRemoveSS(key);
    return null;
  }
}

/** Стерти чернетку форми (після відновлення, сабміту чи явного закриття). */
export function clearFormDraft(formId: string): void {
  safeRemoveSS(keyFor(currentUserKey, formId));
  stash.delete(formId);
}

function removeWhere(predicate: (key: string) => boolean): number {
  let removed = 0;
  for (const key of safeListSSKeys()) {
    if (key.startsWith(KEY_PREFIX) && predicate(key) && safeRemoveSS(key)) {
      removed += 1;
    }
  }
  return removed;
}

/** Стерти чернетки всіх користувачів, крім поточного. */
export function discardFormDraftsExcept(userId: string | null): number {
  const own = `${KEY_PREFIX}${userKeyOf(userId)}|`;
  stash.clear();
  return removeWhere((key) => !key.startsWith(own));
}

/** Стерти всі чернетки (незатребувані після розблокування). */
export function discardAllFormDrafts(): number {
  stash.clear();
  return removeWhere(() => true);
}
