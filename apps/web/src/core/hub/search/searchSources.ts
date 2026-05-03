import { formatMoney, formatMoneyFromKopecks } from "@sergeant/shared";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { tokenize } from "../hubSearchEngine";
import { searchActions, searchAiHandoff } from "./searchActions";
import {
  parseFizrukCustomExercises,
  parseFizrukWorkouts,
  safeParseLS,
} from "./searchCache";
import { searchAssistantTools, searchSettings } from "./searchSettings";
import { type Hit, localDateKey, pushScored } from "./searchTypes";

interface FinykTx {
  id?: string;
  time?: number;
  amount?: number;
  description?: string;
  comment?: string;
}

interface FinykSub {
  id?: string;
  name?: string;
  amount?: number;
}

function searchFinyk(tokens: string[]): Hit[] {
  const results: Hit[] = [];

  const txList = safeParseLS<FinykTx[]>("finyk_tx_cache", []);
  if (Array.isArray(txList)) {
    for (const tx of txList) {
      if (!tx || typeof tx !== "object") continue;
      const amtRaw = Number(tx.amount);
      const amount = (Number.isFinite(amtRaw) ? amtRaw : 0) / 100;
      const time = tx.time ?? 0;
      const stop = pushScored(
        results,
        {
          id: `finyk_tx_${tx.id || time}`,
          module: "finyk",
          moduleLabel: "Фінік",
          title: tx.description || tx.comment || "Транзакція",
          subtitle: `${formatMoney(amount, { signed: true, maxFractionDigits: 2 })} · ${time > 1e10 ? localDateKey(new Date(time)) : localDateKey(new Date(time * 1000))}`,
          icon: "💳",
          target: { kind: "module", moduleId: "finyk" },
        },
        tokens,
        20,
      );
      if (stop) break;
    }
  }

  const subs = safeParseLS<FinykSub[]>("finyk_subs", []);
  if (Array.isArray(subs)) {
    for (const s of subs) {
      if (!s || typeof s !== "object") continue;
      const amtRaw = Number(s.amount);
      const amt = Number.isFinite(amtRaw) && amtRaw > 0 ? amtRaw : 0;
      pushScored(
        results,
        {
          id: `finyk_sub_${s.id}`,
          module: "finyk",
          moduleLabel: "Фінік",
          title: s.name || "Підписка",
          subtitle: `Підписка · ${amt ? formatMoneyFromKopecks(amt) : ""}`,
          icon: "🔄",
          target: { kind: "module", moduleId: "finyk" },
        },
        tokens,
        25,
      );
    }
  }

  return results.sort((a, b) => b._score - a._score).slice(0, 10);
}

function searchFizruk(tokens: string[]): Hit[] {
  const results: Hit[] = [];

  const workouts = parseFizrukWorkouts(
    safeReadStringLS("fizruk_workouts_v1", null),
  );
  for (const w of workouts) {
    if (!w || typeof w !== "object") continue;
    const itemsRaw = Array.isArray(w.items) ? w.items : [];
    const exNames = itemsRaw
      .slice(0, 2)
      .map((i) => (i && (i.exerciseName || i.name)) || "")
      .filter(Boolean);
    const dateLabel = w.startedAt ? localDateKey(new Date(w.startedAt)) : "";
    const combinedTitle = w.note || exNames.join(", ") || "Тренування";
    // subtitle додатково "розширює" текст усіма вправами, щоб токен
    // типу "присідання" знайшовся навіть коли він не в `note`.
    const fullTokensText = itemsRaw
      .map((i) => (i && (i.exerciseName || i.name)) || "")
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
          (itemsRaw.length
            ? ` · ${itemsRaw.length} вправ · ${fullTokensText}`
            : ""),
        icon: "🏋️",
        target: { kind: "module", moduleId: "fizruk" },
      },
      tokens,
      10,
    );
    if (stop) break;
  }

  const exercises = parseFizrukCustomExercises(
    safeReadStringLS("fizruk_custom_exercises_v1", null),
  );
  for (const e of exercises) {
    if (!e || typeof e !== "object") continue;
    const stop = pushScored(
      results,
      {
        id: `fizruk_ex_${e.id}`,
        module: "fizruk",
        moduleLabel: "Фізрук",
        title: e.name || "Вправа",
        subtitle:
          (Array.isArray(e.muscles) ? e.muscles : []).join(", ") ||
          "Власна вправа",
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

interface RoutineState {
  habits?: RoutineHabit[];
}

function searchRoutine(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  const state = safeParseLS<RoutineState | null>("hub_routine_v1", null);
  if (!state) return results;

  const habits = Array.isArray(state.habits) ? state.habits : [];
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

interface NutritionMeal {
  id?: string;
  name?: string;
  items?: Array<{ name?: string; emoji?: string }>;
  note?: string;
  type?: string;
  macros?: { kcal?: number; protein?: number; fat?: number; carbs?: number };
}

interface NutritionDayLog {
  meals?: NutritionMeal[];
}

type NutritionLog = Record<string, NutritionDayLog>;

function searchNutrition(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  const seen = new Set<string>();
  const log = safeParseLS<NutritionLog>("nutrition_log_v1", {});
  const dates = Object.keys(log).sort().reverse();

  for (const date of dates) {
    const dayLog = log[date] as NutritionDayLog | undefined;
    const meals = Array.isArray(dayLog?.meals) ? dayLog.meals : [];
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
          subtitle: `${date} · ${m.macros?.kcal ?? 0} ккал`,
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
  // Order matters for the rendered groups (see `flat`/`grouped` below).
  // Actions surface first so command-style queries («витрата», «trening»)
  // land on a do-it row before stale data; module hits follow because the
  // user may be chasing concrete records; settings + AI capabilities are
  // the «what can I do?» tail; AI handoff sits at the very end as the
  // graceful-degradation fallback when nothing structured matched.
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
