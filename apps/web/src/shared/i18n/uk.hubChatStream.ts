/** @status Active */

/**
 * Копія стріму першого ходу HubChat (С-1 (а), спека
 * `docs/work/specs/hubchat-first-turn-stream.md`). Окремим файлом, бо `uk.ts`
 * на межі `max-lines` (Hard Rule #18); споживач (`ChatMessage`) імпортує його
 * напряму, як `uk.manualPremium.ts`.
 */
export const hubChatStreamMessages = {
  /** Під текстом відповіді, що обірвалась посеред стріму. */
  interrupted: "Відповідь обірвалась.",
  /** Кнопка повторити те саме питання (рішення founder-а 2026-11-18). */
  retry: "Ще раз",
} as const;
