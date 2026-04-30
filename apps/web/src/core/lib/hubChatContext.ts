import {
  parseWorkoutsFromStorage,
  WORKOUTS_STORAGE_KEY,
} from "@sergeant/fizruk-domain";
import {
  mergeExpenseCategoryDefinitions,
  INTERNAL_TRANSFER_ID,
} from "../../modules/finyk/constants";
import {
  getCategory,
  getMonoTotals,
  getTxStatAmount,
  calcCategorySpent,
  calcDebtRemaining,
  calcReceivableRemaining,
  getDebtEffectiveTotal,
  getReceivableEffectiveTotal,
  resolveExpenseCategoryMeta,
} from "../../modules/finyk/utils";
import {
  ACTIVE_WORKOUT_KEY,
  completedWorkoutsCount,
  countCompletedInCurrentWeek,
  totalCompletedVolumeKg,
  weeklyVolumeSeriesNow,
} from "@sergeant/fizruk-domain";
import { perfMark, perfEnd } from "@shared/lib/perf";
import { safeReadStringLS } from "@shared/lib/storage";
import { ls, fmt } from "./hubChatUtils";
import { generateRecommendations } from "./recommendationEngine";
import { generateInsights } from "./insightsEngine";
import { CATEGORY_META, readMemoryEntries } from "../profile/memoryBank";

interface Transaction {
  id: string;
  amount: number;
  description?: string;
  mcc?: number;
  time?: number;
}

interface Account {
  id?: string;
  balance?: number;
  creditLimit?: number;
}

interface InfoCache {
  accounts?: Account[];
  name?: string;
}

interface TxCache {
  txs?: Transaction[];
  timestamp?: number;
}

interface Debt {
  id: string;
  name: string;
  amount: number;
  totalAmount: number;
  dueDate?: string;
  emoji?: string;
  linkedTxIds?: string[];
}

interface Receivable {
  id: string;
  name: string;
  amount: number;
  linkedTxIds?: string[];
}

interface BudgetLimit {
  id: string;
  type: "limit";
  categoryId: string;
  limit: number;
}

interface BudgetGoal {
  id: string;
  type: "goal";
  name: string;
  targetAmount: number;
  savedAmount?: number;
}

type Budget = BudgetLimit | BudgetGoal;

interface MonthlyPlan {
  income?: string | number;
  expense?: string | number;
  savings?: string | number;
}

interface Subscription {
  id: string;
  name: string;
}

interface AllData {
  transactions: Transaction[];
  accounts: Account[];
  clientName: string;
  cacheTime: number | null;
  hiddenAccounts: string[];
  budgets: Budget[];
  manualDebts: Debt[];
  receivables: Receivable[];
  txCategories: Record<string, string>;
  txSplits: Record<string, unknown>;
  customCategories: unknown[];
  monthlyPlan: MonthlyPlan;
  subscriptions: Subscription[];
  monoDebtLinked: Record<string, unknown>;
  statTx: Transaction[];
  excludedIds: Set<string>;
}

interface HabitState {
  habits?: Array<{
    id: string;
    name?: string;
    emoji?: string;
    archived?: boolean;
  }>;
  completions?: Record<string, string[]>;
}

interface NutritionMeal {
  name?: string;
  macros?: {
    kcal?: number;
    protein_g?: number;
    fat_g?: number;
    carbs_g?: number;
  };
}

interface NutritionDay {
  meals?: NutritionMeal[];
}

interface NutritionPrefs {
  dailyTargetKcal?: number;
  dailyTargetProtein_g?: number;
  dailyTargetProtein?: number;
}

