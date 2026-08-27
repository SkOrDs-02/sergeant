/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Три ступені візуальної впевненості для `CrossModuleLinkCard` — П2
 * анти-слоп плану (`docs/05-design/design/anti-slop-strategy.md` §4/П1,
 * §5 P2) і продуктовий канон «епістемічний стандарт звʼязків»
 * (`docs/01-product/model/product-overview.md` §6): «градація впевненості
 * + право мовчати».
 *
 * AI-CONTEXT: пороги НЕ вигадані для цього файлу — вони одна в одну
 * дорівнюють `MIN_N` / `NOTABLE_R` з `digestCorrelations.ts`, які вже
 * керують show/hide для weekly-digest кореляцій. Три ступені — похідні
 * цих самих чисел плюс `WINDOW_DAYS`, а не окрема шкала:
 *
 *   MIN_N = 5, NOTABLE_R = 0.4, WINDOW_DAYS = 60 (з digestCorrelations.ts)
 *   REPEATING_R = 0.55               — середина між «помітно» і «сильно»
 *   STRONG_R    = 0.7                — межа «сильний» бакета в existing
 *                                        `strength()` (dailySeries.ts),
 *                                        що вже ділить |r| на
 *                                        сильний/помірний/слабкий
 *                                        (0.7 / 0.4 / 0.2)
 *   STABLE_N    = WINDOW_DAYS / 2 = 30 — спільні дні покривають ПОЛОВИНУ
 *                                        всього 60-денного вікна аналізу
 *
 * AI-DANGER: перебудова 2026-08-05 — читай, перш ніж чіпати драбину.
 * Спершу ступінь вела КІЛЬКІСТЬ днів: `n < 10` → 1, `n ≥ 30` → 3. Це було
 * коректно, поки в ряди потрапляли лише дні з реальним записом обох метрик
 * — тоді `n` справді вимірювало доказ КОНКРЕТНОЇ пари й відрізнялось від
 * пари до пари.
 *
 * Після фіксу структурних нулів (`ABSENCE_MEANS` у `dailySeries.ts`) `n`
 * почало означати інше: скільки днів людина користується ДВОМА МОДУЛЯМИ.
 * Воно стало однаковим для всіх пар (на наскрізній перевірці — 59 для
 * кожної), тож умова `n ≥ 30` виконувалась завжди і будь-яка помічена пара
 * одразу отримувала третій ступінь — включно з межовою |r| = 0.41. Драбина
 * схлопнулась: слово впевненості перестало відрізняти сильний доказ від
 * слабкого, а перші два ступені стали недосяжними для будь-кого, хто
 * користується застосунком довше за місяць.
 *
 * Тому тепер ступінь веде СИЛА звʼязку (|r|), а кількість днів лишається
 * тим, чим вона після фіксу нулів і є, — гейтом «чи взагалі є що
 * показувати» (`MIN_N`) плюс однією з ДВОХ умов третього ступеня. «І», не
 * «або»: сильна кореляція на шести днях — ще не «стабільно», і тридцять
 * днів слабкої — теж ні.
 *
 * Ціна рішення, свідома: третій ступінь став рідкісним, бо |r| ≥ 0.7 між
 * різними сферами життя трапляється нечасто. Найвище слово й МАЄ бути
 * рідкісним — інакше воно нічого не варте.
 *
 * Ступінь визначається виключно з `n` (спільні дні, pairwise-complete) і
 * `r` (Pearson) — рівно тих двох чисел, які реально рахує
 * `computePairwiseCorrelations` (`dailySeries.ts`). Жодних додаткових
 * метрик не вигадується.
 *
 * «N тижнів» у копірайті третього ступеня — окремий, явно переданий
 * прояв (`weeks` prop у `CrossModuleLinkCard`), а не похідне від `n`:
 * `n` рахує ДНІ зі спільними даними в обох метриках, а не тижні поспіль
 * із виконаним патерном — це різні статистики, і вгадувати other з `n`
 * означало б порушити «право мовчати» для числа, якого код не рахує.
 * Якщо викликач не передав `weeks`, картка чесно опускає число тижнів
 * замість того, щоб його оцінити.
 */

import { MIN_N, NOTABLE_R, WINDOW_DAYS } from "./digestCorrelations";

export { MIN_N, NOTABLE_R, WINDOW_DAYS };

export const REPEATING_R = 0.55;
export const STRONG_R = 0.7;
export const STABLE_N = Math.round(WINDOW_DAYS / 2);

export type CrossModuleLinkTier = 1 | 2 | 3;

/**
 * Три ступені впевненості + право мовчати (`null`).
 *
 *   null → n < MIN_N АБО |r| < NOTABLE_R — недостатньо даних або звʼязку
 *          не видно; картка не стверджує нічого.
 *   1    → «Поки що збіг» — звʼязок перетнув поріг помітності, але сила
 *          лишається в діапазоні, де випадковий збіг цілком імовірний.
 *   2    → «Повторюється» — сила помітно вища за поріг (|r| ≥ 0.55), але
 *          ще не «сильна».
 *   3    → «Тримається стабільно» — сила справді висока (|r| ≥ 0.7) І
 *          днів набралось на половину вікна (n ≥ 30). Обидві умови, не
 *          одна: див. AI-DANGER угорі файлу.
 */
