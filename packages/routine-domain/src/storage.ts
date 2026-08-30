/**
 * Pure storage helpers for the Routine module — DOM-free.
 *
 * Owns the storage-key constants, event names, the canonical
 * default-state shape, and pure normalization / parse helpers. Platform
 * adapters (`apps/web/src/modules/routine/lib/routineStorage.ts` for
 * localStorage, `apps/mobile/src/modules/routine/*` for MMKV) consume
 * these to convert raw strings/objects into a valid `RoutineState`
 * without any DOM or React Native APIs sneaking into this package.
 *
 * Extracted from `apps/web/src/modules/routine/lib/routineStorage.ts`
 * (Phase 5 / PR 2). Behaviour is unchanged on web after extraction
 * because the web adapter re-exports these under the historical names.
 */

import { dateKeyFromDate } from "./dateKeys.js";
import { DEFAULT_ROUTINE_GLYPH, upgradeHabitGlyph } from "./glyphs.js";
import { reconcileHabitOrder } from "./habitOrder.js";
import {
  SKIP_REASONS,
  type Category,
  type Habit,
  type HabitSkip,
  type PauseInterval,
  type RoutineState,
  type SkipReason,
} from "./types.js";

/** localStorage / MMKV key for the whole routine state blob. */
export const ROUTINE_STORAGE_KEY = "hub_routine_v1";

/** Custom DOM event name emitted on every successful state write. */
export const ROUTINE_EVENT = "hub-routine-storage";

/** Custom DOM event name emitted when persistence fails (quota etc.). */
export const ROUTINE_STORAGE_ERROR = "hub-routine-storage-error";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Current on-disk schema version. Bump with any breaking shape change.
 *
 * `4` — гнучкий стрік (Хвиля 4): `RoutineState.skips` і
 * `Habit.pauseIntervals`. Стара форма читається без міграції — обидва поля
 * необовʼязкові й нормалізуються в порожні.
 */
export const ROUTINE_SCHEMA_VERSION = 4;

/** Максимальна довжина вільної нотатки до пропуску. */
export const SKIP_NOTE_MAX_LENGTH = 200;

/**
 * Generate a collision-resistant id with a domain prefix.
 */
export function routineUid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * Filter reminder-time strings to well-formed `HH:MM` entries. Used
 * both on load/normalization and on createHabit/updateHabit.
 */
export function normalizeReminderTimesStorage(rt: unknown): string[] {
  if (!Array.isArray(rt)) return [];
  return rt.filter(
    (t): t is string => typeof t === "string" && /^\d{2}:\d{2}$/.test(t),
  );
}

/** Prune duplicates and invalid date keys from a single habit's completion list. */
export function normalizeCompletionList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v === "string" && DATE_KEY_RE.test(v)) seen.add(v);
  }
  return [...seen].sort();
}

/** Coerce the whole completions map into `{ [habitId]: sortedUniqueDateKeys }`. */
export function normalizeCompletionsMap(
  raw: unknown,
): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = normalizeCompletionList(v);
  }
  return out;
}

/**
 * Coerce a raw pause-interval list into well-formed, sorted, non-overlapping
 * intervals. Битий запис відкидається цілком — інтервал із невалідною межею
 * тихо ховав би дні з розкладу, і це було б непомітно на всіх поверхнях.
 */
export function normalizePauseIntervals(raw: unknown): PauseInterval[] {
  if (!Array.isArray(raw)) return [];
  const out: PauseInterval[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const iv = v as Partial<PauseInterval>;
    if (typeof iv.from !== "string" || !DATE_KEY_RE.test(iv.from)) continue;
    const to =
      iv.to === null || iv.to === undefined
        ? null
        : typeof iv.to === "string" && DATE_KEY_RE.test(iv.to)
          ? iv.to
          : undefined;
    if (to === undefined) continue;
    if (to !== null && to < iv.from) continue;
    out.push({ from: iv.from, to });
  }
  out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  // Злиття перекриттів: два інтервали, що торкаються, — це один. Інакше
  // `pauseDays` у розкладі стріку рахувався б двічі.
  const merged: PauseInterval[] = [];
  for (const iv of out) {
    const last = merged[merged.length - 1];
    if (last && (last.to === null || iv.from <= last.to)) {
      if (last.to !== null && (iv.to === null || iv.to > last.to)) {
        merged[merged.length - 1] = { from: last.from, to: iv.to };
      }
      continue;
    }
    merged.push(iv);
  }
  return merged;
}

/** Normalize one `dateKey → HabitSkip` map for a single habit. */
export function normalizeSkipMap(raw: unknown): Record<string, HabitSkip> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, HabitSkip> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!DATE_KEY_RE.test(k)) continue;
    if (!v || typeof v !== "object") continue;
    const s = v as Partial<HabitSkip>;
    const reason = SKIP_REASONS.includes(s.reason as SkipReason)
      ? (s.reason as SkipReason)
      : "other";
    const note =
      typeof s.note === "string" && s.note.trim()
        ? s.note.trim().slice(0, SKIP_NOTE_MAX_LENGTH)
        : undefined;
    out[k] = {
      reason,
      at: typeof s.at === "string" ? s.at : new Date(0).toISOString(),
      ...(note === undefined ? {} : { note }),
    };
  }
  return out;
}

/** Coerce the whole skips map into `{ [habitId]: { [dateKey]: HabitSkip } }`. */
export function normalizeSkipsMap(
  raw: unknown,
): Record<string, Record<string, HabitSkip>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, HabitSkip>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const m = normalizeSkipMap(v);
    if (Object.keys(m).length > 0) out[k] = m;
  }
  return out;
}

