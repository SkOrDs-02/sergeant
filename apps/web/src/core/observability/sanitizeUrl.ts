/**
 * Стрипає чутливі query-params з URL перед відправкою у PostHog як
 * `$current_url`. Без цього magic-link токени (`?token=…`), OAuth-коди
 * (`?code=…`, `?state=…`), refresh-токени і т.п. осідали б у event-props
 * і в дашбордах PostHog — це technically PII / auth material, доступний
 * будь-кому з read-правами на project.
 *
 * Ключі матчаться case-insensitive і з підтримкою звичайних варіантів
 * (`access_token`, `accessToken`, `apikey`, `api_key` — усі стрипаються
 * однаково).
 *
 * Hash (`#…`) не чіпаємо — у Sergeant ми не тримаємо там авторизаційних
 * артефактів, а пейджвю по анкор-секціях все ж корисно бачити у funnels.
 *
 * Невалідний URL повертаємо як є (без `throw`), щоб телеметрія ніколи
 * не валила роутинг.
 */

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "code",
  "state",
  "magic",
  "auth",
  "password",
  "secret",
  "api_key",
  "apikey",
]);

const REDACTED = "[redacted]";

export function sanitizeUrl(href: string): string {
  if (!href || typeof href !== "string") return href;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }

  let mutated = false;
  const params = url.searchParams;
  // Збираємо ключі до replace, щоб не мутувати колекцію під час ітерації.
  const keysToRedact: string[] = [];
  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      keysToRedact.push(key);
    }
  }
  for (const key of keysToRedact) {
    // `set` переписує всі значення ключа однією парою — саме те що треба:
    // дублікати типу `?token=a&token=b` обидва стають `[redacted]`.
    params.set(key, REDACTED);
    mutated = true;
  }

  if (!mutated) return href;
  return url.toString();
}