export function gradeCrossModuleLink(
  observations: number,
  strength: number,
): CrossModuleLinkTier | null {
  if (!Number.isFinite(observations) || !Number.isFinite(strength)) {
    return null;
  }
  const absR = Math.abs(strength);
  if (observations < MIN_N || absR < NOTABLE_R) return null;
  if (absR >= STRONG_R && observations >= STABLE_N) return 3;
  if (absR >= REPEATING_R) return 2;
  return 1;
}

/**
 * Поріг ДНІВ, до якого ще має сенс рухатись доказова смуга, або `null`,
 * якщо більше днів уже нічого не змінять.
 *
 * Після перебудови драбини (AI-DANGER угорі) кількість днів впливає рівно
 * на дві речі: перетин порога мовчання (`MIN_N`) і другу умову третього
 * ступеня (`STABLE_N`). Між ними й після них ступінь рухає лише сила, тож
 * малювати «ще не набрані» позначки було б обіцянкою, якої код не виконує:
 * людина добирала б дні й не бачила жодного руху.
 */
export function nextDaysThreshold(observations: number): number | null {
  if (!Number.isFinite(observations)) return null;
  if (observations < MIN_N) return MIN_N;
  if (observations < STABLE_N) return STABLE_N;
  return null;
}

/**
 * Слова ступенів (рішення власника 2026-08-05).
 *
 * «Поки що збіг» замість колишнього «Схоже на закономірність» — не
 * помʼякшення, а точність: на `MIN_N` спільних днів кореляція `NOTABLE_R`
 * трапляється на випадкових даних приблизно в половині випадків. Перший
 * ступінь мусить прямо казати «не роби з цього висновків», і він змикається
 * з підписом секції «Збіг — ще не причина».
 *
 * Третій ступінь — «Тримається стабільно», а не «Стабільно повторюється»:
 * від другого він тепер відрізняється словом, а не прислівником.
 */
const TIER_WORDS: Record<CrossModuleLinkTier, string> = {
  1: "Поки що збіг",
  2: "Повторюється",
  3: "Тримається стабільно",
};

export function tierWord(tier: CrossModuleLinkTier): string {
  return TIER_WORDS[tier];
}

// ─── UA-плюралізація (style-guide.uk.md §8 — Intl.PluralRules, не if/else) ──

const pluralRulesUk = new Intl.PluralRules("uk-UA");

function pluralUk(
  n: number,
  forms: { one: string; few: string; many: string; other: string },
): string {
  const category = pluralRulesUk.select(Math.trunc(Math.abs(n)));
  return forms[category as "one" | "few" | "many" | "other"] ?? forms.many;
}

export function formatWeeksUk(n: number): string {
  // `Math.floor`, не `Math.round`: тут рахуються ПОВНІ тижні, які звʼязок уже
  // протримався, тож 1.5 тижня — це «1 тиждень», а не «2 тижні». Округлення
  // вгору дописувало б людині тиждень спостережень, якого не було, — рівно та
  // вигадана цифра, яку цей файл забороняє (див. AI-CONTEXT вище).
  // `Math.max(0, …)`, не `Math.max(1, …)`: виміряний нуль лишається нулем.
  // Нуль тижнів узагалі не доходить до UI — `tierMeta` опускає сегмент, — але
  // сама функція теж не має брехати, бо експортована.
  const v = Math.max(0, Math.floor(n));
  return `${v} ${pluralUk(v, { one: "тиждень", few: "тижні", many: "тижнів", other: "тижня" })}`;
}

/** Лише словоформа («спостереження» / «спостережень») — без числа попереду. */
export function observationsWordUk(n: number): string {
  return pluralUk(n, {
    one: "спостереження",
    few: "спостереження",
    many: "спостережень",
    other: "спостереження",
  });
}

export function formatObservationsUk(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `${v} ${observationsWordUk(v)}`;
}

/**
 * Мета-рядок під головним словом ступеня. `weeks` — опційний і НЕ
 * оцінюється з `observations` (див. AI-CONTEXT вище) — якщо викликач його
 * не передав, рядок чесно обмежується кількістю спостережень.
 */
export function tierMeta(
  tier: CrossModuleLinkTier,
  observations: number,
  weeks?: number,
): string {
  const obs = formatObservationsUk(observations);
  // Менше одного повного тижня — не привід писати «1 тиждень»: рядок чесно
  // обмежується спостереженнями, як і за відсутнього `weeks`. Поріг — сирий
  // `weeks < 1`, а не округлений: 0.6 тижня це ще не тиждень.
  if (weeks === undefined || !Number.isFinite(weeks) || weeks < 1) {
    return obs;
  }
  const weeksLabel = formatWeeksUk(weeks);
  return tier === 3
    ? `${weeksLabel} поспіль · ${obs}`
    : `${weeksLabel} · ${obs}`;
}
