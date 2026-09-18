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
 * QR фіскального чека несе `date=yyyyMMdd` і `time=HHmm` (зрідка `HHmmss`),
 * а chkAll вимагає `date` у форматі `YYYY-MM-DD HH:mm:ss`
 * (`cabinet.tax.gov.ua/help/api-registers.html`; live-проба 2026-08-18:
 * QR-формат дає 400 «Помилка обробки запиту», ISO-формат проходить
 * парсинг запиту). `date` за докою опційний — тому нечитабельний QR-формат
 * дає `null` (параметр опускаємо), а не помилку: пошук за самим `id`+`fn`
 * кращий за гарантований 400.
 */
export function dpsDateParam(date: string, time: string): string | null {
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(date.trim());
  if (!d) return null;
  const t = /^([01]\d|2[0-3])([0-5]\d)([0-5]\d)?$/.exec(time.trim());
  return `${d[1]}-${d[2]}-${d[3]} ${t?.[1] ?? "00"}:${t?.[2] ?? "00"}:${t?.[3] ?? "00"}`;
}

/**
 * Відповідь chkAll — JSON-конверт (`api-registers.html`): XML чека лежить
 * base64-ом у полі `check`. Українські фіскальні XML історично бувають у
 * windows-1251 — декодуємо за `encoding=` з XML-декларації (заголовок
 * читається як latin1, бо сама декларація — чистий ASCII), інакше utf-8.
 * `null` — лише коли байтів нема взагалі; будь-що інше повертаємо як
 * текст і лишаємо вердикт XML-парсеру (`dpsXml.ts`).
 */
