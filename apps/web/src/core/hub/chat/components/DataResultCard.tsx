/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";

/**
 * Структурована картка для read-only query/analytics tool-ів
 * ("talk to your data", PR4). Парсить плоский текстовий результат
 * виконавця (queryFinyk/Fizruk/Routine/Nutrition) у три прості блоки:
 *
 *  1. headline — заголовок + опційний підзаголовок (період / обсяг);
 *  2. metrics — числові рядки виду «Мітка: значення» (наприклад, з
 *     багаторядкових результатів `exercise_progress`, `training_stats`,
 *     `nutrition_averages`, `query_habits`, `habit_correlation`);
 *  3. breakdown — впорядкований список «ключ → сума (лічильник)» з
 *     mini-bar-ами для агрегацій (`aggregate_spending`, listing-частина
 *     `query_transactions` / `query_workouts` / `query_nutrition`).
 *
 * Свідомо НЕ тягне модульний accent (Rule #12 module-accent
 * containment) — hub-картка фарбується нейтральним `brand` accent-ом,
 * як `ActionCard` у `ChatMessage`. Парсинг — best-effort: усе, що не
 * вписалось у структуру, лишається у `headline`, тож гірше за текстовий
 * fallback бути не може.
 */

export interface DataResultCardProps {
  /** Назва query/analytics tool-а (для іконки та a11y-міток). */
  toolName: string;
  /** Сирий текстовий результат виконавця — той самий, що йде у `summary`. */
  result: string;
  /** failed-статус успадковується від картки в `ChatMessage`. */
  failed?: boolean;
  title: string;
}

interface MetricRow {
  label: string;
  value: string;
}

interface BreakdownRow {
  label: string;
  /** Числове значення для масштабу mini-bar (грн / об'єм / ккал тощо). */
  amount: number;
  /** Готовий текст значення праворуч (з одиницями). */
  display: string;
}

interface ParsedResult {
  headline: string;
  subtitle?: string;
  metrics: MetricRow[];
  breakdown: BreakdownRow[];
}

/** Іконка для tool-а — нейтральна (hub), без модульного accent-у. */
function iconForQueryTool(toolName: string): string {
  switch (toolName) {
    case "aggregate_spending":
    case "training_stats":
    case "nutrition_averages":
    case "query_habits":
      return "bar-chart";
    case "compare_periods":
    case "exercise_progress":
    case "habit_correlation":
      return "trending-up";
    case "query_transactions":
    case "query_workouts":
    case "query_nutrition":
      return "search";
    default:
      return "bar-chart";
  }
}

/**
 * Витягує провідне число з рядка «… 2340 грн …» для масштабу mini-bar.
 * Перша група цифр (з опційним знаком/комою) → number, інакше 0.
 */
function leadingNumber(text: string): number {
  const m = text.match(/-?\d[\d\s]*(?:[.,]\d+)?/);
  if (!m) return 0;
  const n = Number(m[0].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/**
 * Розбиває «хвіст-список» виду
 *   `m_1: 2026-05-01 · 120 грн · кава · Кафе; m_2: …`
 * або
 *   `Кафе: 2340 грн (47); Транспорт: 1200 грн (12)`
 * на рядки breakdown. Кожен елемент — `label: value`-пара по `: `,
 * розділена `; `. Значення зберігається як display-текст; для масштабу
 * mini-bar беремо провідне число.
 */
function parseBreakdownList(tail: string): BreakdownRow[] {
  return tail
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const sep = chunk.indexOf(":");
      if (sep === -1) {
        return { label: chunk, amount: leadingNumber(chunk), display: "" };
      }
      const label = chunk.slice(0, sep).trim();
      const display = chunk.slice(sep + 1).trim();
      return { label, amount: leadingNumber(display), display };
    })
    .filter((row) => row.label.length > 0);
}

/**
 * Багаторядкові результати (`exercise_progress`, `training_stats`,
 * `nutrition_averages`, `query_habits`, `habit_correlation`,
 * `compare_periods` коли він прийшов як одне речення з крапками) —
 * перший рядок стає headline, решта «Мітка: значення» — metrics.
 */
function parseMultiline(result: string): ParsedResult {
  const lines = result
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const [first, ...rest] = lines;
  const metrics: MetricRow[] = [];
  for (const line of rest) {
    const sep = line.indexOf(":");
    if (sep > 0) {
      metrics.push({
        label: line.slice(0, sep).trim(),
        value: line.slice(sep + 1).trim(),
      });
    } else {
      metrics.push({ label: line, value: "" });
    }
  }
  return { headline: first ?? result, metrics, breakdown: [] };
}