/** Normalize a single habit record into the canonical shape. */
export function normalizeHabit(h: unknown): Habit {
  if (!h || typeof h !== "object") return h as Habit;
  const src = h as Partial<Habit> & Record<string, unknown>;
  const created = src.createdAt
    ? String(src.createdAt).slice(0, 10)
    : dateKeyFromDate(new Date());
  return {
    ...(src as Habit),
    // Гліф: legacy emoji → канонічний slug на кожному читанні. Див.
    // `glyphs.ts` — батч-міграції в БД немає, наступний запис закріплює.
    emoji: upgradeHabitGlyph(src.emoji) ?? DEFAULT_ROUTINE_GLYPH,
    recurrence: (src.recurrence as Habit["recurrence"]) || "daily",
    startDate: src.startDate || created,
    endDate: src.endDate === undefined ? null : (src.endDate ?? null),
    timeOfDay: src.timeOfDay === undefined ? "" : String(src.timeOfDay),
    reminderTimes: normalizeReminderTimesStorage(src.reminderTimes),
    weekdays:
      Array.isArray(src.weekdays) && src.weekdays.length > 0
        ? (src.weekdays as number[])
        : [0, 1, 2, 3, 4, 5, 6],
    pauseIntervals: normalizePauseIntervals(src.pauseIntervals),
  };
}

/**
 * Normalize a single category record.
 *
 * Категорія має лише `id` / `name` / гліф, тож єдина робота тут — той самий
 * legacy-emoji → slug апгрейд, що й для звички. На відміну від звички гліф
 * категорії необовʼязковий: `undefined` означає «без іконки», і список у
 * налаштуваннях малює нейтральний плейсхолдер, а не дефолтний `check`.
 */
export function normalizeCategory(c: unknown): Category {
  if (!c || typeof c !== "object") return c as Category;
  const src = c as Partial<Category> & Record<string, unknown>;
  const glyph = upgradeHabitGlyph(src.emoji);
  const base: Category = { id: String(src.id), name: String(src.name ?? "") };
  return glyph ? { ...base, emoji: glyph } : base;
}

/**
 * Canonical starting state for a fresh install. Pure — returns a new
 * object on every call so callers can mutate it safely.
 */
export function defaultRoutineState(): RoutineState {
  return {
    schemaVersion: ROUTINE_SCHEMA_VERSION,
    prefs: {
      showFizrukInCalendar: true,
      /** Планові списання підписок Фініка в календарі Hub */
      showFinykSubscriptionsInCalendar: true,
      /** Локальні нагадування у вказаний час */
      routineRemindersEnabled: false,
    },
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    /** habitId -> dateKey -> «не зміг з причиною» (канон §5) */
    skips: {},
    /** порядок id активних звичок (drag/up-down) */
    habitOrder: [],
    /** completionNoteKey -> короткий текст */
    completionNotes: {},
  };
}

/**
 * Return `state` with `habitOrder` normalized so it references every
 * active habit exactly once, and flag whether it actually changed —
 * so callers can persist only when needed.
 */
export function ensureHabitOrder(state: RoutineState): {
  state: RoutineState;
  changed: boolean;
} {
  const active = state.habits.filter((h) => !h.archived).map((h) => h.id);
  const order = reconcileHabitOrder(active, state.habitOrder || []);
  const prev = state.habitOrder || [];
  const same =
    order.length === prev.length && order.every((id, i) => id === prev[i]);
  if (same) return { state, changed: false };
  return { state: { ...state, habitOrder: order }, changed: true };
}

/**
 * Pure routine-state normalizer. Takes a parsed JSON payload (or `null`)
 * from the persistence layer and produces a valid `RoutineState`.
 *
 * Intentionally does NOT perform any side-effectful "finalization" that
 * the web adapter does — callers decide whether/how to persist the
 * normalized result (e.g. `routineStorage.ts` finalizes + saves; the
 * mobile hook just keeps it in memory until the next write).
 */
export function normalizeRoutineState(raw: unknown): RoutineState {
  const base = defaultRoutineState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const p = raw as Partial<RoutineState> & Record<string, unknown>;
  return {
    ...base,
    ...p,
    prefs: { ...base.prefs, ...((p.prefs as RoutineState["prefs"]) || {}) },
    tags: Array.isArray(p.tags) ? p.tags : [],
    categories: Array.isArray(p.categories)
      ? p.categories.map(normalizeCategory)
      : [],
    habits: Array.isArray(p.habits) ? p.habits.map(normalizeHabit) : [],
    completions: normalizeCompletionsMap(p.completions),
    skips: normalizeSkipsMap(p.skips),
    habitOrder: Array.isArray(p.habitOrder) ? (p.habitOrder as string[]) : [],
    completionNotes:
      typeof p.completionNotes === "object" && p.completionNotes
        ? (p.completionNotes as Record<string, string>)
        : {},
  };
}

/**
 * Parse a raw string (e.g. read from MMKV/localStorage) into a
 * `RoutineState`. Falls back to `defaultRoutineState()` on malformed
 * JSON or wrong top-level shape.
 */
export function parseRoutineState(
  raw: string | null | undefined,
): RoutineState {
  if (!raw) return defaultRoutineState();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeRoutineState(parsed);
  } catch {
    return defaultRoutineState();
  }
}

/** Serialize a `RoutineState` to a JSON string for persistence. */
export function serializeRoutineState(state: RoutineState): string {
  return JSON.stringify(state);
}
