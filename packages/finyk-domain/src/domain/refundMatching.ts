import { normalizeMerchantKey } from "../lib/recurringDetect.js";
import { txTimeMs } from "../lib/transactions.js";

/**
 * Скасування платежу: «Uklon −189» і «Скасування. Uklon +189».
 *
 * AI-CONTEXT (рішення власника 2026-10-01, варіант А): до цього парування в
 * домені не було взагалі — списання лічилось витратою (Транспорт), а
 * скасування надходженням (Інше), і обидва числа брехали на суму поїздки.
 * Тепер пара ловиться автоматично, і ОБИДВІ ноги виходять зі статистики
 * (`buildFinykExcludedTxIds`), тож кожен споживач набору виключень успадковує
 * правило без власної арифметики.
 *
 * Правило свідомо вузьке, бо автоматика, що вгадує, гірша за відсутню:
 *  - надходження з описом «Скасування. <опис>» (префікс без урахування
 *    регістру; після нього `.`/`:`/пробіл) — інші формулювання («Повернення …»)
 *    сюди не входять, доки не бачили їх у реальній виписці;
 *  - списання з тим самим нормалізованим мерчантом (`normalizeMerchantKey`,
 *    як у детектора регулярних платежів; для опису без слів — сам опис, див.
 *    `refundKeyOf`) і ТОЧНО тією ж сумою в копійках: часткове скасування
 *    (сума відрізняється) не парується;
 *  - списання РАНІШЕ за надходження і не далі ніж за {@link REFUND_MAX_GAP_DAYS}
 *    днів; лише коли такого немає, підходить списання, датоване щонайбільше на
 *    {@link REFUND_CLOCK_SKEW_SECONDS} с ПІЗНІШЕ (див. константу);
 *  - той самий рахунок і валюта, коли обидва відомі: скасування повертає гроші
 *    на ту саму картку;
 *  - єдиний найкращий збіг: найближче попереднє списання; за рівної відстані
 *    (двох неможливо розрізнити) пара не ставиться. Одне списання не
 *    парується з двома надходженнями.
 */

/**
 * Скільки днів між списанням і скасуванням ще вважається однією парою.
 *
 * 30, бо скасування картковий банк проводить не одразу: холд на авторизацію
 * знімається до місяця, а повернення, оформлене мерчантом, доходить за дні.
 * Ширше вікно робить випадковий збіг із наступною такою ж поїздкою вірогіднішим
 * за користь від довгих скасувань; вужче губить повільні.
 */
export const REFUND_MAX_GAP_DAYS = 30;

/**
 * На скільки секунд скасування може бути датоване РАНІШЕ за своє списання.
 *
 * AI-CONTEXT (фідбек власника 2026-11-19): відхилений переказ на картку
 * банк проводить як списання і «Скасування. …» в ту саму хвилину, і в
 * Операціях списання стояло НАД своїм скасуванням. Порядок однієї секунди
 * список не гарантує, тож це не доказ, але хибна різниця в кілька секунд між
 * двома ногами однієї операції безпечніша за переказ на 170 000 ₴, що
 * лічиться витратою й доходом водночас. Пізніше списання береться лише тоді,
 * коли попереднього кандидата немає: скасована й одразу перезамовлена поїздка
 * на ту саму суму парується з першою, а не з другою.
 */
export const REFUND_CLOCK_SKEW_SECONDS = 300;

const DAY_MS = 86_400_000;
const CLOCK_SKEW_MS = REFUND_CLOCK_SKEW_SECONDS * 1000;

/**
 * Ключ, за яким звіряються ноги пари.
 *
 * AI-CONTEXT (фідбек власника 2026-11-19, «Скасування. 410247******8090»):
 * переказ на картку за номером Monobank описує маскованим номером картки, а
 * `normalizeMerchantKey` викидає цифри й зірочки — ключ виходив порожній, і
 * пара не ловилась зовсім: обидва 170 000 ₴ рахувались витратою («Перекази
 * людям») і доходом («Інше»). Коли слів в описі немає, ключем стає сам опис
 * без регістру й пробілів, і лише якщо в ньому є цифри: збіг лишається
 * точним, правило не ширшає.
 */
function refundKeyOf(description: string | null | undefined): string {
  const merchant = normalizeMerchantKey(description);
  if (merchant) return merchant;
  if (typeof description !== "string") return "";
  const raw = description.toLowerCase().replace(/\s+/g, "");
  return /\d/.test(raw) ? raw : "";
}

/**
 * Префікс опису скасування: слово, за яким іде крапка, двокрапка чи пробіл.
 * Мерчанта далі вирізає `trim()`, а не регекс: хвіст `(\S.*?)\s*$` давав
 * поліноміальний бектрекінг на описах із довгими пробілами (CodeQL).
 */
const CANCELLATION_PREFIX_RE = /^скасування(?=[.:\s])/iu;

/** Мінімальна форма транзакції для парування. */
export interface RefundTxLike {
  id: string;
  /** Копійки; від'ємна — списання, додатна — надходження. */
  amount: number;
  /** Секунди (або мілісекунди — нормалізується). */
  time?: number | string | undefined;
  description?: string | undefined;
  accountId?: string | null | undefined;
  _accountId?: string | null | undefined;
  currencyCode?: number | undefined;
}

