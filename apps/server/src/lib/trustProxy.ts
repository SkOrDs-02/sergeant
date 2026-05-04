/**
 * Parser для `TRUST_PROXY` env-var-у.
 *
 * Express приймає `app.set("trust proxy", value)` у кількох форматах
 * (https://expressjs.com/en/guide/behind-proxies.html):
 *
 *   - `boolean` — `true` довіряє всім upstream-проксі (НЕБЕЗПЕЧНО);
 *     `false` — не парсить XFF взагалі.
 *   - `number` — кількість hops, які треба зняти з кінця `X-Forwarded-For`.
 *     Це default для Railway (1 — Railway edge proxy).
 *   - `string` — CSV перелік IPv4/IPv6/CIDR/керівних слів (`loopback`,
 *     `linklocal`, `uniquelocal`). Express передає це у proxy-addr.
 *   - `string[]` — те саме що CSV, але вже розпарсене у масив.
 *
 * Цей модуль конвертує сирий env-string у безпечний union, який можна
 * передати у `app.set`. Невалідні значення кидають помилку при boot-у — це
 * **ціль рішення M2**: випадково набрати `TRUST_PROXY=true` на проді = усі
 * `req.ip` стають client-controlled, тому такі значення повинні падати
 * голосно, а не silently прийматися.
 *
 * Закриває action item з `docs/security/hardening/M2-trust-proxy-parameterize.md`.
 */

export type TrustProxyValue = boolean | number | string[] | undefined;

const KEYWORDS = new Set(["loopback", "linklocal", "uniquelocal"]);

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
// Спрощена IPv6 / IPv6-CIDR валідація — навмисно ліберальна, бо
// proxy-addr робить остаточну перевірку. Сюди ми хочемо ловити лише
// випадкові typo (наприклад, `TRUST_PROXY=foo`), не реалізовувати
// повну RFC 4291 / RFC 4632 граматику.
const IPV6_RE = /^[0-9a-f:]+(\/\d{1,3})?$/i;

function isCidrLike(token: string): boolean {
  if (KEYWORDS.has(token)) return true;
  if (IPV4_RE.test(token)) return true;
  if (token.includes(":") && IPV6_RE.test(token)) return true;
  return false;
}

export interface ParseTrustProxyInput {
  /** Сире значення з env (як правило `process.env.TRUST_PROXY`). */
  raw: string | undefined | null;
  /**
   * Default-значення, якщо `raw` порожнє (Railway → 1; Replit → undefined).
   * Передавайте `undefined`, щоб не виставляти `trust proxy` взагалі —
   * `app.ts` пропустить виклик `app.set("trust proxy", …)`.
   */
  fallback: TrustProxyValue;
}

/**
 * Безпечно парсить `TRUST_PROXY` у формат, прийнятний для `app.set`.
 *
 * Помилки:
 *   - `TRUST_PROXY=true` за замовчуванням ВІДХИЛЯЄТЬСЯ — це опція, яка
 *     вмикає сліпу довіру до всіх upstream proxies. Якщо це справді
 *     потрібно (test-only), використай явний CIDR-list.
 *   - Числа поза [0..10] ВІДХИЛЯЮТЬСЯ — ймовірно typo (`100` замість `1.0.0/8`).
 *   - Невалідні CIDR-токени ВІДХИЛЯЮТЬСЯ.
 */
export function parseTrustProxy(input: ParseTrustProxyInput): TrustProxyValue {
  const raw = input.raw?.trim();
  if (raw === undefined || raw === null || raw === "") return input.fallback;

  // Boolean — навмисно вузька політика
  const lower = raw.toLowerCase();
  if (lower === "false") return false;
  if (lower === "true") {
    throw new Error(
      'TRUST_PROXY="true" disabled by policy — it makes every req.ip ' +
        "client-controlled. Use an explicit CIDR list, hop count, or " +
        '"false" instead.',
    );
  }

  // Чисте число — кількість hops
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n < 0 || n > 10) {
      throw new Error(
        `TRUST_PROXY=${raw} out of range — accepted hop counts are 0..10. ` +
          "Higher values almost certainly indicate typo or misconfiguration.",
      );
    }
    return n;
  }

  // CSV CIDR / keyword list
  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return input.fallback;

  for (const t of tokens) {
    if (!isCidrLike(t)) {
      throw new Error(
        `TRUST_PROXY contains invalid token "${t}" — expected an IP, ` +
          "CIDR block, or one of: loopback, linklocal, uniquelocal.",
      );
    }
  }
  return tokens;
}
