/**
 * Operational error hierarchy. Все, що кидається з handler-ів при очікуваних
 * сценаріях (bad input, not found, rate-limit) має бути підкласом `AppError`,
 * тоді `errorHandler` віддасть клієнту стабільний 4xx + `code` і залогує
 * подію на рівні `warn` (не `error`, бо це не баг — це очікувана поведінка).
 *
 * Все інше (undefined is not a function, DB ECONNREFUSED тощо) — це
 * programmer error: 500 + `error` + Sentry.
 */
export interface AppErrorOptions {
  status?: number | undefined;
  code?: string | undefined;
  cause?: unknown;
}

export class AppError extends Error {
  status: number;
  code: string;
  override cause?: unknown;

  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.status = opts.status ?? 500;
    this.code = opts.code ?? "INTERNAL";
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message, { status: 400, code: "VALIDATION", ...opts });
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", opts: AppErrorOptions = {}) {
    super(message, { status: 401, code: "UNAUTHORIZED", ...opts });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden", opts: AppErrorOptions = {}) {
    super(message, { status: 403, code: "FORBIDDEN", ...opts });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Not found", opts: AppErrorOptions = {}) {
    super(message, { status: 404, code: "NOT_FOUND", ...opts });
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string = "Rate limit exceeded",
    opts: AppErrorOptions = {},
  ) {
    super(message, { status: 429, code: "RATE_LIMIT", ...opts });
    this.name = "RateLimitError";
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message, { status: 502, code: "EXTERNAL_SERVICE", ...opts });
    this.name = "ExternalServiceError";
  }
}

export function isOperationalError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Безпечна обгортка над ExternalServiceError для помилок AI-провайдера.
 * Клієнт отримує нейтральне UA-повідомлення — без сирого тексту помилки,
 * requestId чи деталей провайдера. Справжня причина записується в `cause`
 * і потрапляє у лог через `errorHandler → serializeError`.
 *
 * Використовуй замість прямого `new ExternalServiceError(data.error.message, …)`
 * у всіх місцях, де обробляється відповідь Anthropic / OpenRouter.
 */
export function makeAiProviderError(opts: {
  rawProviderMessage: string | undefined | null;
  status: number | undefined;
}): ExternalServiceError {
  const err = new ExternalServiceError(
    "Асистент тимчасово недоступний. Спробуй пізніше.",
    {
      // Use 502 Bad Gateway when the upstream status is absent (undefined) or
      // not a valid HTTP status (0 from network-level glitches).
      status: opts.status && opts.status > 0 ? opts.status : 502,
      code: "ANTHROPIC_ERROR",
      cause: {
        rawProviderMessage: opts.rawProviderMessage ?? "(no message)",
        upstreamStatus: opts.status,
      },
    },
  );
  return err;
}