function decodeDpsCheckBase64(b64: string): string | null {
  const bytes = Buffer.from(b64.trim(), "base64");
  if (bytes.length === 0) return null;
  const head = bytes.subarray(0, 200).toString("latin1");
  const enc = /encoding=["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase();
  const label =
    enc === "windows-1251" || enc === "cp1251" ? "windows-1251" : "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

const CHECK_TAG_RE = /<CHECK(?:\s[^>]*)?>/i;

/**
 * `GET .../ws/api_public/rro/chkAll` — публічний lookup фіскального чека
 * за полями QR-коду. Переюзає `bankProxyFetch` (timeout/retry-з-jitter/
 * circuit-breaker/in-memory TTL-кеш — той самий transport-шар, що
 * Monobank/PrivatBank) замість заново писати resilience-обвʼязку: ДПС —
 * такий самий "upstream, що іноді 5xx-ить чи лагає", як банківські
 * проксі, різниця лише в baseUrl/path/query.
 *
 * AI-CONTEXT: live-смоук 2026-08-18 (реальний токен founder-а + публічно
 * проіндексований QR реального чека) підтвердив: шлях і токен-у-query —
 * правильні (`api-registers.html`), а от QR-формати `date`/`time` upstream
 * НЕ приймає (звідси `dpsDateParam`), `sm`/`time` як окремі параметри в
 * доці відсутні — прибрані. Відповідь — JSON-конверт з base64-XML у
 * `check`, НЕ сирий XML (сирий XML лишаємо як толерантний fallback).
 * Успішного 200 з тілом чека смоук ще НЕ бачив: реєстр відповідає 400
 * «На період дії воєнного стану обмежено доступ до публічних електронних
 * реєстрів» (з не-UA IP; те саме без токена і з битим токеном — тобто
 * обмеження стоїть ДО перевірки токена). Гілка DPS_ACCESS_RESTRICTED —
 * саме про це; внутрішні теги XML (`dpsXml.ts`) досі неперевірені живим
 * чеком — див. спеку § Ризики.
 */
export async function fetchDpsCheckXml(
  params: DpsLookupParams,
): Promise<DpsLookupResult> {
  const token = env.DPS_API_TOKEN;
  if (!token) return { status: "no_token" };

  const dateParam = dpsDateParam(params.date, params.time);
  const result = await bankProxyFetch({
    upstream: "dps",
    baseUrl: DPS_BASE_URL,
    path: DPS_CHECK_PATH,
    query: {
      id: params.id,
      fn: params.fn,
      ...(dateParam ? { date: dateParam } : {}),
      type: "1",
      token,
    },
    headers: { Accept: "application/json" },
    // AI-NOTE: review finding, MINOR security, ВІДКЛАДЕНО поза цим PR.
    // `token` тут ІДЕ і в `query` (сам upstream-запит вимагає його як
    // query-параметр — підтверджено `api-registers.html`), і в
    // `cacheKeySecret`.
    // `bankProxyFetch` хешує лише `cacheKeySecret` окремим доданком
    // cache-ключа — сам `query` (разом із `token`) серіалізується в
    // `qs` і йде у cache-ключ ВЕРБАТИМ, нехешованим (`lib/bankProxy.ts`
    // `hashForCache(cacheKeySecret)` конкатенується З РАДКОМ `qs`, не
    // ЗАМІСТЬ нього). Токен лишається лише в in-memory `Map` (ніколи не
    // логується/не персистить), тож ризик MINOR, не CRITICAL — але
    // коректний фікс (хешувати серіалізовані query-параметри перед
    // складанням cacheKey) живе у `lib/bankProxy.ts`, спільному
    // transport-шарі з Monobank/PrivatBank — поза поверхнею цього PR
    // (`modules/finyk/receipts/*` + `packages/shared/.../receipts.ts`).
    // Дію не змінює: сам HTTP-запит до ДПС і далі йде через query.
    cacheKeySecret: token,
  });

  if (result.status === 404) return { status: "not_found" };

  if (result.status >= 200 && result.status < 300) {
    const body = result.body.trim();
    if (!body) return { status: "not_found" };

    // Документований шлях: JSON-конверт `{check: base64(XML), xml, sign,
    // resultCode, resultText}`. `check` відсутній/порожній = чека нема
    // (лаг реєстру чи неправильні реквізити) — not_found, хай UI
    // запропонує «зачекай або сфотографуй».
    if (body.startsWith("{")) {
      let envelope: unknown;
      try {
        envelope = JSON.parse(body);
      } catch {
        return { status: "not_found" };
      }
      const check =
        typeof envelope === "object" && envelope !== null
          ? (envelope as Record<string, unknown>)["check"]
          : undefined;
      if (typeof check !== "string" || !check.trim()) {
        return { status: "not_found" };
      }
      const xml = decodeDpsCheckBase64(check);
      if (xml === null) return { status: "not_found" };
      // Декодували, але це не схоже на XML чека — НЕ not_found: чек
      // існує, ми його не розібрали. Віддаємо як є — lookup.ts дасть
      // чесний DPS_PARSE_ERROR (502), а не «чек не знайдено».
      return { status: "ok", xml };
    }

    // Толерантний fallback: якщо колись віддадуть сирий XML (як
    // передбачав первісний код) — приймаємо і його.
    if (CHECK_TAG_RE.test(body)) return { status: "ok", xml: body };
    return { status: "not_found" };
  }

  if (result.status === 400) {
    // ДПС відповідає 400 JSON-ом `{"error","error_description"}` у двох
    // геть різних випадках (live-проба 2026-08-18): «На період дії
    // воєнного стану обмежено доступ до публічних електронних реєстрів»
    // (реєстр закрито для цього джерела — НЕ наша помилка) і «Помилка
    // обробки запиту» (битий запит). Перше — окремий код, щоб
    // алертинг/дешборд бачив «реєстр обмежено», а UX чесно радив
    // vision-шлях. Hard Rule #21 — тіло НЕ логуємо і НЕ кладемо в cause.
    let description = "";
    try {
      const parsed = JSON.parse(result.body) as Record<string, unknown>;
      description =
        typeof parsed["error_description"] === "string"
          ? (parsed["error_description"] as string)
          : "";
    } catch {
      description = "";
    }
    if (/воєнного стану|обмежено доступ/i.test(description)) {
      throw new ExternalServiceError(
        "Реєстр чеків ДПС тимчасово не віддає дані, сфотографуй чек.",
        {
          status: 503,
          code: "DPS_ACCESS_RESTRICTED",
          cause: { message: "dps chkAll: public registers access restricted" },
        },
      );
    }
    throw new ExternalServiceError(
      "Не вдалося знайти чек за QR, сфотографуй чек.",
      {
        status: 502,
        code: "DPS_UPSTREAM_ERROR",
        cause: { message: "dps chkAll upstream returned 400" },
      },
    );
  }

  if (result.status === 401 || result.status === 403) {
    // Токен ПРИСУТНІЙ (інакше ми не дійшли б до мережевого виклику —
    // "no_token" гілка вище, до `bankProxyFetch`), але ДПС його
    // відхилив: не тимчасова недоступність upstream-а (retry тут не
    // допоможе — `bankProxyFetch` і так не ретраїть 4xx,
    // `isRetryableStatus` покриває лише 5xx), а зламаний/протермінований
    // токен. Окремий код — DPS_AUTH_ERROR, не DPS_UPSTREAM_ERROR — щоб
    // алертинг/дешборд міг відрізнити "ДПС лежить" від "у нас невалідний
    // токен" (перше самолікується, друге потребує founder-ської дії).
    // Hard Rule #21 — НЕ логуй body/token тут, той самий контракт, що
    // генеральна 5xx-гілка нижче.
    throw new ExternalServiceError(
      "Пошук чека за QR тимчасово недоступний, спробуй сфотографувати чек.",
      {
        status: 503,
        code: "DPS_AUTH_ERROR",
        cause: { message: `dps chkAll upstream returned ${result.status}` },
      },
    );
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