/**
 * Single-line результати з «хвостом-списком» після останнього `: `
 * (`query_transactions`, `aggregate_spending`, `query_workouts`,
 * `query_nutrition`). Префікс до списку — headline, список — breakdown.
 */
/**
 * Маркер, після якого в кожного listing-tool-а починається `;`-список.
 * Виконавці (query*Actions) формують headline як `<фраза><MARKER><list>`,
 * де MARKER унікальний для tool-а й не зустрічається в самих item-ах —
 * це уникає двозначності з «: » всередині item-ів (`Кафе: 2340 грн`) чи
 * headline-а (діапазон дат `2026-05-31: `).
 */
const LIST_INTRO_BY_TOOL: Readonly<Record<string, string>> = {
  // `Розбивка за категоріями: Кафе: 2340 грн (47); …`
  aggregate_spending: "Розбивка за ",
  // `Знайдено N транзакц. на суму X грн[ (показано …)]: m_1: …; …`
  query_transactions: " грн",
  // `Тренувань за N днів: M, сумарний об'єм X кг×повт[ (…)]: 2026-…: …`
  query_workouts: "кг×повт",
  // `Прийомів за from — to: N, разом X ккал (…)[ (…)]: 2026-…: …`
  query_nutrition: "г)",
};

function parseSingleLineWithList(
  toolName: string,
  result: string,
): ParsedResult {
  if (!result.includes("; ")) {
    return { headline: result, metrics: [], breakdown: [] };
  }
  const intro = LIST_INTRO_BY_TOOL[toolName];
  if (intro) {
    const at = result.indexOf(intro);
    if (at !== -1) {
      // Список починається на першому «: » після intro-маркера.
      const colon = result.indexOf(": ", at + intro.length);
      if (colon !== -1 && result.indexOf("; ", colon) !== -1) {
        const headline = result.slice(0, colon).trim();
        const tail = result.slice(colon + 2).trim();
        return { headline, metrics: [], breakdown: parseBreakdownList(tail) };
      }
    }
  }
  return { headline: result, metrics: [], breakdown: [] };
}

function parseResult(toolName: string, result: string): ParsedResult {
  if (result.includes("\n")) return parseMultiline(result);
  if (toolName === "compare_periods") {
    return { headline: result, metrics: [], breakdown: [] };
  }
  return parseSingleLineWithList(toolName, result);
}

function BreakdownBars({ rows }: { rows: BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <ul className="mt-1.5 flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const pct = Math.max(2, Math.round((row.amount / max) * 100));
        return (
          <li key={`${row.label}-${i}`} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-2 text-style-caption">
              <span className="min-w-0 truncate text-subtle">{row.label}</span>
              {row.display && (
                <span className="shrink-0 font-medium text-text tabular-nums">
                  {row.display}
                </span>
              )}
            </div>
            {row.amount > 0 && (
              <div
                className="h-1 w-full overflow-hidden rounded-full bg-brand-500/10"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-brand-500/70"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DataResultCardImpl({
  toolName,
  result,
  failed,
  title,
}: DataResultCardProps) {
  const parsed = parseResult(toolName, result);

  return (
    <div
      data-testid={`chat-data-card-${toolName}`}
      role="status"
      aria-label={`${title}: ${parsed.headline}`}
      className={cn(
        "mt-2 rounded-xl border px-3 py-2.5",
        failed
          ? "border-warning/30 bg-warning/10"
          : "border-brand-500/30 bg-brand-500/5",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 shrink-0",
            failed ? "text-warning" : "text-brand-500",
          )}
          aria-hidden
        >
          <Icon
            name={failed ? "alert" : iconForQueryTool(toolName)}
            size={14}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text wrap-break-word">
            {title}
          </p>
          <p className="mt-0.5 text-style-caption text-subtle wrap-break-word">
            {parsed.headline}
          </p>

          {parsed.metrics.length > 0 && (
            <dl className="mt-1.5 flex flex-col gap-1">
              {parsed.metrics.map((m, i) => (
                <div
                  key={`${m.label}-${i}`}
                  className="flex items-baseline justify-between gap-2 text-style-caption"
                >
                  <dt className="min-w-0 truncate text-subtle">{m.label}</dt>
                  {m.value && (
                    <dd className="shrink-0 font-medium text-text tabular-nums">
                      {m.value}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          )}

          {parsed.breakdown.length > 0 && (
            <BreakdownBars rows={parsed.breakdown} />
          )}
        </div>
      </div>
    </div>
  );
}

export const DataResultCard = memo(DataResultCardImpl);
