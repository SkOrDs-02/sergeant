/**
 * Один список для купи «Зараз» — злиття двох ранкерів хабу.
 *
 * Спека: `docs/work/specs/hub-action-axis.md` § «Купа „Зараз“» (рішення
 * власника 2026-09-17 поверх § P3 анти-слоп-стратегії).
 *
 * До цього файлу на головній працювало ДВА незалежні ранкери: числовий
 * `priority` 45–95 у `recommendationEngine` (hero «Зараз», top-1) і
 * префіксний `PRIORITY_RANK` 1–9 у `useAllInsights` (акордеон, top-3). Та
 * сама річ приходила з обох під різними id — `nutrition_protein_low` і
 * `nutrition-protein-low` — і показувалась двічі.
 *
 * Тут одна шкала (шкала `Rec`: більше — важливіше), явна мапа близнюків і
 * один тип. Файл чистий: жодних хуків, сховища чи часу — усе це в
 * `useNowItems.ts`. Саме тому дедуп і пріоритети тестуються таблично.
 *
 * Status: Scaffolded
 * @nextStep PR 2 осі дії (`hub-action-axis.md` § Нарізка) монтує
 *           `useNowItems` у `HubDashboard` замість `useDashboardFocus` +
 *           `useAllInsights`; до того UI цей модуль не читає — навмисно, щоб
 *           PR 1 не мав видимих змін.
 */
import { Recommendations } from "@sergeant/insights";
import type { Rec } from "../../lib/recommendationEngine";
import type { StatusColor } from "@sergeant/design-tokens";
import type { Insight } from "@shared/lib/insights/types";

/** Куди веде основна дія рядка. Форми успадковані від `Rec` та `Insight`. */
export type NowAction =
  /** `Rec.pwaAction` — імперативна дія в модулі одним тапом. */
  | {
      kind: "module_action";
      module: string;
      action: NonNullable<Rec["pwaAction"]>;
    }
  /** `Rec.action` (+ `actionHash`) — відкрити модуль чи «reports». */
  | { kind: "open_module"; module: string; hash?: string }
  /** `Rec.action === WEEK_REPORT_ACTION` — «Звіт тижня» на хабі, не модуль. */
  | { kind: "open_week_report" }
  /** `Insight.action` — маршрут, чат із префілом або колбек. */
  | { kind: "navigate"; path: string }
  | { kind: "open_chat"; prompt: string }
  | { kind: "callback"; fn: () => void };

export interface NowItem {
  /** Канонічний id: id `Rec`, якщо він є; інакше id `Insight`. */
  id: string;
  /** `"hub"` — крос-модульний рядок (звіт тижня). */
  module: Rec["module"];
  /** Одна шкала на всіх — шкала `Rec`. Більше — вище в купі. */
  priority: number;
  severity?: StatusColor | undefined;
  icon?: string | undefined;
  title: string;
  body?: string | undefined;
  action: NowAction;
  /** Префіл чипа «Спитати AI» — лише коли є `Insight`-джерело. */
  askAiPrompt?: string | undefined;
  /** Походження — обидва id, щоб dismiss ішов в обидва сховища. */
  recId?: string | undefined;
  insightId?: string | undefined;
}

/**
 * Пріоритет інсайту на шкалі `Rec`, за префіксом id.
 *
 * Старий `PRIORITY_RANK` 1–9 не переноситься монотонно: у нього
 * `nutrition-protein-low` стояв другим, а на числовій шкалі його двійник
 * `nutrition_protein_low` має 68 — нижче за `budget_over_*` (90). Шкала `Rec`
 * — тюнена продуктом (severity, час доби), тож перемагає вона, а старий ранг
 * тут не має спадкоємця.
 *
 * Правило: близнюк отримує число двійника — тоді дедуп не змінює позиції
 * рядка, з якого б джерела він не прийшов. Без двійника — число названо з
 * міркувань у коментарі. Порядок масиву = порядок перевірки префіксів.
 */
export const INSIGHT_PRIORITY: ReadonlyArray<
  [prefix: string, priority: number]
> = [
  // Активне тренування, час-критично; аналога серед Rec немає. Ставимо
  // на рівень `budget_over_*`, бо це єдиний сигнал, що втрачає сенс за
  // хвилини, а не за години.
  ["fizruk-pr-pending", 90],
  // = `budget_over_<cat>` (`packages/insights/.../budgetLimits.ts`).
  ["finyk-budget-overrun-", 90],
  // = `fizruk_long_break` (`recommendationEngine.ts`).
  ["fizruk-rest-day-overdue", 85],
  // Рекорд серії «ось-ось» — мотиваційно, але з дедлайном сьогодні;
  // між `nutrition_no_meals_today` 75 і `nutrition_kcal_low` 70.
  ["routine-streak-record-pending", 72],
  // = `nutrition_protein_low`.
  ["nutrition-protein-low", 68],
  // = `routine_evening_reminder`.
  ["routine-todo-evening", 65],
  // = `budget_warn_<cat>`: попередження про ліміт, ще не перевищений.
  ["finyk-budget-pace-", 60],
  // Святкування тижня — може почекати; над `budget_warn_*` 60 не лізе.
  ["nutrition-streak-7-days-", 60],
  // Інформаційно, тренд місяця.
  ["finyk-coffee-limit-", 58],
  // Інформаційно, відкриття; на хаб і так не потрапляє (`showOn: "module"`).
  ["finyk-recurring-detected", 56],
];

/** Невідомий префікс — нижче за все відоме, але вище за `spending_velocity_low` 45. */
export const UNKNOWN_INSIGHT_PRIORITY = 50;

export function insightPriority(id: string): number {
  for (const [prefix, priority] of INSIGHT_PRIORITY) {
    if (id === prefix || id.startsWith(prefix)) return priority;
  }
  return UNKNOWN_INSIGHT_PRIORITY;
}

