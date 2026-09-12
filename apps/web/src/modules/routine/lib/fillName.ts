/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Підстановка назви звички у `{name}`-шаблони каталогу `routinePageMessages` (`@shared/i18n/uk.routine`).
 *
 * `MessageCatalog` дозволяє лише рядки й вкладені мапи рядків, тож копія з
 * інтерполяцією зберігається як шаблон, а склеюється на місці виклику —
 * той самий патерн, що `ageLabel` / `ageYearsSuffix` у `uk.ts`.
 */
export function fillName(template: string, name: string): string {
  return template.replace("{name}", name);
}