function readAllData(): AllData {
  const txCache = ls<TxCache | null>("finyk_tx_cache", null);
  const rawInfo = ls<{ info?: InfoCache } | InfoCache | null>(
    "finyk_info_cache",
    null,
  );
  const infoCache: InfoCache | null =
    (rawInfo && "info" in rawInfo ? rawInfo.info : (rawInfo as InfoCache)) ||
    null;

  const transactions = txCache?.txs || [];
  const accounts = infoCache?.accounts || [];
  const clientName = infoCache?.name || "";
  const cacheTime = txCache?.timestamp || null;

  const hiddenAccounts = ls<string[]>("finyk_hidden", []);
  const budgets = ls<Budget[]>("finyk_budgets", []);
  const manualDebts = ls<Debt[]>("finyk_debts", []);
  const receivables = ls<Receivable[]>("finyk_recv", []);
  const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
  const txCategories = ls<Record<string, string>>("finyk_tx_cats", {});
  const txSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  const customCategories = ls<unknown[]>("finyk_custom_cats_v1", []);
  const monthlyPlan = ls<MonthlyPlan>("finyk_monthly_plan", {});
  const subscriptions = ls<Subscription[]>("finyk_subs", []);
  const monoDebtLinked = ls<Record<string, unknown>>(
    "finyk_mono_debt_linked",
    {},
  );

  const transferTxIds = Object.entries(txCategories)
    .filter(([, catId]) => catId === INTERNAL_TRANSFER_ID)
    .map(([txId]) => txId);

  const excludedIds = new Set<string>([
    ...hiddenTxIds,
    ...transferTxIds,
    ...receivables.flatMap((r) => r.linkedTxIds || []),
  ]);

  const statTx = transactions.filter((t) => !excludedIds.has(t.id));

  return {
    transactions,
    accounts,
    clientName,
    cacheTime,
    hiddenAccounts,
    budgets,
    manualDebts,
    receivables,
    txCategories,
    txSplits,
    customCategories,
    monthlyPlan,
    subscriptions,
    monoDebtLinked,
    statTx,
    excludedIds,
  };
}