/**
 * Близнюки — той самий сигнал з обох ранкерів. Явна мапа, не евристика по
 * тексту: заголовки збігаються не дослівно («3 дні без тренування» проти
 * «Пауза 3 дні»), а id стабільні.
 *
 * `rec` — точний id або префікс (`budget_over_`); `insight` — так само.
 * Для бюджету обидва id параметричні по категорії, тож звірка йде ще й по
 * ключу категорії: `budget_over_<a+b>` (кілька категорій через `+`)
 * ↔ `finyk-budget-overrun-<a>` — див. `isTwin`.
 */
export const REC_INSIGHT_TWINS: ReadonlyArray<{
  rec: string;
  insight: string;
  /** Обидва id несуть ключ категорії після префікса. */
  parametric?: true;
}> = [
  { rec: "nutrition_protein_low", insight: "nutrition-protein-low" },
  { rec: "routine_evening_reminder", insight: "routine-todo-evening" },
  { rec: "fizruk_long_break", insight: "fizruk-rest-day-overdue" },
  { rec: "budget_over_", insight: "finyk-budget-overrun-", parametric: true },
  // «Майже вичерпано» (≥90 %) і «за темпом перевищиш» про той самий ліміт —
  // одне попередження, не два рядки поспіль.
  { rec: "budget_warn_", insight: "finyk-budget-pace-", parametric: true },
];

function isTwin(rec: Rec, insight: Insight): boolean {
  for (const twin of REC_INSIGHT_TWINS) {
    if (twin.parametric) {
      if (!rec.id.startsWith(twin.rec) || !insight.id.startsWith(twin.insight))
        continue;
      const recKeys = rec.id.slice(twin.rec.length).split("+");
      const insightKey = insight.id.slice(twin.insight.length);
      if (recKeys.includes(insightKey)) return true;
      continue;
    }
    if (rec.id === twin.rec && insight.id === twin.insight) return true;
  }
  return false;
}

function actionOfRec(rec: Rec): NowAction {
  if (rec.action === Recommendations.WEEK_REPORT_ACTION) {
    return { kind: "open_week_report" };
  }
  if (rec.pwaAction) {
    return { kind: "module_action", module: rec.action, action: rec.pwaAction };
  }
  return rec.actionHash
    ? { kind: "open_module", module: rec.action, hash: rec.actionHash }
    : { kind: "open_module", module: rec.action };
}

function actionOfInsight(insight: Insight): NowAction {
  const a = insight.action;
  switch (a.type) {
    case "navigate":
      return { kind: "navigate", path: a.path };
    case "open-chat":
      return { kind: "open_chat", prompt: a.prompt };
    case "callback":
      return { kind: "callback", fn: a.fn };
  }
}

/**
 * «Звіт тижня» як ціль працює, лише коли блок «Порада й звіт тижня» є на
 * екрані. Коли його вимкнено в налаштуваннях, подію не слухає ніхто, і
 * «Відкрити» мовчки нічого б не робило: повертаємо рядку перехід у модуль,
 * яким він був до рішення 2026-10-01.
 */
export function withoutWeekReportTarget(item: NowItem): NowItem {
  return item.action.kind === "open_week_report"
    ? { ...item, action: { kind: "open_module", module: item.module } }
    : item;
}

function fromRec(rec: Rec, insight?: Insight): NowItem {
  return {
    id: rec.id,
    module: rec.module,
    priority: rec.priority,
    severity: rec.severity,
    icon: rec.icon || undefined,
    title: rec.title,
    body: rec.body || undefined,
    action: actionOfRec(rec),
    askAiPrompt: insight?.askAiPrompt,
    recId: rec.id,
    insightId: insight?.id,
  };
}

function fromInsight(insight: Insight): NowItem {
  return {
    id: insight.id,
    module: insight.module ?? "hub",
    priority: insightPriority(insight.id),
    title: insight.title,
    body: insight.subtitle || undefined,
    action: actionOfInsight(insight),
    askAiPrompt: insight.askAiPrompt,
    insightId: insight.id,
  };
}

/**
 * Зливає обидва джерела в один відсортований список.
 *
 * - близнюк → ОДИН рядок: id, title, body, severity, icon і дія — з `Rec`
 *   (у нього імперативна дія й тюнений пріоритет), `askAiPrompt` — з
 *   `Insight` (рішення власника «дія з Rec + чип AI з Insight»);
 * - дублікати id всередині одного джерела — перший виграє (як і в
 *   `generateRecommendations`);
 * - сортування стабільне за спаданням `priority`, тож рівні пріоритети
 *   зберігають порядок джерела: спершу Rec, потім Insight.
 *
 * Що НЕ робить: не читає dismissed і не обмежує довжину — це справа хука
 * і купи відповідно.
 */
export function mergeNowItems(
  recs: readonly Rec[],
  insights: readonly Insight[],
): NowItem[] {
  const seenRec = new Set<string>();
  const consumedInsight = new Set<string>();
  const items: NowItem[] = [];

  for (const rec of recs) {
    if (seenRec.has(rec.id)) continue;
    seenRec.add(rec.id);
    const twin = insights.find(
      (i) => !consumedInsight.has(i.id) && isTwin(rec, i),
    );
    if (twin) consumedInsight.add(twin.id);
    items.push(fromRec(rec, twin));
  }

  for (const insight of insights) {
    if (consumedInsight.has(insight.id)) continue;
    consumedInsight.add(insight.id);
    items.push(fromInsight(insight));
  }

  // `Array.prototype.sort` стабільний з ES2019 — рівні пріоритети лишаються
  // в порядку вставки.
  return items.sort((a, b) => b.priority - a.priority);
}
