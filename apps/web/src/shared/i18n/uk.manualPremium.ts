/** @status Active */

/**
 * Копія ручного Premium за запитом (спека
 * `docs/work/specs/manual-premium-request.md`). Окремим файлом, а не в
 * `uk.ts`: той уже на межі `max-lines: 600` (Hard Rule #18). Споживачі
 * (`PaywallModal`, `ManualPremiumNotice`) імпортують цей файл напряму:
 * група `paywallModal` у `en.ts` не дзеркалиться, тож локаль-резолвер тут
 * нічого не міняє.
 */

/**
 * Пейвол: до запуску оплати головна дія – попросити доступ, «Дивитися
 * плани» стає другорядною.
 */
export const paywallManualAccessMessages = {
  requestCta: "Попросити доступ",
  requestBusy: "Надсилаю запит…",
  requestSent: "Запит надіслано",
  requestFailed: "Не вдалося надіслати запит. Спробуй ще раз.",
} as const;

/** Рядок на хабі (`ManualPremiumNotice`). `{date}`: кінець доступу за Києвом. */
export const manualPremiumNoticeMessages = {
  granted: "Premium відкрито до {date}",
  warning: "Premium діє до {date}",
  dismiss: "Закрити",
} as const;
