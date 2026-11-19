/**
 * Заголовок блоку «записи з попередньої відповіді» у контексті чату (С-2 (а),
 * спека `docs/work/specs/hubchat-find-then-change.md`).
 *
 * AI-CONTEXT: один рядок на трьох сторонах. Веб дописує блок у кінець
 * `context` (`apps/web/src/core/hub/chat/turnRefs.ts`), сервер без згоди на
 * дані про здоровʼя вирізає з нього health-рядки
 * (`apps/server/src/modules/chat/healthGate.ts`), tool-eval відтворює його в
 * кейсах `toolSelectionCases/followUp.ts`. Розійдеться рядок між вебом і
 * сервером — і гейт перестане бачити блок, тому він живе тут.
 */
export const TURN_REFS_HEADING = "[Записи з попередньої відповіді]";
