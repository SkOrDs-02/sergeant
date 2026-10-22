import {
  NUTRITION_PREFS_MERGE_FIELD,
  type NutritionPrefsSyncRow,
} from "@sergeant/shared";

/**
 * data-04 (аудит 2026-10-01): патч prefs для sync-outbox.
 *
 * WHY. Повний `prefs_json`, зібраний із холодного/застарілого кешу, затирав на
 * сервері шаблони страв, ціль ккал, воду й нагадування, яких клієнт не
 * торкався. Тепер у outbox їдуть лише ЗМІНЕНІ верхні ключі з
 * `prefs_merge: true` (сервер: `prefs_json || patch`). Локальний SQLite-запис
 * лишається повним знімком, патч стосується тільки мережі.
 */
export interface NutritionPrefsPatch {
  /** Змінені/додані верхні ключі `prefs_json`. */
  readonly keys: Readonly<Record<string, unknown>>;
  /** `active_pantry_id` змінився (сервер патчить його лише за наявності ключа). */
  readonly activePantryChanged: boolean;
}

interface PrefsLike {
  readonly prefsJson: string;
  readonly activePantryId: string | null;
}

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(json || "{}");
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Обчислює патч `prev → next` по верхніх ключах.
 *
 * Повертає `undefined` (= повна заміна, як раніше), коли патч не можна
 * виразити безпечно:
 *  - нема `prev` (перше створення): на сервері може не бути рядка, а
 *    `INSERT` з патчем створив би рядок із самим патчем замість повного blob;
 *  - `prev`/`next` не розбираються як JSON-обʼєкт;
 *  - ключ зник у `next`: патч «пропуск» ключ не видаляє.
 */
export function computePrefsPatch(
  prev: PrefsLike | null,
  next: PrefsLike,
): NutritionPrefsPatch | undefined {
  if (!prev) return undefined;
  const p = parseObject(prev.prefsJson);
  const n = parseObject(next.prefsJson);
  if (!p || !n) return undefined;
  for (const k of Object.keys(p)) {
    if (!(k in n)) return undefined;
  }
  const keys: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) {
    if (!(k in p) || JSON.stringify(p[k]) !== JSON.stringify(v)) keys[k] = v;
  }
  return {
    keys,
    activePantryChanged: prev.activePantryId !== next.activePantryId,
  };
}

/** Патч порожній: нічого слати (семантично prefs не змінились). */
export function isEmptyPrefsPatch(patch: NutritionPrefsPatch): boolean {
  return Object.keys(patch.keys).length === 0 && !patch.activePantryChanged;
}

/** `row` для outbox-опа `nutrition_prefs`: патч або повний знімок. */
export function buildPrefsOutboxRow(
  userId: string,
  prefs: PrefsLike,
  patch?: NutritionPrefsPatch,
): NutritionPrefsSyncRow {
  if (!patch) {
    return {
      user_id: userId,
      prefs_json: prefs.prefsJson ?? "{}",
      active_pantry_id: prefs.activePantryId ?? null,
    };
  }
  const row: NutritionPrefsSyncRow = {
    user_id: userId,
    prefs_json: JSON.stringify(patch.keys),
    [NUTRITION_PREFS_MERGE_FIELD]: true,
  };
  if (patch.activePantryChanged) row.active_pantry_id = prefs.activePantryId;
  return row;
}
