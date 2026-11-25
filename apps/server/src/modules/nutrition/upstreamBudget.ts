import { env } from "../../env.js";
import { getPerTargetRateLimit } from "../../http/rateLimit.js";
import { recordExternalHttp } from "../../lib/externalHttp.js";
import { logger } from "../../obs/logger.js";

/**
 * Глобальний (не per-IP) бюджет на лімітовані апстріми харчування
 * (rel-35 / sec-24 аудиту 2026-10-01).
 *
 * AI-CONTEXT: `/api/barcode` і `/api/food-search` відкриті без сесії, а
 * per-IP бакети роутерів (300 і 600 на добу) вищі за стелю постачальника на
 * весь продукт: тріал UPCitemdb дає 100 запитів на добу, USDA з ключем
 * 1000 на годину, DEMO_KEY 30 на годину і 50 на добу. Один анонім вичерпував
 * спільну квоту, і апстрім відповідав 429 усім до кінця вікна. Тут лічильник
 * один на апстрім і на всі інстанси (той самий Redis → Postgres → in-memory
 * ланцюг, що й у лімітера), і він тримається нижче стелі. Коли бюджет
 * вичерпано, апстрім не викликаємо.
 *
 * Небезпека: пропущений за бюджетом апстрім НЕ є авторитетним miss. Він
 * означає «не питали», а не «в базі немає», тож для каскаду це той самий
 * стан, що й упалий апстрім (G5 у `barcode.ts`): жодного miss-sentinel у
 * кеші, 503 з `no-store`, якщо більше нічого не знайшлось. Інакше промах
 * отруює кеш і публічний `Cache-Control` довше за вікно бюджету.
 *
 * Вікна вирівняні за UTC (`floor(now / windowMs)` у subject), бо фіксоване
 * вікно від першого запиту дрейфує відносно доби постачальника. Годинна
 * стеля api.data.gov ковзна, тож годинний бюджет USDA взято вдвічі нижчим за
 * неї: два сусідні вирівняні вікна разом не перевищують ковзну годину.
 */
export type BudgetedUpstream = "usda" | "upcitemdb";

interface BudgetWindow {
  /** Суфікс ключа бакета: `day` / `hour`. */
  label: "day" | "hour";
  limit: number;
  windowMs: number;
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** Тріал UPCitemdb: 100 на добу на продукт, лишаємо запас у 10. */
export const UPCITEMDB_DEFAULT_DAILY_BUDGET = 90;
/** Ключ api.data.gov: 1000 на ковзну годину, половина на вирівняне вікно. */
export const USDA_KEYED_DEFAULT_HOURLY_BUDGET = 450;
/** DEMO_KEY: 30 на годину і 50 на добу з однієї IP (тобто з нашого сервера). */
export const USDA_DEMO_HOURLY_BUDGET = 15;
export const USDA_DEMO_DAILY_BUDGET = 45;

function budgetWindows(
  upstream: BudgetedUpstream,
  opts: { keyed: boolean },
): BudgetWindow[] {
  if (upstream === "upcitemdb") {
    return [
      {
        label: "day",
        limit: env.UPCITEMDB_DAILY_BUDGET ?? UPCITEMDB_DEFAULT_DAILY_BUDGET,
        windowMs: DAY_MS,
      },
    ];
  }
  if (opts.keyed) {
    return [
      {
        label: "hour",
        limit: env.USDA_HOURLY_BUDGET ?? USDA_KEYED_DEFAULT_HOURLY_BUDGET,
        windowMs: HOUR_MS,
      },
    ];
  }
  return [
    { label: "hour", limit: USDA_DEMO_HOURLY_BUDGET, windowMs: HOUR_MS },
    { label: "day", limit: USDA_DEMO_DAILY_BUDGET, windowMs: DAY_MS },
  ];
}

// Один warn на вікно на процес: вичерпаний бюджет видно в логах, але кожен
// пропущений запит лог не засмічує (лічильник у метриці).
const warnedWindows = new Set<string>();

/**
 * Списує один запит з бюджету апстріму. `true` означає «можна викликати»,
 * `false` означає «бюджет вичерпано, апстрім не питаємо», і це не miss
 * (див. «Небезпека» в шапці модуля).
 *
 * Списання йде ДО виклику: рахуємо спроби, бо постачальник рахує саме їх,
 * зокрема ті, що закінчились таймаутом чи 5xx. `keyed` для USDA відрізняє
 * власний ключ від DEMO_KEY, у якого інші стелі й окремий лічильник.
 */
export async function tryConsumeUpstreamBudget(
  upstream: BudgetedUpstream,
  opts: { keyed: boolean },
): Promise<boolean> {
  const now = Date.now();
  const mode = opts.keyed ? "key" : "demo";
  for (const w of budgetWindows(upstream, opts)) {
    const windowIndex = Math.floor(now / w.windowMs);
    const key = `upstream-budget:${upstream}:${w.label}`;
    const rl = await getPerTargetRateLimit(key, `${mode}:${windowIndex}`, {
      limit: w.limit,
      windowMs: w.windowMs,
    });
    if (!rl.ok) {
      recordExternalHttp(upstream, "budget_exhausted");
      const warnKey = `${key}:${mode}:${windowIndex}`;
      if (!warnedWindows.has(warnKey)) {
        warnedWindows.add(warnKey);
        logger.warn({
          msg: "nutrition_upstream_budget_exhausted",
          upstream,
          window: w.label,
          limit: w.limit,
          mode,
        });
      }
      return false;
    }
  }
  return true;
}

/** Імʼя помилки, за яким каскади відрізняють пропуск за бюджетом. */
export const UPSTREAM_BUDGET_EXHAUSTED = "UpstreamBudgetExhaustedError";

/**
 * Те саме списання, але вичерпаний бюджет кидає помилку з іменем
 * `UPSTREAM_BUDGET_EXHAUSTED`: каскад штрихкодів ловить її в per-source
 * catch разом зі збоями апстріму, тобто як неавторитетну відповідь.
 */
export async function consumeUpstreamBudgetOrThrow(
  upstream: BudgetedUpstream,
  opts: { keyed: boolean },
): Promise<void> {
  if (await tryConsumeUpstreamBudget(upstream, opts)) return;
  const error = new Error(`${upstream} upstream budget exhausted`);
  error.name = UPSTREAM_BUDGET_EXHAUSTED;
  throw error;
}

/** Test-only: скидає дедуплікацію warn-ів між тестами. */
export function __resetUpstreamBudgetWarnsForTests(): void {
  warnedWindows.clear();
}
