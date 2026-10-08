/**
 * Типізована помилка token-ендпоінта Сільпо. Живе в окремому файлі, а не в
 * `oauth.ts`, щоб `tokenStore.ts` міг розрізняти відповіді сервера авторизації
 * без залежності від усього OAuth-модуля (його мокають у тестах сховища).
 */
export class SilpoOAuthHttpError extends Error {
  /** HTTP-статус відповіді token-ендпоінта. */
  readonly status: number;
  /** Поле `error` з JSON-тіла (RFC 6749 § 5.2), якщо тіло розібралось. */
  readonly oauthError: string | null;

  constructor(status: number, oauthError: string | null = null) {
    super(`Silpo OAuth token request failed: HTTP ${status}`);
    this.name = "SilpoOAuthHttpError";
    this.status = status;
    this.oauthError = oauthError;
  }
}

/**
 * Коди `error`, з якими Сільпо остаточно відхиляє refresh-грант: токен
 * спалено/відкликано або client_id більше не діє. Лише для них людині
 * справді треба перепідключитись.
 */
const DEFINITIVE_REFRESH_ERRORS = new Set([
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
]);

/**
 * `true`, коли помилка refresh означає «цей refresh-токен мертвий назавжди»:
 * 400/401 з `invalid_grant`/`invalid_client`, або 400/401 без розбірливого
 * тіла. Мережа, abort, 5xx, 429, збій discovery і довільні винятки — це
 * транзієнтні збої, після яких токен ще може бути живим.
 */
export function isDefinitiveRefreshRejection(err: unknown): boolean {
  if (!(err instanceof SilpoOAuthHttpError)) return false;
  if (err.status !== 400 && err.status !== 401) return false;
  return (
    err.oauthError === null || DEFINITIVE_REFRESH_ERRORS.has(err.oauthError)
  );
}
