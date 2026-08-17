import { bankProxyFetch } from "../../../lib/bankProxy.js";
import { ExternalServiceError } from "../../../obs/errors.js";
import { env } from "../../../env.js";

const DPS_BASE_URL = "https://cabinet.tax.gov.ua";
const DPS_CHECK_PATH = "/ws/api_public/rro/chkAll";

export interface DpsLookupParams {
  fn: string;
  id: string;
  date: string;
  time: string;
  sm: string;
}

export type DpsLookupResult =
  | { status: "ok"; xml: string }
  | { status: "not_found" }
  | { status: "no_token" };

/**
 * `GET .../ws/api_public/rro/chkAll` — публічний lookup фіскального чека
 * за полями QR-коду. Переюзає `bankProxyFetch` (timeout/retry-з-jitter/
 * circuit-breaker/in-memory TTL-кеш — той самий transport-шар, що
 * Monobank/PrivatBank) замість заново писати resilience-обв'язку: ДПС —
 * такий самий "upstream, що іноді 5xx-ить чи лагає", як банківські
 * проксі, різниця лише в baseUrl/path/query.
 *
 * AI-DANGER: ВІДКРИТИЙ ГЕЙТ СПЕКИ (`receipt-scan.md` § Ризики) — токена
 * founder-а ще нема, тож жоден рядок нижче не бачив живої відповіді.
 * Query-параметри до upstream (`id`, `fn`, `date`, `type=1`) — буквально
 * за архітектурною діаграмою спеки (§ Флоу v1); `time`/`sm` додані
 * захисно понад той список (реальний API міг вимагати їх для
 * дізамбігуації — зайві query-параметри REST-ендпоінти зазвичай
 * ігнорують, тож це безпечніше за їх пропустити). Транспорт токена —
 * query-параметр `token` (найпоширеніший патерн для публічних
 * read-only lookup-API цього типу; `bankProxyFetch`-колери в цьому репо
 * (`modules/mono/privat.ts`) передають токен через HEADER — якщо
 * smoke-тест покаже, що ДПС теж очікує header, це одна зміна тут, не
 * рефактор виклику).
 */
export async function fetchDpsCheckXml(
  params: DpsLookupParams,
): Promise<DpsLookupResult> {
  const token = env.DPS_API_TOKEN;
  if (!token) return { status: "no_token" };

  const result = await bankProxyFetch({
    upstream: "dps",
    baseUrl: DPS_BASE_URL,
    path: DPS_CHECK_PATH,
    query: {
      id: params.id,
      fn: params.fn,
      date: params.date,
      time: params.time,
      sm: params.sm,
      type: "1",
      token,
    },
    headers: { Accept: "application/xml" },
    // Токен — секретна частина cache-ключа (bankProxyFetch хешує
    // cacheKeySecret, ніколи не кладе його у відкритому вигляді в ключ).
    cacheKeySecret: token,
  });

  if (result.status === 404) return { status: "not_found" };

  if (result.status >= 200 && result.status < 300) {
    const body = result.body.trim();
    // Порожня відповідь / документ без <CHECK> — найімовірніше чек ще не
    // з'явився в реєстрі ДПС (лаг появи, спека § Флоу v1), а не помилка.
    if (!body || !/<CHECK(?:\s[^>]*)?>/i.test(body)) {
      return { status: "not_found" };
    }
    return { status: "ok", xml: body };
  }

  // Hard Rule #21 — НЕ логуй body тут: може містити адресу магазину/ПІБ.
  // `bankProxyFetch` сам логує лише status/код на мережевих помилках.
  throw new ExternalServiceError(
    "Сервіс ДПС тимчасово недоступний. Спробуй пізніше або сфотографуй чек.",
    {
      status: 502,
      code: "DPS_UPSTREAM_ERROR",
      cause: { message: `dps chkAll upstream returned ${result.status}` },
    },
  );
}
