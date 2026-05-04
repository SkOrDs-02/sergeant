/**
 * Автодетекція регулярних витрат (підписок) із історії транзакцій.
 *
 * Групує expense-транзакції за нормалізованим merchant-ключем, шукає
 * регулярні інтервали (тижневі / двотижневі / місячні / квартальні /
 * річні) зі стабільною сумою та повертає кандидатів, які користувач може
 * одним кліком перетворити на підписку.
 *
 * Чистий модуль без залежностей від localStorage/DOM — інтегрується через
 * `RecurringSuggestions.jsx`.
 */

const DAY_SECONDS = 86_400;

export type RecurringCadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type RecurringConfidence = "high" | "medium" | "low";

interface CadenceSpec {
  id: RecurringCadence;
  minDays: number;
  maxDays: number;
  maxStddev: number;
}

/**
 * Діапазони інтервалів (у днях) для класифікації періоду групи транзакцій.
 * maxStddev обмежує джіттер — якщо гапи стрибають занадто сильно, група
 * не вважається регулярною.
 */
const CADENCES: readonly CadenceSpec[] = [
  { id: "weekly", minDays: 6, maxDays: 8, maxStddev: 1.5 },
  { id: "biweekly", minDays: 12, maxDays: 16, maxStddev: 2.5 },
  { id: "monthly", minDays: 25, maxDays: 35, maxStddev: 5 },
  { id: "quarterly", minDays: 85, maxDays: 95, maxStddev: 8 },
  { id: "yearly", minDays: 355, maxDays: 375, maxStddev: 15 },
];

/** Максимальний коефіцієнт варіації суми, за якого група ще вважається "стабільною". */
const MAX_AMOUNT_CV = 0.25;

/** Мінімум 2 повторення — 2 транзакції достатньо для гіпотези. */
const MIN_OCCURRENCES = 2;

export interface RecurringTx {
  id: string;
  /** Unix seconds. */
  time: number;
  /** Monobank minor units (kopecks); negative for expenses. */
  amount: number;
  description?: string | null;
  currencyCode?: number | null;
  mcc?: number | null;
}

export interface RecurringSubscription {
  id: string;
  name?: string;
  keyword?: string;
  linkedTxId?: string | null;
  currency?: string;
}

export interface RecurringCandidate {
  /** Нормалізований merchant-ключ (унікальний для групи). */
  key: string;
  /** Найкраще ім'я з транзакцій (для відображення). */
  displayName: string;
  /** Середня сума у одиницях (грн/долар), додатня. */
  avgAmount: number;
  /** "UAH" | "USD" — на основі currencyCode останньої транзакції. */
  currency: "UAH" | "USD";
  cadence: RecurringCadence;
  /** Середній інтервал між транзакціями у днях. */
  averageGapDays: number;
  /** День місяця для monthly cadence (із найсвіжішої транзакції). */
  billingDay: number;
  /** Кількість транзакцій у групі. */
  occurrences: number;
  confidence: RecurringConfidence;
  /** Unix seconds найсвіжішої транзакції. */
  lastTxTime: number;
  /** Очікувана дата наступної транзакції (unix seconds). */
  nextExpectedTime: number;
  /** Зразкові id (найсвіжіші перші, до 5). */
  sampleTxIds: string[];
}

export interface DetectOptions {
  /** Поточні підписки — кандидати, що збігаються, відфільтровуються. */
  subscriptions?: RecurringSubscription[];
  /** Ключі, які користувач сховав — пропускаються. */
  dismissedKeys?: readonly string[];
  /** Id транзакцій, які не брати до уваги (hiddenTxIds). */
  excludedTxIds?: readonly string[];
  /** "Тепер" у unix seconds (для тестів). Default — Date.now(). */
  nowSec?: number;
  /**
   * Максимальний вік найсвіжішої транзакції групи (днів). Група, де
   * остання транзакція старіша, ігнорується — ймовірно користувач
   * відмовився від сервісу.
   * Default: 45 днів (поріг трошки більший за місяць).
   */
  maxAgeDays?: number;
}

// ---------- helpers ----------

/**
 * Нормалізує description до стабільного merchant-ключа:
 * lowercase, прибирає цифри/пунктуацію/невидимі символи, ріже до 3
 * значущих слів. Достатньо для угруповання типових мерчантів Monobank.
 */
