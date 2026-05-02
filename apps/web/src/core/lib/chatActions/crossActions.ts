import { ls, lsSet } from "../hubChatUtils";
import {
  CATEGORY_META,
  readMemoryEntries,
  removeMemoryEntry,
  upsertMemoryFact,
  writeMemoryEntries,
} from "../../profile/memoryBank";
import { safeReadLS, safeReadStringLS } from "@shared/lib/storage";
import {
  calcCategorySpent,
  getTxStatAmount,
} from "../../../modules/finyk/utils";
import {
  mergeExpenseCategoryDefinitions,
  INTERNAL_TRANSFER_ID,
} from "../../../modules/finyk/constants";
import {
  aggregateFinyk,
  aggregateFizruk,
  aggregateNutrition,
  aggregateRoutine,
  getWeekKey,
} from "../../insights/useWeeklyDigest";
import type {
  SetGoalAction,
  SpendingTrendAction,
  CategoryBreakdownAction,
  DetectAnomaliesAction,
  ConvertUnitsAction,
  SaveNoteAction,
  ListNotesAction,
  ExportModuleDataAction,
  RememberAction,
  ForgetAction,
  MyProfileAction,
  CompareWeeksAction,
  CompareWeeksModule,
  HabitState,
  Workout,
  NutritionDay,
  ChatAction,
  ChatActionResult,
} from "./types";

/**
 * Convert an ISO-8601 week label `YYYY-Www` (e.g. `2026-W17`) to the
 * `YYYY-MM-DD` of that week's Monday — the format `aggregate*` functions
 * expect. Also accepts a bare `YYYY-MM-DD` for resilience: when the model
 * "guesses" today's day key instead of the week key, we still do the right
 * thing by snapping to that week's Monday.
 *
 * Returns `null` if the input cannot be parsed.
 */
