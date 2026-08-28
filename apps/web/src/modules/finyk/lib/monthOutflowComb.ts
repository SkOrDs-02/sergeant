/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Гребінь місяця — розкладка регулярних списань по днях (анти-слоп P4
 * signature-view, `docs/05-design/design/anti-slop-strategy.md` § П1).
 *
 * AI-CONTEXT: тут немає нових даних. `billingDay` і сума вже є на кожній
 * підписці — список показував їх по одному, а форма місяця (кластер,
 * провал, найбільший удар) губилась, бо порівняти дні між собою можна
 * було лише прочитавши всі рядки й тримаючи їх у голові. Функція нічого
 * не рахує «розумного»: вона просто перестає втрачати те, що вже відомо.
 * Прецедент — `HabitStreakCanvas` для `flexStreak.ts` у Рутині.
 *
 * Чиста й синхронна навмисно: вид має бути тестованим без рендера, а
 * межі місяця — підставлятись, а не братись із годинника (див. ADR-0078:
 * день-ключ особистих сутностей визначає пристрій, тож виклик передає
 * `daysInMonth` сам).
 */

/** Один регулярний платіж на вході. Сума — у гривнях, не в копійках. */
export interface CombEntry {
  id: string;
  name: string;
  /** День місяця списання, як його ввів користувач (може бути 29–31). */
  billingDay: number;
  /** Сума в гривнях. `null` — коли останню транзакцію не знайдено. */
  amount: number | null;
}

export interface CombDay {
  /** 1-based день місяця. */
  day: number;
  /** Сума всіх списань цього дня, у гривнях. */
  total: number;
  /** Назви платежів цього дня — для `title` / aria. */
  names: string[];
}

export interface CombGap {
  /** Перший день провалу (1-based, включно). */
  from: number;
  /** Останній день провалу (1-based, включно). */
  to: number;
  length: number;
}

export interface CombResult {
  days: CombDay[];
  /** Найбільша денна сума — знаменник для висоти стовпчика. */
  max: number;
  /** Сума всіх списань місяця. */
  total: number;
  /** Скільки платежів реально потрапило в гребінь (з відомою сумою). */
  counted: number;
  /**
   * Найдовший відрізок поспіль без жодного списання, або `null`, якщо
   * такого немає чи він закороткий, щоб про нього говорити.
   */
  gap: CombGap | null;
}

/**
 * Провал коротший за це — не факт, а шум: у будь-якому місяці знайдеться
 * пара порожніх днів між платежами, і підписувати їх означало б робити
 * повідомлення з нічого.
 */
export const MIN_GAP_DAYS = 5;

/**
 * Менше платежів — гребінь гірший за список: три риски й багато повітря
 * не показують ні кластера, ні провалу, тобто нічого з того, заради чого
 * вид існує. Той самий клас рішення, що `MIN_N` у крос-модульних
 * звʼязках: вид зʼявляється, коли йому є що сказати.
 */
export const MIN_ENTRIES = 4;

/**
 * Розкладає платежі по днях місяця.
 *
 * `billingDay` затискається у межі місяця, а не відкидається: підписка
 * «31-го» в 30-денному місяці справді списується останнього дня, і
 * викинути її означало б збрехати про суму місяця. Платежі без відомої
 * суми пропускаються — у них немає висоти, і малювати їх нулем означало
 * б показати день, коли «нічого не йде», хоча йде.
 */
export function buildMonthComb(
  entries: readonly CombEntry[],
  daysInMonth: number,
): CombResult {
  const safeDays = Math.max(1, Math.min(31, Math.floor(daysInMonth) || 0));
  const days: CombDay[] = Array.from({ length: safeDays }, (_, i) => ({
    day: i + 1,
    total: 0,
    names: [],
  }));

  let total = 0;
  let counted = 0;

  for (const entry of entries) {
    if (entry.amount == null || !Number.isFinite(entry.amount)) continue;
    if (entry.amount <= 0) continue;
    const raw = Math.floor(entry.billingDay);
    if (!Number.isFinite(raw) || raw < 1) continue;
    const day = Math.min(raw, safeDays);
    const bucket = days[day - 1];
    if (!bucket) continue;
    bucket.total += entry.amount;
    bucket.names.push(entry.name);
    total += entry.amount;
    counted += 1;
  }

  const max = days.reduce((acc, d) => (d.total > acc ? d.total : acc), 0);

  return { days, max, total, counted, gap: findLongestGap(days) };
}

/**
 * Найдовший відрізок днів поспіль із нульовим списанням.
 *
 * AI-CONTEXT: рахується по всьому місяцю, включно з хвостом після
 * останнього платежу — це не помилка. «З 25-го і до кінця нічого не
 * йде» — така сама корисна відповідь на «коли можна дозволити велику
 * покупку», як і провал усередині. Обмежує лише `MIN_GAP_DAYS`.
 */
function findLongestGap(days: readonly CombDay[]): CombGap | null {
  let best: CombGap | null = null;
  let runStart = -1;

  const close = (endExclusive: number) => {
    if (runStart < 0) return;
    const length = endExclusive - runStart;
    if (length >= MIN_GAP_DAYS && (best === null || length > best.length)) {
      best = { from: runStart + 1, to: endExclusive, length };
    }
    runStart = -1;
  };

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    if (day && day.total === 0) {
      if (runStart < 0) runStart = i;
    } else {
      close(i);
    }
  }
  close(days.length);

  return best;
}
