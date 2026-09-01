/**
 * Приватний доступ до застосунку: рішення гейта для Vercel-middleware.
 *
 * AI-CONTEXT: адреса `app.sergeant.com.ua` розійшлась публічно (Threads,
 * далі Bing), і за тиждень туди зайшли десятки чужих людей. Захист Vercel
 * покриває лише `*.vercel.app`, а password protection доступний з плану Pro,
 * тож гейт живе в коді. Лендинг і бета — окремі проєкти, їх це не стосується.
 *
 * DOM-free і без залежності від рантайму: приймає рядки, повертає рішення.
 * HTTP-частина (Response, Set-Cookie) лишається у `apps/web/middleware.ts`.
 */

export const ACCESS_COOKIE_NAME = "sergeant_access";
/** Параметр одноразового посилання: `https://app.…/?access=<token>`. */
export const ACCESS_QUERY_PARAM = "access";
/** Рік — щоб встановлена PWA не питала посилання знову після кожного оновлення. */
export const ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type AccessDecision =
  /** Токен не налаштований або вже є валідна кука — пускаємо далі. */
  | { kind: "pass" }
  /** Прийшли за секретним посиланням: ставимо куку й прибираємо параметр з URL. */
  | { kind: "grant"; redirectTo: string }
  /** Ні куки, ні токена — сторінки для цього відвідувача не існує. */
  | { kind: "block" };

/**
 * Порівняння без ранньої зупинки на першій розбіжності. Мережевий джитер
 * і так ховає різницю, але тайминг-безпечне порівняння тут коштує п'ять
 * рядків, а гейт — єдине, що стоїть між чужою людиною і застосунком.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function decideAccess({
  url,
  cookieHeader,
  token,
}: {
  /** Повний URL запиту. */
  url: string;
  /** Сирий заголовок `Cookie` запиту. */
  cookieHeader: string | null;
  /** `APP_ACCESS_TOKEN` з env. Порожній або відсутній = гейт вимкнено. */
  token: string | undefined;
}): AccessDecision {
  // Без токена гейт мовчить. Це навмисно: preview-деплої й локальний dev
  // не мають змінної, і вимкнений гейт краще за випадково замкнений застосунок.
  if (!token) return { kind: "pass" };

  const parsed = new URL(url);
  const fromQuery = parsed.searchParams.get(ACCESS_QUERY_PARAM);
  if (fromQuery && safeEqual(fromQuery, token)) {
    parsed.searchParams.delete(ACCESS_QUERY_PARAM);
    // Секретний токен не має лишатись у рядку адреси, історії й реферерах.
    return { kind: "grant", redirectTo: `${parsed.pathname}${parsed.search}` };
  }

  const fromCookie = readCookie(cookieHeader, ACCESS_COOKIE_NAME);
  if (fromCookie && safeEqual(fromCookie, token)) return { kind: "pass" };

  return { kind: "block" };
}

/** Значення `Set-Cookie` для рішення `grant`. */
export function buildAccessCookie(token: string): string {
  return [
    `${ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${ACCESS_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}
