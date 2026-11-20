/** @status Active */

/**
 * Фінік: чек із фото, на якому не видно підсумку (рішення власника
 * 2026-11-19, спека `docs/work/specs/finyk-receipt-total-not-visible.md`).
 *
 * AI-CONTEXT: окремий файл, бо `uk.finyk.ts` уже за межею `max-lines`.
 * Спредиться в `messages.finyk`; ключ верхнього рівня (`receiptTotal`) не
 * повинен збігатися з ключами `uk.finyk.ts`. Текст `hint` дослівно
 * повторює серверне повідомлення `RECEIPT_TOTAL_REQUIRED`
 * (`apps/server/src/modules/finyk/receipts/save.ts`).
 */
export const finykReceiptTotalMessages = {
  receiptTotal: {
    /** Підказка під полем «Сума» на екрані перевірки чека. */
    hint: "Підсумку на фото не видно, введи суму.",
    /** Пояснення під неактивною кнопкою «Зберегти». */
    saveBlocked: "Введи суму чека, щоб зберегти.",
    /** Бейдж рядка в «Чеки пачкою». */
    batchBadge: "потрібна сума",
  },
} as const;
