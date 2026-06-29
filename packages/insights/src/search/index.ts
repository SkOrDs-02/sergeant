/**
 * Матчінг рядків для глобального пошуку. Колись жив інлайном у
 * `HubSearch.tsx` і зводився до `String.includes`. Тепер:
 *
 *  1) Нормалізуємо (lowercase + NFD + видалення діакритики + заміна
 *     апострофів — щоб "їдальня" знаходилась за "ідальня" / "idalnya"
 *     не претендуємо, але "м'ясо" ↔ "мясо" ↔ "м`ясо" матчиться).
 *  2) Токенуємо запит по пробілах і вимагаємо, щоб кожен токен
 *     з'являвся у title/subtitle як підрядок (AND між токенами).
 *     Це fuzzy-ish без ваги Levenshtein — дешево й стабільно на
 *     десятках тисяч транзакцій.
 *  3) Рахуємо простий skor (prefix match > substring, match у title >
 *     match у subtitle) щоб сортувати результати в межах групи.
 *
 * DOM-free: жодних `localStorage`, `window`, `document`. Обгортки над
 * «нещодавніми запитами» лежать у `apps/web/src/core/hubSearchRecents.ts`.
 */

export function normalize(s: string): string {
  if (!s) return "";
  try {
    return s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2018\u2019\u02bc'`´]/g, "");
  } catch {
    return s.toLowerCase();
  }
}

export function tokenize(q: string): string[] {
  return normalize(q)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export interface Scorable {
  title?: string;
  subtitle?: string;
}

/**
 * Already-normalized counterpart of {@link Scorable}. Pass an item through
 * {@link normalizeScorable} once at the candidate-list build site, then reuse
 * the result across many `scoreMatchNormalized` calls (one per keystroke /
 * rerun). The raw {@link scoreMatch} entry point is kept for backwards
 * compatibility with callers that have only raw items.
 */
export interface NormalizedScorable {
  title: string;
  subtitle: string;
}

export function normalizeScorable(item: Scorable): NormalizedScorable {
  return {
    title: normalize(item.title || ""),
    subtitle: normalize(item.subtitle || ""),
  };
}

/**
 * Fast-path scorer that accepts a pre-normalized item. Callers that build
 * the candidate list once (e.g. on mount / data load) should normalize
 * there with {@link normalizeScorable} and then call this per keystroke
 * instead of going through {@link scoreMatch}.
 */
export function scoreMatchNormalized(
  item: NormalizedScorable,
  tokens: string[],
): number {
  if (tokens.length === 0) return 0;
  const hay = `${item.title} ${item.subtitle}`;

  let score = 0;
  for (const t of tokens) {
    if (!hay.includes(t)) return -1;
    // Prefix у title — топ; просто subtitle — менше.
    if (item.title.startsWith(t)) score += 12;
    else if (item.title.includes(t)) score += 6;
    else if (item.subtitle.includes(t)) score += 2;
    // Бонус за довгий збіг (щоб "хліб" бив над "хлібом" без префіксу).
    score += Math.min(4, t.length);
  }
  return score;
}

/**
 * Повертає score >= 0 якщо збіг, або -1 якщо не збіг. Усі токени
 * запиту мають зустрітися у title/subtitle. Normalize-виклик
 * виконується щоразу — для гарячих сценаріїв з pre-built candidate list
 * використовуй {@link scoreMatchNormalized} з {@link normalizeScorable}.
 */
export function scoreMatch(item: Scorable, tokens: string[]): number {
  return scoreMatchNormalized(normalizeScorable(item), tokens);
}

/** Фільтр + сортування за score. Зберігає стабільний порядок для рівних scores. */
export function scoreAndSort<T extends Scorable>(
  items: T[],
  query: string,
  limit = 10,
): T[] {
  const tokens = tokenize(query);
  if (!tokens.length) return items.slice(0, limit);
  // Normalize кожного item лише раз — інакше O(n) per-keystroke `normalize`
  // викликів при q.length=10 даремно роздуває GC + CPU.
  const normalized = items.map(normalizeScorable);
  const scored: Array<{ item: T; score: number; idx: number }> = [];
  normalized.forEach((base, idx) => {
    const s = scoreMatchNormalized(base, tokens);
    if (s >= 0) scored.push({ item: items[idx] as T, score: s, idx });
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, limit).map((e) => e.item);
}
