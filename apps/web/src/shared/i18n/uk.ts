/**
 * Український message-каталог для apps/web.
 *
 * **Це не runtime-i18n.** Це plain-constants-каталог, який зведено в одне
 * місце, щоб (1) мати точку правди для всіх UA-strings, (2) полегшити
 * майбутню міграцію на runtime-i18n коли (й якщо) проєкт почне приймати
 * англомовних юзерів.
 *
 * **Як додавати нові ключі.** Сортуй за поверхнею (`auth`, `sync`,
 * `validation`, `forms`, `empty`, …). Якщо новий ключ — це reused-string
 * з кількох місць, обов'язково веди його сюди. Якщо ключ використовується
 * лише в одному компоненті — також ОК тримати тут (homogenізує підхід).
 *
 * **Що не входить.** Лонг-формальні повідомлення/маркетинг-копії — у
 * `docs/copy/`. Помилки серверного API, що повертаються як `error.message` —
 * перекладаємо у `translateApiError` / `translateAuthError` (fallback на цей
 * каталог).
 *
 * Roadmap: див. `docs/i18n/readiness.md` § «Покрокова міграція».
 */

export const messages = {
  auth: {
    // Generic fallback — використовується, коли не вдалося визначити
    // конкретну причину помилки.
    genericFailure: "Не вдалося завершити вхід. Спробуй ще раз.",

    // Better Auth canonical error-codes:
    invalidEmailOrPassword: "Невірний email або пароль.",
    userAlreadyExists: "Цей email вже зареєстровано. Спробуй увійти.",
    invalidEmail: "Невірний формат email.",
    invalidPassword: "Невірний пароль.",
    passwordTooShort: "Пароль занадто короткий.",
    passwordTooLong: "Пароль занадто довгий.",
    emailNotVerified: "Email ще не підтверджено. Перевір пошту.",
    providerNotFound: "Цей провайдер входу не налаштовано.",
    sessionFailure: "Не вдалося завершити вхід. Спробуй ще раз.",

    // Серверні errors (rate-limiter, error handler):
    rateLimited: "Забагато спроб. Зачекай хвилину і спробуй ще раз.",
    serverDown: "Сервер тимчасово недоступний. Спробуй пізніше.",
  },

  sync: {
    // Заглушки — наступні round-и переносять реальні sync-strings із
    // `apps/web/src/core/cloudSync/*` сюди.
    conflictResolved: "Конфлікт автоматично вирішено.",
    pushFailed: "Не вдалося синхронізувати. Спробуємо ще раз.",
    offlineQueueRecovered: "Відновлено з офлайн-черги.",
  },

  validation: {
    // Заглушки — наступні round-и переносять реальні validation-strings
    // (zod-схеми) сюди.
    emailRequired: "Email обовʼязковий.",
    emailInvalid: "Некоректна email-адреса.",
    passwordRequired: "Пароль обовʼязковий.",
    passwordTooShort: "Пароль має містити щонайменше 8 символів.",
    fieldRequired: "Поле обовʼязкове.",
  },
} as const satisfies MessageCatalog;

/**
 * Тип-структура каталогу повідомлень. Рекурсивний, щоб можна було вкладати
 * групи. Літерали зберігаються через `as const`-присвоєння вище — лінтер
 * запропонує auto-complete для `messages.auth.invalidEmail` etc.
 */
export interface MessageCatalog {
  readonly [key: string]: string | MessageCatalog;
}
