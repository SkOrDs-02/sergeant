/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Хелпери для тестів проти чисел, розкладених на тири (анти-слоп П4).
 *
 * AI-CONTEXT: `Money` і `Measure` навмисно рендерять число НЕ одним
 * текстовим вузлом — знак, дробова частина й одиниця живуть окремими
 * `<span>`-ами з власним кеглем. Саме це й робить типографіку, але воно
 * ламає `getByText("420 ккал")`: Testing Library шукає текст у межах
 * одного елемента.
 *
 * Правильна реакція — звіряти `textContent` піддерева, а не міняти
 * розмітку під тест.
 *
 * `\s` у JS уже покриває невидимі пробіли, якими користується
 * типографіка (U+202F перед одиницею, U+00A0 між розрядами), тож
 * нормалізація не потребує літералів цих символів у коді — їх би
 * зловив `no-irregular-whitespace` і читались би вони як випадковість.
 */

/** Текст піддерева з нормалізованими пробілами. */
export function flatText(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Матчер для `getByText` / `queryByText`, що читає ЦІЛЕ піддерево.
 *
 * Віддає найглибший елемент зі збігом: інакше збіг спрацював би і на
 * батькові, і на дідові, і Testing Library впала б на «found multiple
 * elements».
 *
 * ```ts
 * expect(screen.getByText(flatMatch("420 ккал"))).toBeInTheDocument();
 * ```
 */
export function flatMatch(
  expected: string | RegExp,
): (content: string, el: Element | null) => boolean {
  const matches = (value: string) =>
    typeof expected === "string" ? value === expected : expected.test(value);

  return (_content, el) => {
    if (el == null || !matches(flatText(el))) return false;
    return !Array.from(el.children).some((child) => matches(flatText(child)));
  };
}
