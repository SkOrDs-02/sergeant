/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Повертає фокус у поле форми після невдалого сабміту, якщо він його втратив.
 *
 * Чому це потрібно: на час сабміту кнопка «Увійти»/«Зареєструватися» стає
 * `disabled` (`loading`), і браузер скидає з неї фокус на `<body>` (аудит
 * 2026-10-01, ux-08, WCAG 2.4.3). Поля форми для цього лишаються `readOnly`,
 * а не `disabled`, тож фокус на них переживає сабміт, а цей хелпер дістає
 * його лише з кнопки.
 *
 * Фокус, який людина свідомо перевела на інший елемент (наприклад,
 * «Забули пароль?»), не чіпаємо: переносимо лише з `<body>`, з порожнього
 * `activeElement` і з вимкненого елемента.
 */
export function restoreFocusIfLost(focus: () => void): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (!active || active === document.body || active.hasAttribute("disabled")) {
    focus();
  }
}