function buildContext(): string {
  const d = readAllData();
  const lines: string[] = [];

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  lines.push(
    `[Сьогодні] ${now.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
  );
  lines.push(
    `[День місяця] ${dayOfMonth} з ${daysInMonth} (залишилось ${daysLeft} днів)`,
  );

  if (d.cacheTime) {
    const ts = new Intl.DateTimeFormat("uk-UA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d.cacheTime));
    lines.push(`[Оновлено] ${ts}`);
  }
  if (d.clientName) lines.push(`[Користувач] ${d.clientName}`);

  if (d.accounts.length > 0) {
    const { balance, debt: monoDebt } = getMonoTotals(
      d.accounts as Parameters<typeof getMonoTotals>[0],
      d.hiddenAccounts,
    );
    const manualDebtTotal = d.manualDebts.reduce(
      (s, debt) => s + calcDebtRemaining(debt, d.transactions),
      0,
    );
    lines.push(`[Баланс карток] ${fmt(balance)} грн`);
    lines.push(`[Борг кредитки] ${fmt(monoDebt)} грн`);
    if (manualDebtTotal > 0)
      lines.push(`[Борг ручний] ${fmt(manualDebtTotal)} грн`);
    lines.push(`[Борг загальний] ${fmt(monoDebt + manualDebtTotal)} грн`);
  }

  if (d.statTx.length > 0) {
    const spent = d.statTx
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + getTxStatAmount(t, d.txSplits), 0);
    const income = d.statTx
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount / 100, 0);
    const avgPerDay = dayOfMonth > 0 ? spent / dayOfMonth : 0;
    const projected = avgPerDay * daysInMonth;

    lines.push(`[Витрати місяця] ${fmt(spent)} грн`);
    lines.push(`[Дохід місяця] ${fmt(income)} грн`);
    lines.push(`[Баланс місяця] ${fmt(income - spent)} грн`);
    lines.push(`[Середня витрата/день] ${fmt(avgPerDay)} грн`);
    lines.push(`[Прогноз витрат до кінця місяця] ${fmt(projected)} грн`);

    interface CategoryDef {
      id: string;
      label: string;
    }
    const cats = (
      mergeExpenseCategoryDefinitions(d.customCategories) as CategoryDef[]
    )
      .filter((c) => c.id !== "income" && c.id !== INTERNAL_TRANSFER_ID)
      .map((c) => ({
        id: c.id,
        label: c.label,
        spent: calcCategorySpent(
          d.statTx,
          c.id,
          d.txCategories,
          d.txSplits,
          d.customCategories,
        ),
      }))
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent);
    if (cats.length > 0) {
      lines.push(
        `[Категорії витрат] ${cats.map((c) => `${c.label}: ${fmt(c.spent)} грн`).join(", ")}`,
      );
    }

    const recent = [...d.statTx]
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, 10);
    if (recent.length > 0) {
      lines.push("[Останні операції]");
      recent.forEach((t) => {
        const cat = getCategory(
          t.description,
          t.mcc,
          d.txCategories[t.id],
          d.customCategories,
        );
        const date = t.time
          ? new Date(t.time * 1000).toLocaleDateString("uk-UA", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        lines.push(
          `  id:${t.id} | ${date} | ${t.description || "—"} | ${fmt(t.amount / 100)} грн | ${cat.label}`,
        );
      });
    }
  }

  if (d.manualDebts.filter((x) => Number(x.totalAmount) > 0).length > 0) {
    lines.push(
      `[Деталі боргів] ${d.manualDebts
        .filter((x) => Number(x.totalAmount) > 0)
        .map((x) => {
          const rem = calcDebtRemaining(x, d.transactions);
          const eff = getDebtEffectiveTotal(x, d.transactions);
          return `${x.name}: залишок ${fmt(rem)} грн (сума з виникненнями ${fmt(eff)} грн, id:${x.id})`;
        })
        .join(", ")}`,
    );
  }

  const recv = d.receivables.filter((r) => Number(r.amount) > 0);
  if (recv.length > 0) {
    lines.push(
      `[Мені винні] ${recv
        .map((r) => {
          const rem = calcReceivableRemaining(r, d.transactions);
          const eff = getReceivableEffectiveTotal(r, d.transactions);
          return `${r.name}: залишок ${fmt(rem)} грн (ефективна сума ${fmt(eff)} грн, id:${r.id})`;
        })
        .join(", ")}`,
    );
  }

  const limits = d.budgets.filter((b): b is BudgetLimit => b.type === "limit");
  if (limits.length > 0) {
    lines.push(
      `[Ліміти] ${limits
        .map((b) => {
          const cat = resolveExpenseCategoryMeta(
            b.categoryId,
            d.customCategories,
          );
          const spent = calcCategorySpent(
            d.statTx,
            b.categoryId,
            d.txCategories,
            d.txSplits,
            d.customCategories,
          );
          return `${cat?.label || b.categoryId}: ${fmt(spent)}/${fmt(b.limit)} грн`;
        })
        .join(", ")}`,
    );
  }

  const goals = d.budgets.filter((b): b is BudgetGoal => b.type === "goal");
  if (goals.length > 0) {
    lines.push(
      `[Цілі] ${goals.map((b) => `${b.name}: ${fmt(b.savedAmount || 0)}/${fmt(b.targetAmount)} грн`).join(", ")}`,
    );
  }

  if (d.monthlyPlan?.income || d.monthlyPlan?.expense) {
    lines.push(
      `[Фінплан] дохід ${fmt(Number(d.monthlyPlan.income) || 0)} грн/міс, витрати ${fmt(Number(d.monthlyPlan.expense) || 0)} грн/міс`,
    );
  }

  if (d.subscriptions?.length > 0) {
    lines.push(`[Підписки] ${d.subscriptions.map((s) => s.name).join(", ")}`);
  }

  interface CategoryDef {
    id: string;
    label: string;
  }
  lines.push(
    `[Категорії] ${(
      mergeExpenseCategoryDefinitions(d.customCategories) as CategoryDef[]
    )
      .map((c) => `${c.id}="${c.label}"`)
      .join(", ")}`,
  );

  // ── Фізрук (тренування) ─────────────────────────────────────────
  try {
    const raw = safeReadStringLS(WORKOUTS_STORAGE_KEY);
    const w = parseWorkoutsFromStorage(raw) as Array<{
      id?: string;
      startedAt?: string;
      endedAt?: string;
      items?: Array<{ nameUk?: string; name?: string; exercise?: string }>;
    }>;
    if (Array.isArray(w) && w.length > 0) {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const withTs = w.map((x) => ({
        ...x,
        _ts: x.startedAt ? new Date(x.startedAt).getTime() : 0,
      }));
      const cnt = withTs.filter((x) => x._ts > weekAgo).length;
      const sorted = [...withTs].sort((a, b) => b._ts - a._ts);
      const last = sorted[0];
      const dt = last?.startedAt
        ? new Date(last.startedAt).toLocaleDateString("uk-UA", {
            day: "numeric",
            month: "short",
          })
        : "—";
      lines.push(
        `[Тренування] завершених всього: ${completedWorkoutsCount(w)}, цього тижня завершено: ${countCompletedInCurrentWeek(w)}, за останні 7 днів сесій: ${cnt}, остання дата: ${dt}`,
      );
      const { volumeKg } = weeklyVolumeSeriesNow(w);
      const weekVol = volumeKg.reduce((a, b) => a + b, 0);
      lines.push(`[Фізрук тиждень] обʼєм кг×повт (Пн–Нд): ${fmt(weekVol)}`);
      lines.push(
        `[Фізрук загалом] сумарний обʼєм завершених: ${fmt(totalCompletedVolumeKg(w))} кг×повт`,
      );
      let activeHint = "немає";
      try {
        const aid = safeReadStringLS(ACTIVE_WORKOUT_KEY);
        if (aid) {
          const aw = w.find((x) => x.id === aid && !x.endedAt);
          if (aw)
            activeHint = `${(aw.items || []).length} вправ у поточній сесії (id тренування ${aid})`;
        }
      } catch {}
      lines.push(`[Фізрук активне тренування] ${activeHint}`);
      const firstItems = sorted[0]?.items;
      if (firstItems && firstItems.length > 0) {
        const exercises = firstItems
          .map(
            (i: { nameUk?: string; name?: string; exercise?: string }) =>
              i.nameUk || i.name || i.exercise || "—",
          )
          .join(", ");
        lines.push(`[Останнє тренування вправи] ${exercises}`);
      }
    }
  } catch {}

  // ── Рутина (звички) ──────────────────────────────────────────
  try {
    const routineState = ls<HabitState | null>("hub_routine_v1", null);
    if (routineState) {
      const habits = (routineState.habits || []).filter((h) => !h.archived);
      const completions = routineState.completions || {};
      const todayKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      if (habits.length > 0) {
        const todayDone = habits.filter(
          (h) =>
            Array.isArray(completions[h.id]) &&
            completions[h.id].includes(todayKey),
        );
        lines.push(
          `[Рутина] ${habits.length} активних звичок, виконано сьогодні: ${todayDone.length} з ${habits.length}`,
        );

        const habitDetails = habits
          .map((h) => {
            const done =
              Array.isArray(completions[h.id]) &&
              completions[h.id].includes(todayKey);
            return `${h.emoji || ""} ${h.name} (id:${h.id}): ${done ? "✓" : "✗"}`;
          })
          .join(", ");
        lines.push(`[Рутина сьогодні] ${habitDetails}`);

        const dow = (now.getDay() + 6) % 7;
        let weekDone = 0;
        let weekTotal = 0;
        for (let i = 0; i <= dow; i++) {
          const d2 = new Date(now);
          d2.setDate(now.getDate() - dow + i);
          const dk = [
            d2.getFullYear(),
            String(d2.getMonth() + 1).padStart(2, "0"),
            String(d2.getDate()).padStart(2, "0"),
          ].join("-");
          weekTotal += habits.length;
          for (const h of habits) {
            if (
              Array.isArray(completions[h.id]) &&
              completions[h.id].includes(dk)
            )
              weekDone++;
          }
        }
        const weekPct =
          weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
        lines.push(
          `[Рутина тиждень] ${weekPct}% виконання (${weekDone} з ${weekTotal})`,
        );

        let streak = 0;
        const sd = new Date(now);
        sd.setDate(sd.getDate() - 1);
        for (let i = 0; i < 365; i++) {
          const dk = [
            sd.getFullYear(),
            String(sd.getMonth() + 1).padStart(2, "0"),
            String(sd.getDate()).padStart(2, "0"),
          ].join("-");
          if (
            habits.every(
              (h) =>
                Array.isArray(completions[h.id]) &&
                completions[h.id].includes(dk),
            )
          ) {
            streak++;
          } else {
            break;
          }
          sd.setDate(sd.getDate() - 1);
        }
        if (streak > 0)
          lines.push(`[Рутина серія] ${streak} днів поспіль (всі звички)`);
      }
    }
  } catch {}

  // ── Харчування ────────────────────────────────────────────────
  try {
    const nutritionLog = ls<Record<string, NutritionDay>>(
      "nutrition_log_v1",
      {},
    );
    const nutritionPrefs = ls<NutritionPrefs | null>(
      "nutrition_prefs_v1",
      null,
    );
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const todayData = nutritionLog[todayKey];

    if (todayData) {
      const meals = Array.isArray(todayData.meals) ? todayData.meals : [];
      const kcal = meals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
      const protein = meals.reduce(
        (s, m) => s + (m?.macros?.protein_g ?? 0),
        0,
      );
      const fat = meals.reduce((s, m) => s + (m?.macros?.fat_g ?? 0), 0);
      const carbs = meals.reduce((s, m) => s + (m?.macros?.carbs_g ?? 0), 0);
      lines.push(
        `[Харчування сьогодні] ${Math.round(kcal)} ккал | білок: ${Math.round(protein)}г | жири: ${Math.round(fat)}г | вуглеводи: ${Math.round(carbs)}г | прийомів: ${meals.length}`,
      );
      if (meals.length > 0) {
        const mealList = meals
          .slice(0, 6)
          .map(
            (m) =>
              `${m.name || "?"} (${Math.round(m?.macros?.kcal ?? 0)} ккал)`,
          )
          .join(", ");
        lines.push(`[Харчування прийоми] ${mealList}`);
      }
    }

    if (nutritionPrefs) {
      const tKcal = nutritionPrefs.dailyTargetKcal;
      const tProt =
        nutritionPrefs.dailyTargetProtein_g ||
        nutritionPrefs.dailyTargetProtein;
      if (tKcal || tProt) {
        lines.push(
          `[Харчування ціль] ${tKcal ? `${tKcal} ккал/день` : ""}${tKcal && tProt ? ", " : ""}${tProt ? `білок: ${tProt}г/день` : ""}`,
        );
      }
    }

    const weekKcalArr: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d3 = new Date(now);
      d3.setDate(now.getDate() - i);
      const dk = [
        d3.getFullYear(),
        String(d3.getMonth() + 1).padStart(2, "0"),
        String(d3.getDate()).padStart(2, "0"),
      ].join("-");
      const dayMeals: NutritionMeal[] = Array.isArray(nutritionLog[dk]?.meals)
        ? (nutritionLog[dk].meals as NutritionMeal[])
        : [];
      const k = dayMeals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
      if (k > 0) weekKcalArr.push(k);
    }
    if (weekKcalArr.length > 0) {
      const avg = Math.round(
        weekKcalArr.reduce((a, b) => a + b, 0) / weekKcalArr.length,
      );
      lines.push(
        `[Харчування тиждень] середньо ${avg} ккал/день (за ${weekKcalArr.length} днів)`,
      );
    }
  } catch {}

  // ── Активні рекомендації від двигуна ──────────────────────────
  try {
    const recs = generateRecommendations().slice(0, 5);
    if (recs.length > 0) {
      lines.push("[Активні рекомендації]");
      recs.forEach((r) => {
        lines.push(`  ${r.icon} ${r.title} — ${r.body} (модуль: ${r.module})`);
      });
    }
  } catch {}

  // ── Кросмодульні інсайти ──────────────────────────────────────
  try {
    const insights = generateInsights();
    if (insights.length > 0) {
      lines.push("[Аналітичні інсайти]");
      insights.forEach((i) => {
        lines.push(`  ${i.emoji} ${i.title} (${i.stat}) — ${i.detail}`);
      });
    }
  } catch {}

  // ── Профіль користувача (пам'ять) ───────────────────────────
  try {
    const profile = readMemoryEntries();
    if (profile.length > 0) {
      lines.push("[Профіль користувача]");
      const grouped: Record<string, string[]> = {};
      for (const entry of profile) {
        const cat = entry.category || "other";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(entry.fact);
      }
      for (const [cat, facts] of Object.entries(grouped)) {
        lines.push(
          `  ${CATEGORY_META[cat]?.label || cat}: ${facts.join("; ")}`,
        );
      }
    }
  } catch {}

  return lines.length > 1
    ? lines.join("\n")
    : "Даних немає. Monobank не підключено.";
}

export function buildContextMeasured(): string {
  const m = perfMark("hubchat:buildContext");
  const ctx = buildContext();
  perfEnd(m, { len: ctx?.length || 0 });
  return ctx;
}