export function normalizeMerchantKey(
  description: string | null | undefined,
): string {
  if (!description) return "";
  const lowered = description.toLowerCase();
  const cleaned = lowered
    // прибрати * маскування карт / зірочки всередині: "mono*netflix"
    .replace(/\*+/g, " ")
    // прибрати цифри (номери замовлень, суми, рік)
    .replace(/[\d]+/g, " ")
    // прибрати все крім латиниці, кирилиці та пробілів
    .replace(/[^a-zа-яіїєґ\s]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned.split(" ").filter((t) => t.length >= 2);
  if (!tokens.length) return "";
  return tokens.slice(0, 3).join(" ");
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stddev(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  let acc = 0;
  for (const x of xs) acc += (x - mu) * (x - mu);
  return Math.sqrt(acc / (xs.length - 1));
}

function detectCadence(gapsDays: number[]): {
  cadence: RecurringCadence;
  averageGapDays: number;
} | null {
  if (!gapsDays.length) return null;
  const avg = mean(gapsDays);
  const sd = stddev(gapsDays, avg);
  for (const spec of CADENCES) {
    if (avg >= spec.minDays && avg <= spec.maxDays && sd <= spec.maxStddev) {
      return { cadence: spec.id, averageGapDays: avg };
    }
  }
  return null;
}

function amountCoefficientOfVariation(amounts: number[]): number {
  if (amounts.length < 2) return 0;
  const mu = mean(amounts);
  if (mu === 0) return 0;
  return stddev(amounts, mu) / mu;
}

function toConfidence(occurrences: number): RecurringConfidence {
  if (occurrences >= 4) return "high";
  if (occurrences === 3) return "medium";
  return "low";
}

function pickDisplayName(descriptions: string[]): string {
  // Найдовша з descriptions частіше містить найбільше інформації; як
  // fallback — перший непорожній.
  let best = "";
  for (const d of descriptions) {
    if (!d) continue;
    if (d.length > best.length) best = d;
  }
  return best.trim();
}

function currencyFromCode(code: number | null | undefined): "UAH" | "USD" {
  return code === 840 ? "USD" : "UAH";
}

function subscriptionCoversKey(
  sub: RecurringSubscription,
  key: string,
  groupTxIds: Set<string>,
): boolean {
  if (sub.linkedTxId && groupTxIds.has(sub.linkedTxId)) return true;
  const kw = (sub.keyword || "").trim().toLowerCase();
  if (!kw) return false;
  // key — це нормалізовані, пробілами розділені токени; достатньо
  // перевірити, чи keyword підписки повністю там міститься.
  return key.includes(kw);
}

// ---------- public API ----------

export function detectRecurring(
  transactions: readonly RecurringTx[],
  options: DetectOptions = {},
): RecurringCandidate[] {
  const {
    subscriptions = [],
    dismissedKeys = [],
    excludedTxIds = [],
    nowSec = Math.floor(Date.now() / 1000),
    maxAgeDays = 45,
  } = options;

  if (!transactions || !transactions.length) return [];

  const excluded = new Set(excludedTxIds);
  const dismissed = new Set(dismissedKeys);

  // Групування за нормалізованим merchant-ключем.
  const groups = new Map<string, RecurringTx[]>();
  for (const tx of transactions) {
    if (!tx || typeof tx.amount !== "number" || tx.amount >= 0) continue;
    if (!tx.id || excluded.has(tx.id)) continue;
    const key = normalizeMerchantKey(tx.description);
    if (!key) continue;
    if (dismissed.has(key)) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(tx);
    else groups.set(key, [tx]);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [key, txs] of groups) {
    if (txs.length < MIN_OCCURRENCES) continue;

    // Сортуємо за часом asc для обчислення гапів.
    const sorted = [...txs].sort((a, b) => (a.time || 0) - (b.time || 0));
    const gapsDays: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      // Цикл `i = 1..sorted.length-1` гарантує існування обох індексів,
      // але `noUncheckedIndexedAccess` все одно вимагає явного narrow.
      const prevTx = sorted[i - 1];
      const curTx = sorted[i];
      if (!prevTx || !curTx) continue;
      const prev = prevTx.time || 0;
      const cur = curTx.time || 0;
      if (prev && cur && cur > prev) {
        gapsDays.push((cur - prev) / DAY_SECONDS);
      }
    }
    const cadence = detectCadence(gapsDays);
    if (!cadence) continue;

    // Стабільність суми (у абсолютних копійках).
    const absAmounts = sorted.map((t) => Math.abs(t.amount));
    const cv = amountCoefficientOfVariation(absAmounts);
    if (cv > MAX_AMOUNT_CV) continue;

    // `sorted.length >= MIN_OCCURRENCES` (filter вище), але індекс-доступ
    // у TS під strict — типу `T | undefined`, тому явно narrow-имо.
    const lastTx = sorted[sorted.length - 1];
    if (!lastTx) continue;
    const lastTxTime = lastTx.time || 0;
    if (!lastTxTime) continue;

    // Якщо остання транзакція старіша за maxAgeDays — сервіс, імовірно,
    // більше не активний.
    const ageDays = (nowSec - lastTxTime) / DAY_SECONDS;
    if (ageDays > maxAgeDays) continue;

    // Пропустити, якщо вже є підписка, що покриває цей ключ.
    const groupIds = new Set(sorted.map((t) => t.id));
    if (
      subscriptions.some((sub) => subscriptionCoversKey(sub, key, groupIds))
    ) {
      continue;
    }

    const avgAmountMinor = mean(absAmounts);
    const avgAmount = Math.round(avgAmountMinor) / 100;
    const currency = currencyFromCode(lastTx.currencyCode);
    const displayName = pickDisplayName(sorted.map((t) => t.description || ""));
    const billingDay = new Date(lastTxTime * 1000).getDate();
    const nextExpectedTime = lastTxTime + cadence.averageGapDays * DAY_SECONDS;
    const sampleTxIds = [...sorted]
      .reverse()
      .slice(0, 5)
      .map((t) => t.id);

    candidates.push({
      key,
      displayName: displayName || key,
      avgAmount,
      currency,
      cadence: cadence.cadence,
      averageGapDays: Math.round(cadence.averageGapDays * 10) / 10,
      billingDay,
      occurrences: sorted.length,
      confidence: toConfidence(sorted.length),
      lastTxTime,
      nextExpectedTime: Math.round(nextExpectedTime),
      sampleTxIds,
    });
  }

  // confidence desc → avgAmount desc → recency desc.
  const confidenceRank: Record<RecurringConfidence, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  candidates.sort((a, b) => {
    const byConf = confidenceRank[b.confidence] - confidenceRank[a.confidence];
    if (byConf !== 0) return byConf;
    if (b.avgAmount !== a.avgAmount) return b.avgAmount - a.avgAmount;
    return b.lastTxTime - a.lastTxTime;
  });

  return candidates;
}
