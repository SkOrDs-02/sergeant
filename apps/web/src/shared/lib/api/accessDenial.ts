/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * **Причина недоступності як ТИП, а не як рядок.**
 *
 * До цього в репо жили три незалежні мапери помилок, і всі троє
 * повертали `string`: `friendlyApiError` (читає `status`),
 * `apiErrorFormat` (читає `ApiError`), `mapApiErrorToUserCopy` (читає
 * `code`, використовується лише пʼятьма файлами профілю). Наслідок був
 * не косметичний: до рядка неможливо приклеїти ДІЮ, тож кожен
 * call-site вигадував подачу заново, і на один 401 у продукті жило
 * пʼять різних текстів.
 *
 * Тут не четвертий мапер. Тут відповідь на інше питання: не «що
 * написати людині», а «чому їй не можна і що вона може з цим зробити».
 * Текст лишається в `uk.ts`, подача — у компоненті; цей модуль лише
 * класифікує.
 *
 * AI-DANGER: **403 має дві різні природи, і зливати їх не можна.**
 * «Не той план» (фото їжі: `requirePlan(pool,"pro")`, Free має 0 фото
 * за ADR-0068) і «не той акаунт» — різні стани з різними діями.
 * Перетворити всі відмови на пропозицію входу означало б пропонувати
 * вхід тому, хто вже увійшов. Сервер їх РОЗРІЗНЯЄ, і саме тому тут
 * читається `code`, а не лише `status`:
 *
 * | Сервер                                | Причина             |
 * | ------------------------------------- | ------------------- |
 * | `401` + `UNAUTHORIZED`                | `sign-in-required`  |
 * | `402` + `PLAN_REQUIRED` + `requiredPlan` | `plan-required`  |
 * | `429` + `AI_QUOTA` / `AI_QUOTA_PRESET` | `quota-exhausted`  |
 * | `403` без коду плану                  | `wrong-account`     |
 * | `kind: "network"` + `isOffline`       | `offline`           |
 * | `502` / `503` / `504`                 | `provider-down`     |
 */
import { isApiError } from "@shared/api";

/**
 * Чому дія недоступна. `null` із `resolveDenial` означає «це не про
 * доступ» — звичайна помилка, яку показує наявний форматер.
 */
export type AccessDenial =
  | { reason: "sign-in-required" }
  | { reason: "plan-required"; requiredPlan: string }
  | { reason: "quota-exhausted"; limit?: number | undefined; preset: boolean }
  | { reason: "wrong-account" }
  | { reason: "provider-down"; retryAfterMs?: number | undefined }
  | { reason: "offline" };

/** Коди, якими сервер називає «потрібен план». */
const PLAN_CODES = new Set(["PLAN_REQUIRED"]);
/** Коди, якими сервер називає «квоту вичерпано». */
const QUOTA_CODES = new Set(["AI_QUOTA", "AI_QUOTA_PRESET"]);

function bodyOf(err: unknown): Record<string, unknown> | null {
  if (!isApiError(err)) return null;
  const body = err.body;
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : null;
}

function codeOf(err: unknown): string {
  const raw = bodyOf(err)?.["code"];
  return typeof raw === "string" ? raw : "";
}

/**
 * Класифікує помилку як причину недоступності — або віддає `null`, якщо
 * помилка не про доступ.
 *
 * Порядок перевірок не довільний: код сервера сильніший за статус, бо
 * саме він розрізняє дві природи відмови. Статус лишається фолбеком для
 * шляхів, які коду не шлють (`requireSession` віддає 401 без тіла на
 * частині маршрутів).
 */
export function resolveDenial(err: unknown): AccessDenial | null {
  if (!isApiError(err)) return null;

  if (err.kind === "network") {
    return err.isOffline ? { reason: "offline" } : null;
  }
  if (err.kind !== "http") return null;

  const code = codeOf(err);

  if (PLAN_CODES.has(code)) {
    const required = bodyOf(err)?.["requiredPlan"];
    return {
      reason: "plan-required",
      requiredPlan: typeof required === "string" ? required : "pro",
    };
  }

  if (QUOTA_CODES.has(code)) {
    const limit = bodyOf(err)?.["limit"];
    return {
      reason: "quota-exhausted",
      limit: typeof limit === "number" ? limit : undefined,
      preset: code === "AI_QUOTA_PRESET",
    };
  }

  if (err.status === 401) return { reason: "sign-in-required" };
  // 402 без коду — усе одно про оплату: інших причин для цього статусу в
  // продукті немає.
  if (err.status === 402)
    return { reason: "plan-required", requiredPlan: "pro" };
  if (err.status === 403) return { reason: "wrong-account" };
  if (err.status === 502 || err.status === 503 || err.status === 504) {
    return { reason: "provider-down", retryAfterMs: err.retryAfterMs };
  }

  return null;
}

/**
 * Чи є причина такою, що її знімає вхід в акаунт. Потрібно pre-gate-ам:
 * вони питають не «чи є помилка», а «чи пускати анонімного».
 */
export function isSignInFixable(denial: AccessDenial): boolean {
  return denial.reason === "sign-in-required";
}
