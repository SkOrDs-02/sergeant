import { isOperationalError } from "../obs/errors.js";

/**
 * Єдина класифікація помилки, що долетіла до кінця Express-ланцюжка (sec-39).
 *
 * Нею користуються ДВА місця, і вони мусять бачити помилку однаково:
 *  - `errorHandler` (статус, `code`, текст для клієнта, `Retry-After`);
 *  - `shouldHandleError` у `Sentry.setupExpressErrorHandler` (`sentry.ts`),
 *    який стоїть ПЕРЕД `errorHandler`. Його дефолт рахує будь-яку помилку
 *    без `.status` як 500, тож без спільного класифікатора pg-помилка вводу
 *    давала клієнту 400, а в Sentry все одно летіла подія.
 *
 * Правила:
 *  - `AppError` (operational) → свій `status`/`code`/текст.
 *  - Бібліотечна помилка з явним 4xx (body-parser) → свій текст, `VALIDATION`.
 *  - pg SQLSTATE без `.status`: клас 22 → 400 `VALIDATION`, клас 23 → 409
 *    `CONFLICT`, 40P01/40001 → 503 `UNAVAILABLE` + `Retry-After`. Клас 22 і
 *    транзієнтні — без Sentry. Клас 23 — подія рівня `warning` (див.
 *    `reportWarning`): FK/unique/check, що долетіли сюди, найчастіше наш
 *    власний баг (гонка, неперевірене посилання), а не помилка клієнта.
 *  - Решта non-operational (включно з невловленим `ZodError`: схеми відповіді,
 *    Hard Rule #3, це дрейф контракту, а не помилка клієнта) → 500
 *    `INTERNAL`, generic текст, подія в Sentry. Сирий `e.code` (SQLSTATE,
 *    `ECONNREFUSED`) клієнту НЕ віддаємо, лише в логи.
 *
 * ZodError від ВВОДУ мапиться на 400 не тут, а на межі запиту: `parseBody` /
 * `parseQuery` (`http/validate.ts`) кидають operational `ValidationError`.
 */
export interface ErrorClassification {
  status: number;
  code: string;
  operational: boolean;
  /** Текст для клієнта (`error` і `message` у тілі відповіді). */
  message: string;
  /** Секунди для заголовка `Retry-After`, якщо помилка транзієнтна. */
  retryAfterSec?: number;
  /**
   * Чи це баг, вартий Sentry-події: ефективний статус ≥ 500 і помилка не з
   * тих, що ми свідомо змапили (pg 22/23/транзієнтні). Саме це поле читає
   * `shouldHandleError` Sentry-хендлера.
   */
  report: boolean;
  /**
   * Подія рівня `warning` при 4xx для клієнта — лише pg клас 23. Її шле
   * `errorHandler` сам, а НЕ Sentry-хендлер: той не вміє задати рівень і
   * завів би `error`. Тому `report` тут `false`, і подія рівно одна.
   */
  reportWarning: boolean;
  /** SQLSTATE змапленої pg-помилки — для тегу події, не для клієнта. */
  sqlState?: string;
}

export const GENERIC_SERVER_MESSAGE = "Server error";
const INPUT_MESSAGE =
  "Некоректні дані запиту. Перевір введене і спробуй ще раз.";
const CONFLICT_MESSAGE =
  "Не вдалось зберегти: дані змінились. Онови сторінку і спробуй ще раз.";
const UNAVAILABLE_MESSAGE = "Сервер тимчасово не відповідає. Спробуй ще раз.";
const TRANSIENT_RETRY_AFTER_SEC = 2;

type ErrorLike = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  cause?: unknown;
};

/**
 * SQLSTATE з pg-помилки або з її `cause` (обгортки на кшталт drizzle кладуть
 * pg-помилку в `cause`). Повертає лише коди, які мапимо: класи 22 і 23 та два
 * транзієнтні. Регулярка починається з цифри, тож `EPIPE` чи `ECONNREFUSED`
 * сюди не потраплять.
 */
function mappedSqlState(err: unknown): string | undefined {
  const candidates = [err, (err as ErrorLike | null | undefined)?.cause];
  for (const cand of candidates) {
    const code = (cand as ErrorLike | null | undefined)?.code;
    if (typeof code !== "string") continue;
    if (/^2[23][0-9A-Z]{3}$/.test(code)) return code;
    if (code === "40P01" || code === "40001") return code;
  }
  return undefined;
}

export function classifyError(err: unknown): ErrorClassification {
  const operational = isOperationalError(err);
  const e = (err && typeof err === "object" ? err : {}) as ErrorLike;
  const explicitStatus = Number(e.status) || 0;
  const ownCode = typeof e.code === "string" && e.code ? e.code : undefined;
  const ownMessage = typeof e.message === "string" ? e.message : "";

  if (operational) {
    const status = explicitStatus || 400;
    return {
      status,
      code: ownCode ?? (status === 429 ? "RATE_LIMIT" : "BAD_REQUEST"),
      operational,
      message: ownMessage,
      report: status >= 500,
      reportWarning: false,
    };
  }

  // Non-operational з явним 4xx — клієнтська помилка з бібліотеки
  // (body-parser: malformed JSON → 400, payload too large → 413,
  // unsupported media → 415), не баг.
  if (explicitStatus >= 400 && explicitStatus < 500) {
    return {
      status: explicitStatus,
      code: ownCode ?? (explicitStatus === 429 ? "RATE_LIMIT" : "VALIDATION"),
      operational,
      message: ownMessage,
      report: false,
      reportWarning: false,
    };
  }

  if (!explicitStatus) {
    const sqlState = mappedSqlState(err);
    if (sqlState?.startsWith("22")) {
      return {
        status: 400,
        code: "VALIDATION",
        operational,
        message: INPUT_MESSAGE,
        report: false,
        reportWarning: false,
        sqlState,
      };
    }
    if (sqlState?.startsWith("23")) {
      return {
        status: 409,
        code: "CONFLICT",
        operational,
        message: CONFLICT_MESSAGE,
        report: false,
        reportWarning: true,
        sqlState,
      };
    }
    if (sqlState) {
      return {
        status: 503,
        code: "UNAVAILABLE",
        operational,
        message: UNAVAILABLE_MESSAGE,
        retryAfterSec: TRANSIENT_RETRY_AFTER_SEC,
        report: false,
        reportWarning: false,
        sqlState,
      };
    }
  }

  const status = explicitStatus || 500;
  return {
    status,
    code: "INTERNAL",
    operational,
    message: GENERIC_SERVER_MESSAGE,
    report: status >= 500,
    reportWarning: false,
  };
}

/**
 * `shouldHandleError` для `Sentry.setupExpressErrorHandler`: та сама відповідь,
 * що й у `errorHandler`, щоб змаплені на 4xx/503 помилки не ставали подіями
 * рівня `error` (клас 23 `errorHandler` шле сам, рівнем `warning`).
 */
export function shouldReportToSentry(err: unknown): boolean {
  return classifyError(err).report;
}