function weekLabelToMondayKey(input: string): string | null {
  const wwwMatch = /^(\d{4})-W(\d{1,2})$/.exec(input.trim());
  if (wwwMatch) {
    const year = Number(wwwMatch[1]);
    const week = Number(wwwMatch[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
    if (week < 1 || week > 53) return null;
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - (jan4Day - 1));
    const target = new Date(week1Monday);
    target.setDate(week1Monday.getDate() + (week - 1) * 7);
    return [
      target.getFullYear(),
      String(target.getMonth() + 1).padStart(2, "0"),
      String(target.getDate()).padStart(2, "0"),
    ].join("-");
  }
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (dayMatch) {
    const d = new Date(`${input.trim()}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return getWeekKey(d);
  }
  return null;
}

function previousWeekKey(weekKey: string): string {
  const monday = new Date(`${weekKey}T00:00:00`);
  monday.setDate(monday.getDate() - 7);
  return [
    monday.getFullYear(),
    String(monday.getMonth() + 1).padStart(2, "0"),
    String(monday.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatWeekRangeLabel(weekKey: string): string {
  const monday = new Date(`${weekKey}T00:00:00`);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function diffLine(label: string, a: number, b: number, unit: string): string {
  const delta = a - b;
  const sign = delta > 0 ? "+" : "";
  return `${label}: ${a}${unit} vs ${b}${unit} (${sign}${delta}${unit})`;
}

export function handleCrossAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "morning_briefing": {
      const now = new Date();
      const todayKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const parts: string[] = [
        `Доброго ранку! Сьогодні ${now.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" })}`,
      ];
      const routineState = ls<HabitState | null>("hub_routine_v1", null);
      if (routineState?.habits) {
        const activeHabits = routineState.habits.filter(
          (h) => !(h as Record<string, unknown>).archived,
        );
        const completions = routineState.completions || {};
        const done = activeHabits.filter(
          (h) =>
            Array.isArray(completions[h.id]) &&
            completions[h.id].includes(todayKey),
        );
        parts.push(`Звички: ${done.length}/${activeHabits.length} виконано`);
      }
      const wParsed = safeReadLS<Workout[] | { workouts?: Workout[] } | null>(
        "fizruk_workouts_v1",
        null,
      );
      let workouts: Workout[] = [];
      if (Array.isArray(wParsed)) workouts = wParsed;
      else if (wParsed && Array.isArray(wParsed.workouts))
        workouts = wParsed.workouts;
      const todayWorkouts = workouts.filter(
        (w) => w.startedAt.startsWith(todayKey) && w.planned && !w.endedAt,
      );
      if (todayWorkouts.length > 0) {
        parts.push(`Заплановано тренувань: ${todayWorkouts.length}`);
      }
      const nutritionLog = ls<Record<string, NutritionDay>>(
        "nutrition_log_v1",
        {},
      );
      const todayMeals = nutritionLog[todayKey]?.meals || [];
      const todayKcal = todayMeals.reduce(
        (s, m) => s + (m?.macros?.kcal ?? 0),
        0,
      );
      if (todayKcal > 0) {
        parts.push(`Калорії: ${Math.round(todayKcal)} ккал`);
      }
      return parts.join("\n");
    }
    case "weekly_summary": {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const parts: string[] = ["Тижневий підсумок:"];
      const wParsed = safeReadLS<Workout[] | { workouts?: Workout[] } | null>(
        "fizruk_workouts_v1",
        null,
      );
      let workouts: Workout[] = [];
      if (Array.isArray(wParsed)) workouts = wParsed;
      else if (wParsed && Array.isArray(wParsed.workouts))
        workouts = wParsed.workouts;
      const weekWorkouts = workouts.filter(
        (w) => w.endedAt && new Date(w.startedAt).getTime() > weekAgo.getTime(),
      );
      parts.push(`Тренувань: ${weekWorkouts.length}`);
      const totalVolume = weekWorkouts.reduce(
        (total, w) =>
          total +
          w.items.reduce(
            (s, item) =>
              s +
              item.sets.reduce((ss, set) => ss + set.weightKg * set.reps, 0),
            0,
          ),
        0,
      );
      if (totalVolume > 0)
        parts.push(`Об'єм: ${Math.round(totalVolume)} кг×повт`);
      const routineState = ls<HabitState | null>("hub_routine_v1", null);
      if (routineState?.habits) {
        const activeHabits = routineState.habits.filter(
          (h) => !(h as Record<string, unknown>).archived,
        );
        const completions = routineState.completions || {};
        let totalDone = 0;
        let totalPossible = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dk = [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0"),
          ].join("-");
          totalPossible += activeHabits.length;
          for (const h of activeHabits) {
            if (
              Array.isArray(completions[h.id]) &&
              completions[h.id].includes(dk)
            )
              totalDone++;
          }
        }
        const pct =
          totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;
        parts.push(`Звички: ${pct}% (${totalDone}/${totalPossible})`);
      }
      const nutritionLog = ls<Record<string, NutritionDay>>(
        "nutrition_log_v1",
        {},
      );
      const weekKcal: number[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dk = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, "0"),
          String(d.getDate()).padStart(2, "0"),
        ].join("-");
        const dayMeals = nutritionLog[dk]?.meals || [];
        const k = dayMeals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
        if (k > 0) weekKcal.push(k);
      }
      if (weekKcal.length > 0) {
        const avg = Math.round(
          weekKcal.reduce((a, b) => a + b, 0) / weekKcal.length,
        );
        parts.push(`Калорії: ~${avg} ккал/день (${weekKcal.length} днів)`);
      }
      const txCache = ls<{
        txs?: Array<{
          id: string;
          amount: number;
          time?: number;
          description?: string;
          mcc?: number;
        }>;
      } | null>("finyk_tx_cache", null);
      const txSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
      if (txCache?.txs) {
        const weekTs = weekAgo.getTime() / 1000;
        const weekTxs = txCache.txs.filter((t) => (t.time || 0) > weekTs);
        const spent = weekTxs
          .filter((t) => t.amount < 0)
          .reduce((s, t) => s + getTxStatAmount(t, txSplits), 0);
        parts.push(`Витрати: ${Math.round(spent)} грн`);
      }
      return parts.join("\n");
    }
    case "set_goal": {
      const {
        description,
        target_weight_kg,
        target_date,
        daily_kcal,
        workouts_per_week,
      } = (action as SetGoalAction).input;
      const desc = (description || "").trim();
      if (!desc) return "Потрібен опис цілі.";
      const goals = ls<
        Array<{
          id: string;
          description: string;
          targetWeightKg?: number;
          targetDate?: string;
          dailyKcal?: number;
          workoutsPerWeek?: number;
          createdAt: string;
        }>
      >("hub_goals_v1", []);
      const goal: (typeof goals)[0] = {
        id: `goal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        description: desc,
        createdAt: new Date().toISOString(),
      };
      const parts: string[] = [`Ціль "${desc}" створено`];
      if (target_weight_kg != null) {
        const tw = Number(target_weight_kg);
        if (Number.isFinite(tw) && tw > 0) {
          goal.targetWeightKg = tw;
          parts.push(`цільова вага: ${tw} кг`);
        }
      }
      if (target_date && /^\d{4}-\d{2}-\d{2}$/.test(target_date)) {
        goal.targetDate = target_date;
        parts.push(`дедлайн: ${target_date}`);
      }
      if (daily_kcal != null) {
        const dk = Number(daily_kcal);
        if (Number.isFinite(dk) && dk > 0) {
          goal.dailyKcal = dk;
          parts.push(`калорії: ${dk} ккал/день`);
          const prefs = ls<Record<string, unknown>>("nutrition_prefs_v1", {});
          prefs.dailyTargetKcal = dk;
          lsSet("nutrition_prefs_v1", prefs);
        }
      }
      if (workouts_per_week != null) {
        const wpw = Number(workouts_per_week);
        if (Number.isFinite(wpw) && wpw > 0) {
          goal.workoutsPerWeek = wpw;
          parts.push(`тренувань/тиждень: ${wpw}`);
        }
      }
      goals.push(goal);
      lsSet("hub_goals_v1", goals);
      return parts.join(", ") + ` (id:${goal.id})`;
    }
    // ── Аналітика ──────────────────────────────────────────────
    case "spending_trend": {
      const { period_days } = (action as SpendingTrendAction).input || {};
      const days = Number(period_days) || 30;
      const now = Date.now();
      const currentStart = now - days * 86400000;
      const prevStart = currentStart - days * 86400000;
      const txCache = ls<{
        txs?: Array<{
          id: string;
          amount: number;
          time?: number;
          description?: string;
          mcc?: number;
        }>;
      } | null>("finyk_tx_cache", null);
      const allTxs = txCache?.txs || [];
      const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
      const trendSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
      const txs = allTxs.filter((t) => !hiddenTxIds.includes(t.id || ""));
      const currentPeriod = txs.filter((t) => {
        const ts = (t.time || 0) * 1000;
        return ts >= currentStart && ts <= now;
      });
      const prevPeriod = txs.filter((t) => {
        const ts = (t.time || 0) * 1000;
        return ts >= prevStart && ts < currentStart;
      });
      const sumExpenses = (arr: typeof txs) =>
        arr
          .filter((t) => t.amount < 0)
          .reduce((s, t) => s + getTxStatAmount(t, trendSplits), 0);
      const sumIncome = (arr: typeof txs) =>
        arr.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount / 100, 0);
      const curExp = sumExpenses(currentPeriod);
      const prevExp = sumExpenses(prevPeriod);
      const curInc = sumIncome(currentPeriod);
      const change =
        prevExp > 0 ? Math.round(((curExp - prevExp) / prevExp) * 100) : 0;
      const avgPerDay = days > 0 ? Math.round(curExp / days) : 0;
      const parts: string[] = [
        `Тренд витрат за ${days} днів:`,
        `Витрати: ${Math.round(curExp)} грн (${avgPerDay} грн/день)`,
        `Дохід: ${Math.round(curInc)} грн`,
        `Попередній період: ${Math.round(prevExp)} грн`,
        `Зміна: ${change >= 0 ? "+" : ""}${change}%`,
        `Транзакцій: ${currentPeriod.length}`,
      ];
      return parts.join("\n");
    }
    case "category_breakdown": {
      const { period_days } = (action as CategoryBreakdownAction).input || {};
      const days = Number(period_days) || 30;
      const cutoff = Date.now() - days * 86400000;
      const txCache = ls<{
        txs?: Array<{
          id: string;
          amount: number;
          time?: number;
          description?: string;
          mcc?: number;
        }>;
      } | null>("finyk_tx_cache", null);
      const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
      const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
      const catMap = ls<Record<string, string>>("finyk_tx_cats", {});
      const breakdownSplits = ls<Record<string, unknown>>(
        "finyk_tx_splits",
        {},
      );
      const expenses = (txCache?.txs || []).filter((t) => {
        if (hiddenTxIds.includes(t.id || "")) return false;
        const ts = (t.time || 0) * 1000;
        return t.amount < 0 && ts >= cutoff;
      });
      interface CatDef {
        id: string;
        label: string;
      }
      const sorted = (mergeExpenseCategoryDefinitions(customC) as CatDef[])
        .filter((c) => c.id !== "income" && c.id !== INTERNAL_TRANSFER_ID)
        .map((c) => ({
          label: c.label,
          amount: calcCategorySpent(
            expenses,
            c.id,
            catMap,
            breakdownSplits,
            customC,
          ),
        }))
        .filter((c) => c.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      const total = sorted.reduce((s, c) => s + c.amount, 0);
      const parts: string[] = [
        `Витрати по категоріях за ${days} днів (${Math.round(total)} грн):`,
      ];
      for (const c of sorted.slice(0, 15)) {
        const pct = total > 0 ? Math.round((c.amount / total) * 100) : 0;
        parts.push(`  ${c.label}: ${Math.round(c.amount)} грн (${pct}%)`);
      }
      return parts.join("\n");
    }
    case "detect_anomalies": {
      const { period_days, threshold_multiplier } =
        (action as DetectAnomaliesAction).input || {};
      const days = Number(period_days) || 30;
      const threshold = Number(threshold_multiplier) || 3;
      const cutoff = Date.now() - days * 86400000;
      const txCache = ls<{
        txs?: Array<{
          id: string;
          amount: number;
          time?: number;
          description?: string;
          mcc?: number;
        }>;
      } | null>("finyk_tx_cache", null);
      const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
      const anomalySplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
      const expenses = (txCache?.txs || []).filter((t) => {
        if (hiddenTxIds.includes(t.id || "")) return false;
        const ts = (t.time || 0) * 1000;
        return t.amount < 0 && ts >= cutoff;
      });
      if (expenses.length < 3)
        return "Недостатньо транзакцій для аналізу аномалій.";
      const amounts = expenses
        .map((t) => getTxStatAmount(t, anomalySplits))
        .filter((a) => a > 0);
      if (amounts.length < 3)
        return "Недостатньо транзакцій для аналізу аномалій.";
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const anomalies = expenses
        .filter((t) => getTxStatAmount(t, anomalySplits) > avg * threshold)
        .sort(
          (a, b) =>
            getTxStatAmount(b, anomalySplits) -
            getTxStatAmount(a, anomalySplits),
        )
        .slice(0, 5);
      if (anomalies.length === 0) {
        return `За ${days} днів аномалій не виявлено (середня витрата: ${Math.round(avg)} грн, поріг: ${Math.round(avg * threshold)} грн).`;
      }
      const parts: string[] = [
        `Аномальні витрати за ${days} днів (середня: ${Math.round(avg)} грн, поріг ×${threshold}):`,
      ];
      for (const tx of anomalies) {
        const d = tx.time
          ? new Date(tx.time * 1000).toLocaleDateString("uk-UA")
          : "?";
        parts.push(
          `  ${d}: ${Math.round(getTxStatAmount(tx, anomalySplits))} грн — ${tx.description || "(без опису)"}`,
        );
      }
      return parts.join("\n");
    }
    case "convert_units": {
      const { value, from, to } = (action as ConvertUnitsAction).input;
      const v = Number(value);
      if (!Number.isFinite(v)) return "Значення має бути числом.";
      const f = (from || "").toLowerCase().trim();
      const t = (to || "").toLowerCase().trim();
      const conversions: Record<
        string,
        Record<string, (n: number) => number>
      > = {
        kg: { lb: (n) => n * 2.20462 },
        lb: { kg: (n) => n / 2.20462 },
        cm: { in: (n) => n / 2.54 },
        in: { cm: (n) => n * 2.54 },
        km: { mi: (n) => n * 0.621371 },
        mi: { km: (n) => n / 0.621371 },
        c: { f: (n) => (n * 9) / 5 + 32 },
        f: { c: (n) => ((n - 32) * 5) / 9 },
        kcal: { kj: (n) => n * 4.184 },
        kj: { kcal: (n) => n / 4.184 },
        m: { ft: (n) => n * 3.28084 },
        ft: { m: (n) => n / 3.28084 },
        g: { oz: (n) => n / 28.3495 },
        oz: { g: (n) => n * 28.3495 },
      };
      const fn = conversions[f]?.[t];
      if (!fn)
        return `Невідома конвертація: ${f} → ${t}. Підтримуються: kg↔lb, cm↔in, km↔mi, c↔f, kcal↔kj, m↔ft, g↔oz`;
      const result = Math.round(fn(v) * 100) / 100;
      return `${v} ${f} = ${result} ${t}`;
    }
    case "save_note": {
      const { text, tag } = (action as SaveNoteAction).input;
      const trimmed = (text || "").trim();
      if (!trimmed) return "Потрібен текст нотатки.";
      const notes = ls<
        Array<{ id: string; text: string; tag: string; createdAt: string }>
      >("hub_notes_v1", []);
      const note = {
        id: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed.slice(0, 1000),
        tag: (tag || "other").trim().toLowerCase(),
        createdAt: new Date().toISOString(),
      };
      notes.unshift(note);
      lsSet("hub_notes_v1", notes);
      const noteId = note.id;
      return {
        result: `Нотатку збережено: "${trimmed.slice(0, 50)}${trimmed.length > 50 ? "\u2026" : ""}" [${note.tag}] (id:${noteId})`,
        undo: () => {
          const cur = ls<
            Array<{
              id: string;
              text: string;
              tag: string;
              createdAt: string;
            }>
          >("hub_notes_v1", []);
          const next = cur.filter((n) => n.id !== noteId);
          if (next.length !== cur.length) lsSet("hub_notes_v1", next);
        },
      };
    }
    case "list_notes": {
      const { tag, limit } = (action as ListNotesAction).input || {};
      const max = Number(limit) || 10;
      const notes = ls<
        Array<{ id: string; text: string; tag: string; createdAt: string }>
      >("hub_notes_v1", []);
      if (notes.length === 0) return "Нотаток немає.";
      const filtered = tag
        ? notes.filter((n) => n.tag === tag.toLowerCase().trim())
        : notes;
      if (filtered.length === 0) return `Нотаток з тегом "${tag}" немає.`;
      const shown = filtered.slice(0, max);
      const parts: string[] = [`Нотатки (${filtered.length} всього):`];
      for (const n of shown) {
        const d = new Date(n.createdAt).toLocaleDateString("uk-UA");
        parts.push(
          `  [${n.tag}] ${n.text.slice(0, 80)}${n.text.length > 80 ? "\u2026" : ""} (${d})`,
        );
      }
      if (filtered.length > max) {
        parts.push(`  \u2026і ще ${filtered.length - max}`);
      }
      return parts.join("\n");
    }
    case "remember": {
      const { fact, category } = (action as RememberAction).input || {};
      try {
        const prevEntries = readMemoryEntries();
        const result = upsertMemoryFact(
          prevEntries,
          typeof fact === "string" ? fact : "",
          typeof category === "string" ? category : undefined,
        );
        writeMemoryEntries(result.entries);
        const meta = CATEGORY_META[result.entry.category];
        const label = meta?.label ?? result.entry.category;
        const resultStr = `${result.created ? "Запам'ятав" : "Оновив"}: ${result.entry.fact} (${label}, id:${result.entry.id})`;
        const entryId = result.entry.id;
        // Undo:
        // - якщо був created — просто видаляємо факт;
        // - якщо був updated — відновлюємо попередній entry з prevEntries.
        return {
          result: resultStr,
          undo: () => {
            if (result.created) {
              const cur = readMemoryEntries();
              const removed = removeMemoryEntry(cur, entryId);
              if (removed.removed) writeMemoryEntries(removed.entries);
              return;
            }
            const prev = prevEntries.find((e) => e.id === entryId);
            if (!prev) return;
            const cur = readMemoryEntries();
            const next = cur.map((e) => (e.id === entryId ? prev : e));
            writeMemoryEntries(next);
          },
        };
      } catch (error) {
        return error instanceof Error
          ? error.message
          : "Не вдалося зберегти факт у профіль.";
      }
    }
    case "forget": {
      const { fact_id } = (action as ForgetAction).input || {};
      const id = (fact_id || "").trim();
      if (!id) return "Потрібен id факту для видалення.";
      const result = removeMemoryEntry(readMemoryEntries(), id);
      if (!result.removed) return `Факт з id ${id} не знайдено.`;
      writeMemoryEntries(result.entries);
      return `Забув: ${result.removed.fact}`;
    }
    case "my_profile": {
      const { category } = (action as MyProfileAction).input || {};
      const profile = readMemoryEntries();
      if (profile.length === 0) return "Профіль пам'яті порожній.";
      const cat = category?.trim().toLowerCase();
      const filtered = cat
        ? profile.filter((entry) => entry.category.toLowerCase() === cat)
        : profile;
      if (filtered.length === 0) {
        return `У профілі немає записів для категорії "${category}".`;
      }
      const parts = [`Профіль користувача (${filtered.length}):`];
      for (const entry of filtered) {
        const meta = CATEGORY_META[entry.category];
        parts.push(
          `  - [${meta?.label ?? entry.category}] ${entry.fact} (id:${entry.id})`,
        );
      }
      return parts.join("\n");
    }
    case "export_module_data": {
      const { module, format } = (action as ExportModuleDataAction).input;
      const mod = (module || "").toLowerCase().trim();
      const fmt = (format || "text").toLowerCase().trim();
      const exportData = (key: string, label: string) => {
        const raw = safeReadStringLS(key);
        if (!raw) return `${label}: немає даних.`;
        if (fmt === "json")
          return `${label} (JSON):\n${raw.slice(0, 3000)}${raw.length > 3000 ? "\n\u2026(обрізано)" : ""}`;
        try {
          const parsed = JSON.parse(raw);
          return `${label}: ${JSON.stringify(parsed, null, 2).slice(0, 3000)}${raw.length > 3000 ? "\n\u2026(обрізано)" : ""}`;
        } catch {
          return `${label}: ${raw.slice(0, 3000)}`;
        }
      };
      switch (mod) {
        case "finyk": {
          const parts: string[] = ["Експорт Фінік:"];
          parts.push(exportData("finyk_tx_cache", "Транзакції"));
          return parts.join("\n");
        }
        case "fizruk": {
          const parts: string[] = ["Експорт Фізрук:"];
          parts.push(exportData("fizruk_workouts_v1", "Тренування"));
          parts.push(exportData("fizruk_daily_log_v1", "Щоденний журнал"));
          return parts.join("\n");
        }
        case "routine": {
          const parts: string[] = ["Експорт Рутина:"];
          parts.push(exportData("hub_routine_v1", "Звички та виконання"));
          return parts.join("\n");
        }
        case "nutrition": {
          const parts: string[] = ["Експорт Харчування:"];
          parts.push(exportData("nutrition_log_v1", "Журнал їжі"));
          parts.push(exportData("nutrition_prefs_v1", "Налаштування"));
          return parts.join("\n");
        }
        default:
          return `Невідомий модуль: ${mod}. Доступні: finyk, fizruk, routine, nutrition.`;
      }
    }
    case "compare_weeks": {
      const { week_a, week_b, modules } = (action as CompareWeeksAction).input;
      const allModules: CompareWeeksModule[] = [
        "finyk",
        "fizruk",
        "routine",
        "nutrition",
      ];
      const selected: CompareWeeksModule[] =
        Array.isArray(modules) && modules.length > 0
          ? (modules.filter((m) =>
              allModules.includes(m as CompareWeeksModule),
            ) as CompareWeeksModule[])
          : allModules;
      if (selected.length === 0) {
        return "Не вказано жодного валідного модуля. Доступні: finyk, fizruk, routine, nutrition.";
      }

      const aKey = week_a
        ? weekLabelToMondayKey(week_a)
        : getWeekKey(new Date());
      if (!aKey) {
        return `Некоректний week_a: "${week_a}". Очікую YYYY-Www (наприклад 2026-W17).`;
      }
      const bKey = week_b
        ? weekLabelToMondayKey(week_b)
        : previousWeekKey(aKey);
      if (!bKey) {
        return `Некоректний week_b: "${week_b}". Очікую YYYY-Www (наприклад 2026-W16).`;
      }

      const aLabel = formatWeekRangeLabel(aKey);
      const bLabel = formatWeekRangeLabel(bKey);
      const lines: string[] = [`Порівняння тижнів: ${aLabel} vs ${bLabel}`];

      if (selected.includes("finyk")) {
        const fa = aggregateFinyk(aKey);
        const fb = aggregateFinyk(bKey);
        const aSpent = Math.round(fa.totalSpent);
        const bSpent = Math.round(fb.totalSpent);
        lines.push("");
        lines.push("Фінік:");
        lines.push(`  ${diffLine("Витрати", aSpent, bSpent, " грн")}`);
        lines.push(`  ${diffLine("Транзакцій", fa.txCount, fb.txCount, "")}`);
        const topA = fa.topCategories[0];
        const topB = fb.topCategories[0];
        if (topA || topB) {
          lines.push(
            `  Топ категорія: ${topA ? `${topA.name} (${Math.round(topA.amount)} грн)` : "—"} vs ${topB ? `${topB.name} (${Math.round(topB.amount)} грн)` : "—"}`,
          );
        }
      }

      if (selected.includes("fizruk")) {
        const za = aggregateFizruk(aKey);
        const zb = aggregateFizruk(bKey);
        lines.push("");
        lines.push("Фізрук:");
        if (!za && !zb) {
          lines.push("  Немає тренувань у обидва тижні.");
        } else {
          const aCount = za?.workoutsCount ?? 0;
          const bCount = zb?.workoutsCount ?? 0;
          const aVol = za?.totalVolume ?? 0;
          const bVol = zb?.totalVolume ?? 0;
          lines.push(`  ${diffLine("Тренувань", aCount, bCount, "")}`);
          lines.push(`  ${diffLine("Об'єм", aVol, bVol, " кг·повт")}`);
        }
      }

      if (selected.includes("routine")) {
        const ra = aggregateRoutine(aKey);
        const rb = aggregateRoutine(bKey);
        lines.push("");
        lines.push("Рутина:");
        if (!ra && !rb) {
          lines.push("  Немає активних звичок.");
        } else {
          const aRate = ra?.overallRate ?? 0;
          const bRate = rb?.overallRate ?? 0;
          lines.push(`  ${diffLine("Виконання", aRate, bRate, "%")}`);
          if (ra && rb) {
            lines.push(`  Звичок: ${ra.habitCount} vs ${rb.habitCount}`);
          }
        }
      }

      if (selected.includes("nutrition")) {
        const na = aggregateNutrition(aKey);
        const nb = aggregateNutrition(bKey);
        lines.push("");
        lines.push("Харчування:");
        if (!na && !nb) {
          lines.push("  Немає логів їжі у обидва тижні.");
        } else {
          const aKcal = na?.avgKcal ?? 0;
          const bKcal = nb?.avgKcal ?? 0;
          const aDays = na?.daysLogged ?? 0;
          const bDays = nb?.daysLogged ?? 0;
          lines.push(`  ${diffLine("Калорії/день", aKcal, bKcal, " ккал")}`);
          lines.push(`  Днів залоговано: ${aDays} vs ${bDays}`);
        }
      }

      return lines.join("\n");
    }
    default:
      return undefined;
  }
}
