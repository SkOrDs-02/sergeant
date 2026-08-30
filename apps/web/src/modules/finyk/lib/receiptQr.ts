/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Парсер QR-коду фіскального чека ДПС — чиста функція, без React/мережі.
 *
 * Спека (`docs/90-work/planning/specs/receipt-scan.md` § Флоу v1): QR
 * фіскального чека кодує URL виду
 * `https://cabinet.tax.gov.ua/cashregs/check?id=..&date=..&time=..&fn=..&sm=..`.
 * Клієнт парсить URL і шле пʼять полів у `POST /api/finyk/receipts/lookup`
 * (`ReceiptLookupRequest`) — сервер сам ходить у ДПС `chkAll` за токеном.
 *
 * Поля дзеркалять `dpsQrFieldSchema` (`packages/shared/src/schemas/receipts.ts`):
 * непорожній рядок ≤64 символів з `[\w.-]` — той самий вайтліст тут ЗАРАНІШЕ
 * відсіює QR, що не є чеком ДПС (інший сайт, порожні/сміттєві query-параметри),
 * не чекаючи 400 від сервера.
 *
 * Origin-перевірка ДО читання query (CodeRabbit round 5, PR #818): без неї
 * будь-який URL із пʼятьма полями, що проходять вайтліст, парсився б як
 * «чек» — QR стороннього сайту з випадково-схожими query-параметрами тихо
 * пішов би в `POST /api/finyk/receipts/lookup` замість чесного «не читається,
 * сфотографуй чек». Перевіряємо `https:` + host `cabinet.tax.gov.ua` + path
 * `/cashregs/check` РАНІШЕ, ніж читаємо `searchParams`.
 */
import type { ReceiptLookupRequest } from "@sergeant/api-client";

const DPS_QR_FIELD_PATTERN = /^[\w.-]+$/;
const DPS_QR_FIELD_MAX_LEN = 64;
const DPS_QR_HOST = "cabinet.tax.gov.ua";
const DPS_QR_PATHNAME = "/cashregs/check";

function normalizeField(raw: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > DPS_QR_FIELD_MAX_LEN) return null;
  if (!DPS_QR_FIELD_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Розпарсити сирий текст QR-коду в тіло `POST /api/finyk/receipts/lookup`.
 *
 * Повертає `null`, якщо рядок — не валідний URL, не з очікуваного ДПС-origin
 * (`https://cabinet.tax.gov.ua/cashregs/check`), або хоч одне з полів
 * `fn`/`id`/`date`/`time`/`sm` відсутнє/порожнє/не проходить вайтліст —
 * викликач тоді пропонує фото (спека: «QR нема / не читається»).
 */
export function parseDpsReceiptQrUrl(raw: string): ReceiptLookupRequest | null {
  if (typeof raw !== "string" || !raw.trim()) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== DPS_QR_HOST ||
    url.pathname !== DPS_QR_PATHNAME
  ) {
    return null;
  }

  const fn = normalizeField(url.searchParams.get("fn"));
  const id = normalizeField(url.searchParams.get("id"));
  const date = normalizeField(url.searchParams.get("date"));
  const time = normalizeField(url.searchParams.get("time"));
  const sm = normalizeField(url.searchParams.get("sm"));

  if (!fn || !id || !date || !time || !sm) return null;

  return { fn, id, date, time, sm };
}
