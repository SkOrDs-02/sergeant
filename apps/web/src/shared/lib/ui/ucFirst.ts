/**
 * Велика перша літера — і лише вона.
 *
 * AI-CONTEXT: для локалізованих дат (`toLocaleDateString("uk-UA", { month:
 * "long", year: "numeric" })` → «вересень 2026 р.») CSS `text-transform:
 * capitalize` не годиться: він підіймає КОЖНЕ слово, і скорочення «р.»
 * стає «Р.» («Вересень 2026 Р.» — TXT-7, аудит 2026-09). Тому заголовки
 * періодів капіталізуємо в коді, а не стилем.
 */
export function ucFirst(value: string): string {
  if (!value) return value;
  const first = value.codePointAt(0);
  if (first === undefined) return value;
  const head = String.fromCodePoint(first);
  return head.toLocaleUpperCase("uk-UA") + value.slice(head.length);
}
