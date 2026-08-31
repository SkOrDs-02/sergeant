import {
  mergeExpenseCategoryDefinitions,
  INTERNAL_TRANSFER_ID,
} from "../../../modules/finyk/constants";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain";
import { calcLimitCategorySpent } from "@sergeant/finyk-domain/lib/limitCategorySpend";
import {
  getExpenseCategoryForTransaction,
  getIncomeCategoryForTransaction,
  getMonoTotals,
  calcDebtRemaining,
  calcReceivableRemaining,
  getDebtEffectiveTotal,
  getReceivableEffectiveTotal,
  resolveExpenseCategoryMeta,
  type MonoAccount,
} from "../../../modules/finyk/utils";
import { fmt } from "../hubChatUtils";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import type { AllData, BudgetGoal, BudgetLimit, CategoryDef } from "./types";

function appendOverviewLines(lines: string[], d: AllData, now: Date): void {
  const { year, month, day } = getKyivDateParts(now);
  const dayOfMonth = day;
  // days-in-month: calendar arithmetic on the Kyiv-resolved year/month;
  // .getDate() here yields the month length, not a host-local day boundary.
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- Kyiv year/month length; not a host day key
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  lines.push(
    `[Сьогодні] ${now.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Kyiv" })}`,
  );
  // AI-CONTEXT (2026-08-07): годинник тут не косметика. До цього контекст
  // ніс лише дату, тож на «почни тренування на сьогодні» о 02:48 модель
  // підставляла у `start_workout.time` правдоподібну ранкову годину —
  // 09:00, — бо знала день і не знала часу. Схема `time` опційна, але
  // порожнє поле треба ще й лишити порожнім свідомо. Кеш контексту живе
  // 15 с (`CONTEXT_TTL_MS`), тож до HH:MM він протухнути не встигає.
  const { hour, minute } = getKyivDateParts(now);
  lines.push(
    `[Зараз] ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} за Києвом`,
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
}

function appendBalanceLines(lines: string[], d: AllData): void {
  if (d.accounts.length === 0) return;
  const monoAccounts: MonoAccount[] = d.accounts.map((a) => ({
    id: a.id,
    balance: a.balance,
    creditLimit: a.creditLimit,
  }));
  const { balance, debt: monoDebt } = getMonoTotals(
    monoAccounts,
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

/** `time` у транзакціях Фініка — секунди (легасі) або мілісекунди. */
function txTimeMs(time: number | undefined): number {
  const raw = time ?? 0;
  if (!Number.isFinite(raw)) return Number.NaN;
  return raw > 1e10 ? raw : raw * 1000;
}

function appendMonthlyTotals(lines: string[], d: AllData, now: Date): void {
  if (d.statTx.length === 0) return;
  const { year, month, day } = getKyivDateParts(now);
  const dayOfMonth = day;
  // days-in-month: calendar arithmetic on the Kyiv-resolved year/month (see above).
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- Kyiv year/month length; not a host day key
  const daysInMonth = new Date(year, month, 0).getDate();

  // AI-CONTEXT (W1-CANON-AGG, стадія 2c): до цього патча жоден із рядків
  // нижче не був обмежений місяцем — `spent` / `income` / `[Категорії
  // витрат]` сумувалися по ВСЬОМУ mono-mirror-кешу, а підписувалися як
  // «місяця». Глибший кеш давав завищене число і завищений прогноз, і
  // помилка мовчки залежала від того, скільки історії встиг накопичити
  // клієнт. Тепер вікно явне, а самі суми рахує канонічна
  // `calcFinykPeriodAggregate` — та сама, що обслуговує дайджест і
  // Hub-Reports (реєстр: docs/02-engineering/architecture/metric-registry.md).
  //
  // Межі місяця — host-local, як у дайджеста і Hub-Reports. Київська межа
  // доби лишається окремим боргом на всіх поверхнях одразу (стадія 5г):
  // зробити її тут поодинці означало б розсинхронити чат із рештою.
  const monthStart = new Date(year, month - 1, 1).getTime();
  const monthEnd = new Date(year, month, 1).getTime();
  const monthTx = d.statTx.filter((t) => {
    const ms = txTimeMs(t.time);
    return Number.isFinite(ms) && ms >= monthStart && ms < monthEnd;
  });

  const aggregate = calcFinykPeriodAggregate(monthTx, {
    start: monthStart,
    end: monthEnd,
    txSplits: d.txSplits,
  });
  const spent = aggregate.totalSpent;
  const income = aggregate.totalIncome;
  const avgPerDay = dayOfMonth > 0 ? spent / dayOfMonth : 0;
  const projected = avgPerDay * daysInMonth;

  lines.push(`[Витрати місяця] ${fmt(spent)} грн`);
  lines.push(`[Дохід місяця] ${fmt(income)} грн`);
  lines.push(`[Баланс місяця] ${fmt(income - spent)} грн`);
  lines.push(`[Середня витрата/день] ${fmt(avgPerDay)} грн`);
  lines.push(`[Прогноз витрат до кінця місяця] ${fmt(projected)} грн`);

  const cats = (
    mergeExpenseCategoryDefinitions(d.customCategories) as CategoryDef[]
  )
    .filter((c) => c.id !== "income" && c.id !== INTERNAL_TRANSFER_ID)
    .map((c) => ({
      id: c.id,
      label: c.label,
      // Той самий місячний зріз, що й `spent` вище: інакше «Витрати місяця»
      // і сума рядка «Категорії витрат» розійшлися б у межах одного
      // промпт-блоку, і модель отримала б суперечливі числа.
      spent: calcLimitCategorySpent(
        monthTx,
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
  if (recent.length === 0) return;
  lines.push("[Останні операції]");
  recent.forEach((t) => {
    // `statTx` містить і ручні операції (`buildFinykSpendingUniverse`).
    // У них `mcc: 0`, опис часто порожній, а `txCategories` ключується
    // банківськими id — тож стара `getCategory` віддавала «💳 Інше» на
    // КОЖЕН ручний запис, і саме це їхало в промпт моделі. Резолвер
    // нижче спершу читає `categoryId` самої операції.
    // `recent` — увесь `statTx`, разом із надходженнями, тож розгалуження
    // за знаком обовʼязкове: expense-резолвер віддав би ручній зарплаті
    // «💳 Інше» замість «Зарплата». Той самий поділ, що в TxRow.
    const cat =
      t.amount > 0
        ? getIncomeCategoryForTransaction(t, d.txCategories[t.id])
        : getExpenseCategoryForTransaction(
            t,
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

function appendDebtLines(lines: string[], d: AllData): void {
  const active = d.manualDebts.filter((x) => Number(x.totalAmount) > 0);
  if (active.length === 0) return;
  lines.push(
    `[Деталі боргів] ${active
      .map((x) => {
        const rem = calcDebtRemaining(x, d.transactions);
        const eff = getDebtEffectiveTotal(x, d.transactions);
        return `${x.name}: залишок ${fmt(rem)} грн (сума з виникненнями ${fmt(eff)} грн, id:${x.id})`;
      })
      .join(", ")}`,
  );
}

function appendReceivableLines(lines: string[], d: AllData): void {
  const recv = d.receivables.filter((r) => Number(r.amount) > 0);
  if (recv.length === 0) return;
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

function appendBudgetLines(lines: string[], d: AllData, now: Date): void {
  const limits = d.budgets.filter((b): b is BudgetLimit => b.type === "limit");
  if (limits.length > 0) {
    // AI-CONTEXT (W1-CANON-AGG, стадія 2c — хвіст): `[Ліміти]` лишався
    // єдиним рядком цього файла, що сумував ВЕСЬ mono-mirror проти
    // МІСЯЧНОГО ліміту. Сусідній `appendMonthlyTotals` вікноавали ще тоді,
    // а цей — ні, тож в одному промпт-блоці «Витрати місяця» і «Ліміти»
    // рахувались по різних всесвітах: чат бадьоро повідомляв «Продукти:
    // 45 000/8 000 грн» і вигадував перевитрати в сотні відсотків. Помилка
    // росла мовчки разом із глибиною кешу — а відколи `fetchMonth`
    // backfill-ить дзеркало історією, вона росла б ще швидше.
    //
    // Межі місяця — host-local, як у `appendMonthlyTotals` вище: київська
    // межа доби лишається спільним боргом усіх поверхонь (стадія 5г), і
    // робити її тут поодинці означало б розсинхронити чат із рештою.
    const { year, month } = getKyivDateParts(now);
    const monthStart = new Date(year, month - 1, 1).getTime();
    const monthEnd = new Date(year, month, 1).getTime();
    const monthTx = d.statTx.filter((t) => {
      const ms = txTimeMs(t.time);
      return Number.isFinite(ms) && ms >= monthStart && ms < monthEnd;
    });

    lines.push(
      `[Ліміти] ${limits
        .map((b) => {
          const cat = resolveExpenseCategoryMeta(
            b.categoryId,
            d.customCategories,
          );
          const spent = calcLimitCategorySpent(
            monthTx,
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
      `[Цілі] ${goals.map((b) => `${b.name}: ${fmt(goalSavedAmount(b))}/${fmt(b.targetAmount)} грн`).join(", ")}`,
    );
  }
}

// ponytail: AllData не несе баланс привʼязаної банки (goal-progress-auto-
// sync), тож чат-контекст бачить лише ручну частину прогресу
// (contributions). Апгрейд — протягнути jar-баланс сюди, коли знадобиться.
function goalSavedAmount(goal: BudgetGoal): number {
  if (Array.isArray(goal.contributions) && goal.contributions.length > 0) {
    return goal.contributions.reduce(
      (s, c) => s + (Number(c?.amountUah) || 0),
      0,
    );
  }
  return goal.savedAmount || 0;
}

function appendPlanAndSubscriptionLines(lines: string[], d: AllData): void {
  if (d.monthlyPlan?.income || d.monthlyPlan?.expense) {
    lines.push(
      `[Фінплан] дохід ${fmt(Number(d.monthlyPlan.income) || 0)} грн/міс, витрати ${fmt(Number(d.monthlyPlan.expense) || 0)} грн/міс`,
    );
  }

  if (d.subscriptions?.length > 0) {
    lines.push(`[Підписки] ${d.subscriptions.map((s) => s.name).join(", ")}`);
  }
}

function appendCategoryCatalogLine(lines: string[], d: AllData): void {
  lines.push(
    `[Категорії] ${(
      mergeExpenseCategoryDefinitions(d.customCategories) as CategoryDef[]
    )
      .map((c) => `${c.id}="${c.label}"`)
      .join(", ")}`,
  );
}

export function appendFinanceLines(
  lines: string[],
  d: AllData,
  now: Date,
): void {
  appendOverviewLines(lines, d, now);
  appendBalanceLines(lines, d);
  appendMonthlyTotals(lines, d, now);
  appendDebtLines(lines, d);
  appendReceivableLines(lines, d);
  appendBudgetLines(lines, d, now);
  appendPlanAndSubscriptionLines(lines, d);
  appendCategoryCatalogLine(lines, d);
}
