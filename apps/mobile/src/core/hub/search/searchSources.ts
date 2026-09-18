/**
 * HubSearch — mobile per-module data sources.
 *
 * All module data is now read from SQLite warm caches — the MMKV shard
 * reads (`finyk_tx_cache`, `finyk_subs`, `fizruk_workouts_v1`,
 * `fizruk_custom_exercises_v1`, `nutrition_log_v1`) are retired.
 *
 * Cache → source mapping after teardown:
 *  - Finyk transactions → `getCachedFinykMonoMirrorState().transactions`
 *  - Finyk subscriptions → `getCachedFinykSqliteState().subscriptions`
 *  - Fizruk workouts     → `getCachedFizrukSqliteState().workouts`
 *  - Fizruk custom exs   → `getCachedFizrukSqliteState().customExercises`
 *  - Nutrition log       → `getCachedNutritionSqliteState().log`
 *  - Routine habits      → `getCachedSqliteRoutineState()` (already migrated)
 *
 * `FizrukData.EXERCISES` (built-in catalogue) is domain-pure and not
 * MMKV-backed — it is kept as-is.
 */

import { FizrukData } from "@sergeant/fizruk-domain";
import { formatMoney } from "@sergeant/shared";

import { getCachedFinykSqliteState } from "@/modules/finyk/lib/sqliteReader";
import { getCachedFinykMonoMirrorState } from "@/modules/finyk/lib/monoMirrorReader";
import { getCachedFizrukSqliteState } from "@/modules/fizruk/lib/sqliteReader";
import { getCachedNutritionSqliteState } from "@/modules/nutrition/lib/sqliteReader";
import { getCachedSqliteRoutineState } from "@/modules/routine/lib/sqliteReader";

import { tokenize } from "./hubSearchRecents";
import { searchActions, searchAiHandoff } from "./searchActions";
import { searchAssistantTools, searchSettings } from "./searchSettings";
import { type Hit, localDateKey, pushScored } from "./searchTypes";

