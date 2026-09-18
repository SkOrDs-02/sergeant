/**
 * Password-strength heuristic для register/reset форм.
 *
 * PR-15 / §C8 з docs/audits/2026-05-06-ux-roast-pr-plan.md.
 *
 * Замінює naive довжина-only ладдер (`< 6 / < 10 / >= 10`), який давав
 * однакову «надійну» оцінку і `aaaaaaaaaa`, і `Aa1!Aa1!Aa1!`. Нова
 * метрика враховує:
 *
 *   - довжину (`len`),
 *   - кількість унікальних символів (`uniqueChars`),
 *   - кількість char-classes (lowercase, uppercase, digit, symbol).
 *
 * `score = len * uniqueChars * (classCount / 4)`.
 *
 * Класовий cap: щоб одно-классові паролі (`aaaaaaaaaa`, `qwertyuiop`)
 * не отримували helper-у через довжину, ми обмежуємо:
 *
 *   - `classCount === 1` → завжди weak (level 0), незалежно від score.
 *   - `classCount === 2` → не вище за medium (level 1).
 *   - `classCount >= 3` → повний ladder за score: `<8` weak, `<30`
 *     medium, `>=30` strong.
 *
 * Це не криптографічний bit-entropy estimator; це product-level
 * heuristic, який без залежностей дає user-у відчутну різницю між
 * `aaaaa` і `Aa1!Aa1!Aa`.
 */

export type PasswordStrengthLevel = 0 | 1 | 2;

export interface PasswordStrength {
  /** Числова оцінка (`Math.round`-ed для зручності тестів). */
  score: number;
  /** 0 = weak, 1 = medium, 2 = strong. */
  level: PasswordStrengthLevel;
  /** Скільки char-classes присутні: 0..4. */
  classCount: number;
  /** Кількість унікальних символів. */
  uniqueChars: number;
  /** Ratio унікальних chars до total chars (0..1). */
  uniqueRatio: number;
}

const LOWERCASE = /[a-zа-яёіїєґ]/;
const UPPERCASE = /[A-ZА-ЯЁІЇЄҐ]/;
const DIGIT = /[0-9]/;
const SYMBOL = /[^A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9\s]/;

function countCharClasses(password: string): number {
  let count = 0;
  if (LOWERCASE.test(password)) count += 1;
  if (UPPERCASE.test(password)) count += 1;
  if (DIGIT.test(password)) count += 1;
  if (SYMBOL.test(password)) count += 1;
  return count;
}

function countUniqueChars(password: string): number {
  if (password.length === 0) return 0;
  const unique = new Set<string>();
  for (const ch of password) unique.add(ch);
  return unique.size;
}

function levelFor(score: number, classCount: number): PasswordStrengthLevel {
  if (classCount <= 1) return 0;
  if (classCount === 2) return score < 30 ? 0 : 1;
  return score < 8 ? 0 : score < 30 ? 1 : 2;
}

/**
 * Оцінити силу пароля. Повертає score, level (0..2) і breakdown
 * для дебага/UI-tooltip-ів.
 */
export function estimatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      level: 0,
      classCount: 0,
      uniqueChars: 0,
      uniqueRatio: 0,
    };
  }
  const len = password.length;
  const uniqueChars = countUniqueChars(password);
  const uniqueRatio = uniqueChars / len;
  const classCount = countCharClasses(password);
  const rawScore = len * uniqueChars * (classCount / 4);
  const score = Math.round(rawScore);
  const level = levelFor(score, classCount);
  return { score, level, classCount, uniqueChars, uniqueRatio };
}
