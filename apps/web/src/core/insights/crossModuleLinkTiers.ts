/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Три ступені візуальної впевненості для `CrossModuleLinkCard` — П2
 * анти-слоп плану (`docs/05-design/design/anti-slop-strategy.md` §4/П1,
 * §5 P2) і продуктовий канон «епістемічний стандарт зв'язків»
 * (`docs/01-product/model/product-overview.md` §6): «градація впевненості
 * + право мовчати».
 *
 * AI-CONTEXT: пороги НЕ вигадані для цього файлу — вони одна в одну
 * дорівнюють `MIN_N` / `NOTABLE_R` з `digestCorrelations.ts`, які вже
 * керують show/hide для weekly-digest кореляцій. Три ступені — похідні
 * цих самих чисел плюс `WINDOW_DAYS`, а не окрема шкала:
 *
 *   MIN_N = 5, NOTABLE_R = 0.4, WINDOW_DAYS = 60 (з digestCorrelations.ts)
 *   REPEATING_N = MIN_N * 2   = 10   — побачено вдвічі більше за поріг мовчання
 *   STABLE_N    = WINDOW_DAYS / 2 = 30 — спільні дні покривають ПОЛОВИНУ
 *                                        всього 60-денного вікна аналізу
 *   STRONG_R    = 0.7                — межа «сильний» бакета в existing
 *                                        `strength()` (dailySeries.ts),
 *                                        що вже ділить |r| на
 *                                        сильний/помірний/слабкий
 *                                        (0.7 / 0.4 / 0.2)
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

export const REPEATING_N = MIN_N * 2;
export const STABLE_N = Math.round(WINDOW_DAYS / 2);
export const STRONG_R = 0.7;

export type CrossModuleLinkTier = 1 | 2 | 3;

/**
 * Три ступені впевненості + право мовчати (`null`).
 *
 *   null → n < MIN_N АБО |r| < NOTABLE_R — недостатньо даних або зв'язку
 *          не видно; картка не стверджує нічого.
 *   1    → «Схоже на закономірність» — щойно перетнули поріг мовчання.
 *   2    → «Повторюється» — вдвічі більше спостережень за поріг, але ще
 *          не покрили половину вікна аналізу й |r| не «сильний».
 *   3    → «Стабільно повторюється» — або спостереження покривають
 *          половину 60-денного вікна, або кореляція сама по собі сильна
 *          (|r| ≥ 0.7).
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
  if (observations < REPEATING_N) return 1;
  if (observations >= STABLE_N || absR >= STRONG_R) return 3;
  return 2;
}

/** Наступний поріг спостережень, до якого рухається доказова смуга. */
export function nextTierThreshold(tier: CrossModuleLinkTier): number | null {
  if (tier === 1) return REPEATING_N;
  if (tier === 2) return STABLE_N;
  return null;
}

/**
 * Слова ступенів (рішення власника 2026-08-05).
 *
 * «Поки що збіг» замість колишнього «Схоже на закономірність» — не
 * пом'якшення, а точність: на `MIN_N` спільних днів кореляція `NOTABLE_R`
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
  // `Math.max(0, …)`, не `Math.max(1, …)`: округлення вгору перетворювало
  // виміряний нуль на твердження «1 тиждень» — рівно та вигадана цифра, яку
  // цей файл забороняє (див. AI-CONTEXT вище). Нуль тижнів узагалі не
  // доходить до UI — `tierMeta` опускає сегмент, — але сама функція теж не
  // має брехати, бо експортована.
  const v = Math.max(0, Math.round(n));
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
  // обмежується спостереженнями, як і за відсутнього `weeks`.
  if (weeks === undefined || !Number.isFinite(weeks) || Math.round(weeks) < 1) {
    return obs;
  }
  const weeksLabel = formatWeeksUk(weeks);
  return tier === 3
    ? `${weeksLabel} поспіль · ${obs}`
    : `${weeksLabel} · ${obs}`;
}
