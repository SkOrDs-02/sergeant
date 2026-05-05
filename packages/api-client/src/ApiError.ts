/**
 * Уніфікований клас помилок для всіх запитів через `@shared/api`.
 *
 * `kind` дозволяє викликачам розрізнити транспортну помилку мережі,
 * невдалий HTTP-статус і некоректну (нерозпарсену) відповідь —
 * не парсячи `message` текстово.
 */
export type ApiErrorKind = "http" | "network" | "parse" | "aborted";

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number | undefined;
  body?: unknown;
  bodyText?: string | undefined;
  url: string;
  /** Кореляційний ID відповіді (з `X-Request-Id` або `body.requestId`). */
  requestId?: string | undefined;
  cause?: unknown;
  /**
   * Мілісекунди до найраніше безпечної повторної спроби, коли сервер повернув
   * `429`/`503` разом із заголовком `Retry-After`. Парсимо обидві форми:
   * `<seconds>` → `seconds * 1000`, `<HTTP-date>` → `date - now`.
   * Значення `0` і негативні нормалізуємо у `undefined`, щоб `instanceof`-чек
   * викликача міг робити просте `if (err.retryAfterMs)`.
   */
  retryAfterMs?: number | undefined;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP-статус; `0` для мережевих/парсингових/aborted помилок. */
  readonly status: number;
  /** Розпарсене тіло відповіді (JSON), якщо парсинг вдався. */
  readonly body: unknown;
  /** Сирий текст відповіді, якщо був прочитаний (для HTML-фолбеку тощо). */
  readonly bodyText: string;
  /** URL запиту — зручно логувати без витоку токенів. */
  readonly url: string;
  /** `body?.error`, якщо сервер повернув стандартну форму помилки. */
  readonly serverMessage?: string | undefined;
  /** Кореляційний ID запиту на сервері, якщо доступний. */
  readonly requestId?: string | undefined;
  /** Мс до безпечного retry, якщо upstream віддав `Retry-After`. `undefined`
   *  якщо заголовок не було або він не парситься у додатну величину. */
  readonly retryAfterMs?: number | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : {});
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status ?? 0;
    this.body = init.body;
    this.bodyText = init.bodyText ?? "";
    this.url = init.url;
    const maybeBodyRequestId =
      init.body && typeof init.body === "object"
        ? (init.body as { requestId?: unknown }).requestId
        : undefined;
    this.requestId =
      (typeof init.requestId === "string" && init.requestId.trim()) ||
      (typeof maybeBodyRequestId === "string" && maybeBodyRequestId.trim())
        ? String(init.requestId || maybeBodyRequestId).trim()
        : undefined;
    const maybeServerMessage =
      init.body && typeof init.body === "object"
        ? (init.body as { error?: unknown }).error
        : undefined;
    this.serverMessage =
      typeof maybeServerMessage === "string" ? maybeServerMessage : undefined;
    this.retryAfterMs =
      typeof init.retryAfterMs === "number" && init.retryAfterMs > 0
        ? init.retryAfterMs
        : undefined;
  }

  /** Сервер відповів 401/403 — повторний запит без нових credentials безглуздий. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** Справжня втрата мережі, а не помилка сервера — сигнал для offline-черги. */
  get isOffline(): boolean {
    return (
      this.kind === "network" &&
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    );
  }
}

/** Type-guard для використання у `.catch`/`instanceof`-чеках. */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
