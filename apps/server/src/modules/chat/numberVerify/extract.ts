/**
 * Витяг чисел із вільного тексту (ADR-0097).
 *
 * Один і той самий розбір працює для відповіді моделі й для «поданого»:
 * різні регулярки на двох боках дали б рівно ту розбіжність форматів
 * («1 240» проти «1240»), яку верифікатор має ловити, а не створювати.
 */

import {
  type NumberKind,
  type NumberUnit,
  SCOPE_MIN_VALUE,
  kindOfUnit,
  maskNonQuantities,
  parseNumeral,
  readSuffix,
  toleranceFor,
} from "./normalize.js";

export interface NumberToken {
  /** Початок числа в оригінальному тексті. */
  start: number;
  /** Кінець числа разом із множником і одиницею. */
  end: number;
  /** Значення в базових одиницях (грн, кг, ккал, г); знак відкинуто. */
  value: number;
  /**
   * Друге прочитання двозначного запису (`1.240`). Лишається лише у чисел без
   * одиниці: з одиницею двозначність знімається (див. `resolveAmbiguity`).
   */
  alt: number | null;
  /** Половина останнього значущого розряду, не менше `MIN_TOLERANCE`. */
  tol: number;
  unit: NumberUnit | null;
  /** Число з `%`: у перевірку не входить і операндом не буває. */
  percent: boolean;
  /** `unit` задано і `value >= SCOPE_MIN_VALUE`. */
  scoped: boolean;
}

/** Вид перевіреного числа; `null`, якщо одиниці немає. */
export function tokenKind(token: NumberToken): NumberKind | null {
  return token.unit ? kindOfUnit(token.unit) : null;
}

/**
 * Запис числа, чотири форми підряд (порядок важливий: довші першими):
 *   12 345[,67]      групи пробілом / NBSP / вузьким NBSP / тонким
 *   1.240.000[,5]    групи крапкою, кома десяткова
 *   1,240,000[.5]    групи комою, крапка десяткова
 *   12 | 12,5 | 12.5 просте число
 * Перед числом не може стояти літера, цифра, `_`, крапка чи кома, після нього -
 * цифра: так не вкушується шматок ідентифікатора чи більшого числа.
 */
const NUMERAL_RE =
  /(?<![\p{L}\p{N}_.,])(?:\d{1,3}(?:[ \u00A0\u202F\u2009]\d{3})+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)(?!\p{N})/gu;

/**
 * Двозначне `1.240` з одиницею читається за одиницею: кілограми частіше
 * пишуть із трьома знаками після коми (`1,250 кг`), а гроші й калорії з
 * групою розряду (`1.240 грн`, `1,240 ккал`, `1.500 г`).
 */
function resolveAmbiguity(
  value: number,
  alt: number | null,
  unit: NumberUnit | null,
): { value: number; alt: number | null } {
  if (alt === null || unit === null) return { value, alt };
  return unit === "kg" ? { value: alt, alt: null } : { value, alt: null };
}

/** Чи стоїть перед числом `₴` (валюта-префікс: `₴1 490`). */
function hasCurrencyPrefix(masked: string, start: number): boolean {
  let i = start - 1;
  while (i >= 0 && /[ \u00A0\u202F\u2009]/.test(masked.charAt(i))) i--;
  return i >= 0 && masked.charAt(i) === "₴";
}

/**
 * Усі числа тексту в порядку появи. Ідентифікатори, дати, години, роки й
 * маркер усічення вирізаються до пошуку (`maskNonQuantities`), тож числами не
 * стають.
 *
 * Токен перевірюваний (`scoped`), коли має одиницю (грн/₴, ккал, кг, г) і
 * значення не менше 100. Решта (відсотки, лічильники, малі суми, числа без
 * одиниці) лишається в списку - їх рахує метрика, але не звіряє перевірка.
 */
export function extractNumberTokens(text: string): NumberToken[] {
  const masked = maskNonQuantities(text);
  const tokens: NumberToken[] = [];

  for (const match of masked.matchAll(NUMERAL_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const parsed = parseNumeral(raw);
    if (!parsed) continue;

    const afterNumeral = start + raw.length;
    const suffix = readSuffix(masked.slice(afterNumeral));
    const unit =
      suffix.unit ?? (hasCurrencyPrefix(masked, start) ? "money" : null);

    const multiplied = parsed.value * suffix.multiplier;
    const multipliedAlt =
      parsed.alt === null ? null : parsed.alt * suffix.multiplier;
    const resolved = resolveAmbiguity(multiplied, multipliedAlt, unit);

    tokens.push({
      start,
      end: afterNumeral + suffix.length,
      value: resolved.value,
      alt: resolved.alt,
      tol: toleranceFor(parsed.decimals, suffix.multiplier),
      unit,
      percent: suffix.percent,
      scoped: unit !== null && resolved.value >= SCOPE_MIN_VALUE,
    });
  }
  return tokens;
}
