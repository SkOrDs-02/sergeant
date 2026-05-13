import {
  mergeExpenseCategoryDefinitions,
  INTERNAL_TRANSFER_ID,
} from "../../../modules/finyk/constants";
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
} from "../../../modules/finyk/utils";
import { fmt } from "../hubChatUtils";
import type { AllData, BudgetGoal, BudgetLimit, CategoryDef } from "./types";

function appendOverviewLines(lines: string[], d: AllData, now: Date): void {
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
}

function appendBalanceLines(lines: string[], d: AllData): void {
  if (d.accounts.length === 0) return;
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

function appendMonthlyTotals(lines: string[], d: AllData, now: Date): void {
  if (d.statTx.length === 0) return;
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
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
  if (recent.length === 0) return;
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

function appendBudgetLines(lines: string[], d: AllData): void {
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
  appendBudgetLines(lines, d);
  appendPlanAndSubscriptionLines(lines, d);
  appendCategoryCatalogLine(lines, d);
}
