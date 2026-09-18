/**
 * Last validated: 2026-06-15
 * Status: Active
 * Легасі-реекспорт macros-утиліт з `@sergeant/shared`. Цей файл залишено,
 * щоб існуючі сусідські імпорти `./macros.js` у `nutrition/lib/*` не
 * довелось переписувати всі одразу.
 *
 * Для нового коду: `import { Macros } from "@sergeant/shared";`
 */
export {
  normalizeMacrosNullable,
  macrosToTotals,
  macrosHasAnyValue,
} from "@sergeant/shared";
export type { Macros, NullableMacros } from "@sergeant/shared";
