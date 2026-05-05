/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Перевести існуючих consumer-ів (`shared/components/ui/InputDialog.tsx`,
 *           `core/{auth,profile,pricing}/*`, `modules/{finyk,fizruk,routine}/...`)
 *           з deep import `@shared/forms/useApiForm` на цей barrel
 *           (`import { useApiForm } from "@shared/forms"`). Як тільки всі
 *           call-site-и переїдуть — зняти цей маркер. Див. AGENTS.md → Hard Rule #10.
 *
 * Form-engine barrel — єдиний `import` шлях для уніфікованого form-API.
 *
 * Закриває §3.1 з docs/diagnostics/2026-05-03-web-deep-dive: від тепер
 * всі нові форми мають використовувати `useApiForm`. Існуючі форми
 * (auth, finyk transactions, fizruk template editor, nutrition food add,
 * routine task create) мігруються в окремих PR-ах.
 */
export {
  useApiForm,
  type UseApiFormOptions,
  type UseApiFormReturn,
  type ServerFieldError,
} from "./useApiForm";
