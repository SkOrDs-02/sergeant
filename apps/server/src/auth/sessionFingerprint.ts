import { isIP } from "node:net";

/**
 * Privacy-friendly fingerprint helpers for Better Auth sessions.
 *
 * Closes hardening card H3
 * (`docs/security/hardening/H3-session-revoke-and-binding.md`).
 *
 * Goals:
 *  1. **Storage minimisation.** На запис у `session.ipAddress` ми кладемо
 *     не повний IP, а **prefix** (`/24` для IPv4, `/64` для IPv6). Цього
 *     достатньо, щоб виявити, що сесія раптом обслуговує запит з іншого
 *     ASN/мобільного оператора, але не дозволяє корелювати юзера з точним
 *     IP-у access-log-ах БД (зменшує blast-radius у разі експлуатації
 *     SQLi або прямого ексфільтру з replicу).
 *
 *  2. **Drift detection.** На кожному `requireSession*` запиті ми
 *     порівнюємо stored UA + IP-prefix із тими, що приходять з реквесту,
 *     і кидаємо `auth.session.ua_drift` warn-лог при невідповідності.
 *     Це сигнал на cookie/bearer hijack (інша вкладка, інша мережа) і
 *     залогований запис, на який Sentry alert-rule вже може реагувати.
 *
 * Не залежить від Better Auth — pure helpers, тестується ізольовано.
 */

/**
 * Truncate an IP to a privacy-friendly prefix.
 *
 * - IPv4 → `/24` (наприклад, `203.0.113.42` → `203.0.113.0/24`).
 *   24 біти ховають хост у мережі провайдера, але зберігають достатньо
 *   ентропії для drift-detection (сусідня мережа = інший /24).
 *
 * - IPv6 → `/64` (наприклад, `2001:db8::1` → `2001:db8:0:0::/64`).
 *   /64 — стандартна subnet-розмірність у IPv6 (RFC 4291); рівно це
 *   видно як «єдина мережа» з точки зору операторів.
 *
 * - Якщо інпут вже у формі prefix-нотації (містить `/`) — повертаємо
 *   його як є, щоб функція була idempotent (важливо, бо порівнюємо
 *   stored prefix vs. поточний IP, нормалізуючи обидві сторони).
 *
 * - Невалідні значення (порожня строка, не-IP) → `null`. Це означає
 *   "fingerprint недоступний", і `detectFingerprintDrift` тоді не б'є
 *   тривогу — false-positive з невалідних X-Forwarded-For хедерів
 *   нікому не потрібен.
 */
export function ipPrefix(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/")) return trimmed;
  const family = isIP(trimmed);
  if (family === 4) {
    const parts = trimmed.split(".");
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (family === 6) {
    return `${expandIpv6Prefix(trimmed)}/64`;
  }
  return null;
}

/**
 * Expand the leading 4 groups (64 bits) of an IPv6 address.
 *
 * Працює з compressed (`::`) формою: розгортаємо до 8 груп через `::`,
 * беремо перші 4. Не залежимо від зовнішніх IP-бібліотек (єдиний споживач
 * — fingerprint-порівняння).
 */
function expandIpv6Prefix(addr: string): string {
  const [head, tail = ""] = addr.split("::", 2);
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const fillCount = Math.max(0, 8 - headParts.length - tailParts.length);
  const allGroups = [...headParts, ...Array(fillCount).fill("0"), ...tailParts];
  const prefix = allGroups
    .slice(0, 4)
    .map((g) => g || "0")
    .join(":");
  return `${prefix}::`;
}

export interface FingerprintInputs {
  storedUserAgent: string | null | undefined;
  storedIp: string | null | undefined;
  currentUserAgent: string | null | undefined;
  currentIp: string | null | undefined;
}

export interface FingerprintDrift {
  ua: boolean;
  ip: boolean;
  storedIpPrefix: string | null;
  currentIpPrefix: string | null;
}

/**
 * Detect drift between a stored session fingerprint and the current request.
 *
 * Returns `null`, коли:
 *   - stored fingerprint порожній (legacy-сесія до introduction цієї фічі —
 *     порівнювати немає з чим, тривога була б false-positive);
 *   - не виявлено drift у жодній з двох осей.
 *
 * Інакше повертає об'єкт з прапорами `ua` / `ip` та обчисленими prefix-ами
 * для логу (щоб Sentry-event і grep по логах одразу показували, що саме
 * змінилось).
 *
 * Дизайн-вибори:
 *  - "Drift" — це коли обидві сторони задані і не збігаються. Якщо одна
 *    сторона `null` (наприклад, `storedUserAgent === null`), drift НЕ
 *    реєструємо: це сигнал, що при створенні сесії UA не дійшов
 *    (рідкісне, але буває з proxy-агентами), і ми не хочемо викидати юзера.
 *  - Truncation IP робиться обом сторонам — навіть якщо stored вже
 *    prefix, `ipPrefix()` ідемпотентна.
 *  - UA порівнюється посимвольно. Браузерні bumps мінорних версій (123 →
 *    124) дадуть drift, але це і є очікувана поведінка — auto-update міг
 *    статись на тому самому пристрої, тому ми лише warn-лог, а не force
 *    re-auth (rotation політика — окреме рішення на майбутнє).
 */
export function detectFingerprintDrift({
  storedUserAgent,
  storedIp,
  currentUserAgent,
  currentIp,
}: FingerprintInputs): FingerprintDrift | null {
  const storedIpPrefix = ipPrefix(storedIp);
  const currentIpPrefix = ipPrefix(currentIp);

  const haveStoredFingerprint = !!storedUserAgent || !!storedIpPrefix;
  if (!haveStoredFingerprint) return null;

  const uaDrift =
    !!storedUserAgent &&
    !!currentUserAgent &&
    storedUserAgent !== currentUserAgent;

  const ipDrift =
    !!storedIpPrefix && !!currentIpPrefix && storedIpPrefix !== currentIpPrefix;

  if (!uaDrift && !ipDrift) return null;

  return {
    ua: uaDrift,
    ip: ipDrift,
    storedIpPrefix,
    currentIpPrefix,
  };
}