export interface CancellationPair<T extends RefundTxLike = RefundTxLike> {
  /** Початкове списання. */
  debit: T;
  /** Скасування — надходження «Скасування. …». */
  credit: T;
  /**
   * Від списання до скасування, мс. Відʼємна лише в межах
   * {@link REFUND_CLOCK_SKEW_SECONDS}: скасування датоване трохи раніше.
   */
  gapMs: number;
}

export interface CancellationMatchOptions {
  maxGapDays?: number | undefined;
}

/**
 * Мерчант із опису скасування, або `null`, коли опис не скасування.
 * «Скасування. Uklon», «скасування Uklon», «СКАСУВАННЯ: Uklon» → «Uklon».
 */
export function cancelledMerchantOf(
  description: string | null | undefined,
): string | null {
  if (typeof description !== "string") return null;
  const text = description.trim();
  const prefix = CANCELLATION_PREFIX_RE.exec(text);
  if (!prefix) return null;
  // Один розділовий знак одразу після слова — частина префікса.
  let rest = text.slice(prefix[0].length);
  if (rest.startsWith(".") || rest.startsWith(":")) rest = rest.slice(1);
  const merchant = rest.trim();
  return merchant === "" ? null : merchant;
}

function accountIdOf(tx: RefundTxLike): string | null {
  const value = tx.accountId ?? tx._accountId;
  return typeof value === "string" && value.trim() ? value : null;
}

function currencyOf(tx: RefundTxLike): number | null {
  const value = Number(tx.currencyCode);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sameWhenKnown<V>(a: V | null, b: V | null): boolean {
  return a === null || b === null || a === b;
}

interface Leg<T> {
  tx: T;
  timeMs: number;
}

/**
 * Знаходить пари «списання ↔ скасування» без зміни даних. Правила — у шапці
 * файла. Чиста функція: нічого не читає зі сховища.
 */
export function findCancellationPairs<T extends RefundTxLike>(
  transactions: readonly (T | null | undefined)[] | null | undefined,
  options: CancellationMatchOptions = {},
): CancellationPair<T>[] {
  const list = Array.isArray(transactions) ? transactions : [];
  const configured = Number(options.maxGapDays);
  const maxGapMs =
    (Number.isFinite(configured) && configured > 0
      ? configured
      : REFUND_MAX_GAP_DAYS) * DAY_MS;

  const credits: Array<Leg<T> & { key: string }> = [];
  const debits = new Map<string, Array<Leg<T>>>();

  for (const tx of list) {
    if (!tx || !tx.id || typeof tx.amount !== "number" || tx.amount === 0) {
      continue;
    }
    const timeMs = txTimeMs(
      typeof tx.time === "string" ? Number(tx.time) : tx.time,
    );
    if (!Number.isFinite(timeMs) || timeMs <= 0) continue;

    if (tx.amount > 0) {
      const merchant = cancelledMerchantOf(tx.description);
      const key = merchant ? refundKeyOf(merchant) : "";
      if (key) credits.push({ tx, timeMs, key });
      continue;
    }
    const key = refundKeyOf(tx.description);
    if (!key) continue;
    const bucketKey = `${key}|${-tx.amount}`;
    const bucket = debits.get(bucketKey);
    if (bucket) bucket.push({ tx, timeMs });
    else debits.set(bucketKey, [{ tx, timeMs }]);
  }

  // Хронологічно: ранішим скасуванням дістається найближче списання.
  credits.sort((a, b) => a.timeMs - b.timeMs || a.tx.id.localeCompare(b.tx.id));

  const claimed = new Set<string>();
  const pairs: CancellationPair<T>[] = [];

  for (const credit of credits) {
    const bucket = debits.get(`${credit.key}|${credit.tx.amount}`);
    if (!bucket) continue;

    // Ранг кандидата: спершу попередні списання (gap ≥ 0) за відстанню, і
    // лише без них — пізніші в межах допуску годинника (див.
    // `REFUND_CLOCK_SKEW_SECONDS`), теж за відстанню.
    let best: Leg<T> | null = null;
    let bestRank = Infinity;
    let tied = false;
    for (const debit of bucket) {
      if (claimed.has(debit.tx.id)) continue;
      const gap = credit.timeMs - debit.timeMs;
      if (gap < -CLOCK_SKEW_MS || gap > maxGapMs) continue;
      if (
        !sameWhenKnown(accountIdOf(debit.tx), accountIdOf(credit.tx)) ||
        !sameWhenKnown(currencyOf(debit.tx), currencyOf(credit.tx))
      ) {
        continue;
      }
      const rank = gap >= 0 ? gap : maxGapMs + 1 - gap;
      if (rank < bestRank) {
        best = debit;
        bestRank = rank;
        tied = false;
      } else if (rank === bestRank) {
        tied = true;
      }
    }
    if (!best || tied) continue;

    claimed.add(best.tx.id);
    pairs.push({
      debit: best.tx,
      credit: credit.tx,
      gapMs: credit.timeMs - best.timeMs,
    });
  }

  return pairs;
}

/** Id обох ніг усіх знайдених пар — те, що виходить зі статистики. */
export function findCancelledTxIds(
  transactions: readonly (RefundTxLike | null | undefined)[] | null | undefined,
  options: CancellationMatchOptions = {},
): Set<string> {
  const out = new Set<string>();
  for (const { debit, credit } of findCancellationPairs(
    transactions,
    options,
  )) {
    out.add(String(debit.id));
    out.add(String(credit.id));
  }
  return out;
}