function searchFinyk(tokens: string[]): Hit[] {
  const results: Hit[] = [];

  // Mono transactions from the SQLite mirror cache (tombstoned `finyk_tx_cache`).
  const txList = getCachedFinykMonoMirrorState().transactions;
  for (const tx of txList) {
    const amtRaw = Number(tx.amount);
    const amount = (Number.isFinite(amtRaw) ? amtRaw : 0) / 100;
    const time = tx.time ?? 0;
    const stop = pushScored(
      results,
      {
        id: `finyk_tx_${tx.id || time}`,
        module: "finyk",
        moduleLabel: "Фінік",
        title: tx.description || tx.note || "Транзакція",
        subtitle: `${formatMoney(amount, { signed: true, maxFractionDigits: 2 })} · ${time > 1e10 ? localDateKey(new Date(time)) : localDateKey(new Date(time * 1000))}`,
        icon: "💳",
        target: { kind: "module", moduleId: "finyk" },
      },
      tokens,
      20,
    );
    if (stop) break;
  }

  // Subscriptions from the SQLite warm cache (tombstoned `finyk_subs` key).
  // `monthlyCost` is in UAH (display units) — use `formatMoney` directly.
  const subs = getCachedFinykSqliteState().subscriptions;
  for (const s of subs) {
    const cost = s.monthlyCost;
    pushScored(
      results,
      {
        id: `finyk_sub_${s.id}`,
        module: "finyk",
        moduleLabel: "Фінік",
        title: s.name || "Підписка",
        subtitle: `Підписка · ${cost != null && Number.isFinite(cost) && cost > 0 ? formatMoney(cost) : ""}`,
        icon: "🔄",
        target: { kind: "module", moduleId: "finyk" },
      },
      tokens,
      25,
    );
  }

  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

function searchFizruk(tokens: string[]): Hit[] {
  const results: Hit[] = [];

  // Built-in catalogue from `@sergeant/fizruk-domain` — пошук «жим» (Жим
  // лежачи) знаходить вправу навіть без кастомного запису.
  for (const ex of FizrukData.EXERCISES) {
    if (!ex || typeof ex !== "object") continue;
    const nameUk = ex.name?.uk;
    if (!nameUk) continue;
    const groupUk =
      (ex.primaryGroup &&
        FizrukData.PRIMARY_GROUPS_UK[ex.primaryGroup as string]) ||
      ex.primaryGroupUk ||
      ex.primaryGroup ||
      "";
    const aliases = Array.isArray(ex.aliases) ? ex.aliases.join(" ") : "";
    const stop = pushScored(
      results,
      {
        id: `fizruk_cat_${ex.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: nameUk,
        subtitle: `${groupUk} · ${ex.name?.en ?? ""} ${aliases}`.trim(),
        icon: "💪",
        target: { kind: "module", moduleId: "fizruk" },
      },
      tokens,
      8,
    );
    if (stop) break;
  }
  for (const r of results) {
    const ex = FizrukData.EXERCISES.find((e) => `fizruk_cat_${e?.id}` === r.id);
    if (!ex) continue;
    const groupUk =
      (ex.primaryGroup &&
        FizrukData.PRIMARY_GROUPS_UK[ex.primaryGroup as string]) ||
      ex.primaryGroupUk ||
      ex.primaryGroup ||
      "Вправа";
    r.subtitle = `${groupUk} · з каталогу Фізрука`;
  }

  // Workouts from the SQLite warm cache (tombstoned `fizruk_workouts_v1` key).
  // `Workout.items[].nameUk` is the exercise name in the typed schema.
  const workouts = getCachedFizrukSqliteState().workouts;
  for (const w of workouts) {
    const exNames = w.items
      .slice(0, 2)
      .map((i) => i.nameUk)
      .filter(Boolean);
    const dateLabel = w.startedAt ? localDateKey(new Date(w.startedAt)) : "";
    const combinedTitle = w.note || exNames.join(", ") || "Тренування";
    const fullTokensText = w.items
      .map((i) => i.nameUk)
      .filter(Boolean)
      .join(" ");
    const stop = pushScored(
      results,
      {
        id: `fizruk_w_${w.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: combinedTitle,
        subtitle:
          dateLabel +
          (w.items.length
            ? ` · ${w.items.length} вправ · ${fullTokensText}`
            : ""),
        icon: "🏋️",
        target: { kind: "module", moduleId: "fizruk" },
      },
      tokens,
      10,
    );
    if (stop) break;
  }

  // Custom exercises from the SQLite warm cache (tombstoned `fizruk_custom_exercises_v1`).
  // `RawExerciseDef.name` is `{ uk, en }` and `muscles` is `{ primary, secondary }`.
  const customExercises = getCachedFizrukSqliteState().customExercises;
  for (const e of customExercises) {
    const stop = pushScored(
      results,
      {
        id: `fizruk_ex_${e.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: e.name?.uk || "Вправа",
        subtitle:
          [...(e.muscles?.primary ?? []), ...(e.muscles?.secondary ?? [])].join(
            ", ",
          ) || "Власна вправа",
        icon: "💪",
        target: { kind: "module", moduleId: "fizruk" },
      },
      tokens,
      15,
    );
    if (stop) break;
  }

  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

interface RoutineHabit {
  id?: string;
  name?: string;
  emoji?: string;
  archived?: boolean;
  recurrence?: string;
}

function searchRoutine(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  // Read from the SQLite warm cache (tombstoned `hub_routine_v1` MMKV key).
  const sqliteState = getCachedSqliteRoutineState();
  if (sqliteState.refreshedAt === null) return results;
  const habits: RoutineHabit[] = sqliteState.habits;
  for (const h of habits) {
    if (!h || typeof h !== "object") continue;
    const title = `${h.emoji || ""} ${h.name || "Звичка"}`.trim();
    const stop = pushScored(
      results,
      {
        id: `routine_h_${h.id}`,
        module: "routine",
        moduleLabel: "Рутина",
        title,
        subtitle: h.archived ? "Архівовано" : h.recurrence || "daily",
        icon: "✅",
        target: { kind: "module", moduleId: "routine" },
      },
      tokens,
      10,
    );
    if (stop) break;
  }
  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

function searchNutrition(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  const seen = new Set<string>();
  // Read from the SQLite warm cache (tombstoned `nutrition_log_v1` MMKV key).
  const log = getCachedNutritionSqliteState().log;
  const dates = Object.keys(log).sort().reverse();

  for (const date of dates) {
    const meals = log[date]?.meals ?? [];
    for (const m of meals) {
      if (!m || typeof m !== "object") continue;
      const key = m.name || `${date}_${m.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stop = pushScored(
        results,
        {
          id: `nutrition_m_${m.id || date}`,
          module: "nutrition",
          moduleLabel: "Харчування",
          title: m.name || "Прийом їжі",
          subtitle: `${date} · ${m.macros.kcal ?? 0} ккал`,
          icon: "🥗",
          target: { kind: "module", moduleId: "nutrition" },
        },
        tokens,
        10,
      );
      if (stop) break;
    }
    if (results.length >= 10) break;
  }
  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

export function performSearch(query: string): Hit[] {
  const tokens = tokenize(query);
  // Empty query: launcher landing — only the four quick-add Actions so the
  // palette doubles as a Spotlight-style command bar (no FAB lookup needed).
  if (tokens.length === 0) return searchActions(tokens);
  return [
    ...searchActions(tokens),
    ...searchFinyk(tokens),
    ...searchFizruk(tokens),
    ...searchRoutine(tokens),
    ...searchNutrition(tokens),
    ...searchSettings(tokens),
    ...searchAssistantTools(tokens),
    ...searchAiHandoff(query),
  ];
}
