import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../../../db.js";
import { parseBody } from "../../../http/validate.js";
import {
  ReceiptSaveRequestSchema,
  ReceiptSaveResponseSchema,
} from "../../../http/schemas.js";
import type { ReceiptDraftItem } from "../../../http/schemas.js";
import { matchReceiptToMono } from "./matcher.js";
import { serializeReceipt } from "./serialize.js";
import type {
  ReceiptItemRow,
  ReceiptLinkRow,
  ReceiptRow,
} from "./serialize.js";
import { kyivDateString } from "./kyivClock.js";

type WithSessionUser = Request & { user?: { id: string } };

/**
 * Міграція 121: `store_name TEXT NOT NULL` БЕЗ дефолту — джерело могло не
 * розпізнати назву магазину; підстановка відбувається тут, ПЕРЕД INSERT
 * (буквально коментар міграції), а не мовчки на рівні DB-дефолту.
 */
const FALLBACK_STORE_NAME = "Невідомий магазин";

// Колонки `receipts`, потрібні серіалізатору (`serialize.ts#ReceiptRow`).
// Виписані буквально в КОЖНОМУ з трьох SQL нижче (а не через спільний
// template-interpolated constant) навмисно: `no-restricted-syntax`
// (`docs/04-governance/security/hardening/M11-eslint-plugin-security.md`)
// застерігає проти templated `query(...)` з `${...}` — тут інтерполяція
// була б статичною (не user input), але лишати її дешевше усунути, ніж
// пояснювати щоразу.

async function findExistingReceipt(
  client: PoolClient,
  userId: string,
  fiscalNum: string,
): Promise<ReceiptRow | undefined> {
  // БЕЗ source у WHERE: ключ ідемпотентності крос-джерельний
  // (user_id, fiscal_num) — replay того самого фіскального чека з ІНШОГО
  // source (dps-рескан чека, який уже привезла silpo-історія) має знайти
  // існуючий рядок, а не впасти «драйвер-аномалією».
  const { rows } = await client.query<ReceiptRow>(
    `SELECT id, user_id, source, fiscal_num, store_name, store_tax_id,
            purchased_at, total_kopiykas, created_at, updated_at
       FROM receipts
      WHERE user_id = $1 AND fiscal_num = $2`,
    [userId, fiscalNum],
  );
  return rows[0];
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Клієнт МІГ покласти `clientScanId` у власний `rawPayload` самостійно
 * (не заборонено — це opaque round-trip blob), але покладатись на це не
 * можна: якщо забув, дедуп нижче (`findExistingVisionReceiptByClientScanId`)
 * ніколи не спрацював би для vision-ретраю. Сервер САМ гарантує ключ у
 * збереженому JSONB, незалежно від того, чи клієнт про нього подбав
 * (review-фікс MAJOR, спека § «Дедуп» доповнена для fiscalNum=null).
 */
function withClientScanId(
  rawPayload: unknown,
  clientScanId: string | null,
): unknown {
  if (!clientScanId) return rawPayload;
  const base = isPlainRecord(rawPayload) ? rawPayload : { value: rawPayload };
  return { ...base, clientScanId };
}

/**
 * Дедуп retry vision-чека (`fiscalNum: null` — партіальний UNIQUE
 * `receipts_user_fiscal_idx` тут НЕ спрацьовує, бачить лише NOT NULL
 * fiscal_num, міграція 121): клієнт генерує `clientScanId` (uuid) ОДИН
 * РАЗ на спробу збереження і шле те саме значення в КОЖНОМУ retry того
 * самого save (мережевий таймаут / подвійний тап). Без нової
 * колонки/міграції — значення живе всередині `raw_payload`
 * (`withClientScanId` вище гарантує його там незалежно від клієнта).
 *
 * Предикати WHERE ДЗЕРКАЛЯТЬ `receipts_user_client_scan_idx` (міграція
 * 121) і НІЧОГО понад них — ревʼю PR #818 (раунд 5): фільтр за
 * `purchased_at` тут промахувався б повз існуючий рядок, коли retry
 * несе той самий clientScanId, але ВІДРЕДАГОВАНУ дату (користувач
 * поправив draft після невдалого save і тапнув знову) — INSERT далі
 * ловив би 23505 від індексу, а reload не знаходив би нічого → 500.
 * Ключ ідемпотентності — лише (user_id, clientScanId).
 */
async function findExistingVisionReceiptByClientScanId(
  client: PoolClient,
  userId: string,
  clientScanId: string,
): Promise<ReceiptRow | undefined> {
  const { rows } = await client.query<ReceiptRow>(
    `SELECT id, user_id, source, fiscal_num, store_name, store_tax_id,
            purchased_at, total_kopiykas, created_at, updated_at
       FROM receipts
      WHERE user_id = $1
        AND source = 'vision'
        AND fiscal_num IS NULL
        AND raw_payload ->> 'clientScanId' = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, clientScanId],
  );
  return rows[0];
}

async function insertReceiptItems(
  client: PoolClient,
  receiptId: unknown,
  items: ReceiptDraftItem[],
): Promise<ReceiptItemRow[]> {
  if (items.length === 0) return [];
  const values: string[] = [];
  const params: unknown[] = [];
  items.forEach((item, idx) => {
    const base = idx * 6;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
    );
    params.push(
      receiptId,
      item.position,
      item.name,
      item.qty,
      item.priceKopiykas,
      item.sumKopiykas,
    );
  });
  // eslint-disable-next-line no-restricted-syntax -- `values` містить ЛИШЕ `($N,$N,...)` placeholder-групи (побудовані з `idx`, не з item-даних); реальні значення йдуть через окремий параметризований `params`-масив нижче — той самий "dynamic WHERE/placeholder-count over allowlisted structure" case, що mono/read.ts::transactionsHandler і http/rateLimit.ts (M11-toлерований, без suppress-прецеденту, тут суплюємо явно для чистого --max-warnings=0 на комітах).
  const { rows } = await client.query<ReceiptItemRow>(
    `INSERT INTO receipt_items (receipt_id, position, name, qty, price_kopiykas, sum_kopiykas)
     VALUES ${values.join(", ")}
     RETURNING id, receipt_id, position, name, qty, price_kopiykas, sum_kopiykas`,
    params,
  );
  return rows;
}

async function fetchReceiptItems(
  client: PoolClient,
  receiptId: unknown,
): Promise<ReceiptItemRow[]> {
  const { rows } = await client.query<ReceiptItemRow>(
    `SELECT id, receipt_id, position, name, qty, price_kopiykas, sum_kopiykas
       FROM receipt_items WHERE receipt_id = $1 ORDER BY position ASC`,
    [receiptId],
  );
  return rows;
}

async function fetchReceiptLink(
  client: PoolClient,
  receiptId: unknown,
): Promise<ReceiptLinkRow | null> {
  const { rows } = await client.query<ReceiptLinkRow>(
    `SELECT tx_kind, tx_ref FROM finyk_tx_receipt_links WHERE receipt_id = $1`,
    [receiptId],
  );
  return rows[0] ?? null;
}

/**
 * Manual-expense fallback (matcher unmatched) — ЗА ІСНУЮЧИМ ПАТЕРНОМ
 * `modules/finyk/manualExpenses.ts#createManualExpense`: той самий
 * blob-shape (`{id, date, description, amount, category}`, `amount` у
 * ГРИВНЯХ), той самий sync-sibling insert (id UUID PK + user_id +
 * data_json JSONB). НЕ виклик самої `manualExpenses.ts` — той handler
 * звʼязаний з Express req/res (власний `parseBody`/`res.json`) і з
 * top-level `pool`, а тут потрібен insert усередині ВЖЕ відкритої
 * транзакції `save.ts` (той самий `client`, щоб COMMIT/ROLLBACK
 * охоплював і чек, і фолбек-витрату атомарно).
 *
 * `date` — Kyiv day-key від `purchasedAt` (спека: "date — YYYY-MM-DD від
 * purchased_at у Kyiv"), `description` — назва магазину (спека).
 */
async function insertManualExpenseForReceipt(
  client: PoolClient,
  userId: string,
  input: {
    storeName: string;
    category: string;
    purchasedAt: Date;
    amountHryvnia: number;
  },
): Promise<string> {
  const id = randomUUID();
  const blob = {
    id,
    date: kyivDateString(input.purchasedAt),
    description: input.storeName,
    amount: input.amountHryvnia,
    category: input.category,
  };
  await client.query(
    `INSERT INTO finyk_manual_expenses (id, user_id, data_json)
     VALUES ($1, $2, $3::jsonb)`,
    [id, userId, JSON.stringify(blob)],
  );
  return id;
}

/**
 * POST /api/finyk/receipts — save. Body = відредагований draft (лук/
 * аналіз) + category. Транзакційно: ідемпотентний insert receipt →
 * (якщо новий) insert items + matcher → link на mono АБО manual expense.
 *
 * Ідемпотентність (спека: "повторний скан того ж чека НЕ створює
 * дубль"): партіальний UNIQUE `(user_id, fiscal_num) WHERE fiscal_num
 * IS NOT NULL` (міграція 121, крос-джерельний — без source у ключі) —
 * `ON CONFLICT ... DO NOTHING` + fallback SELECT повертає ІСНУЮЧИЙ чек
 * (без нового item/matcher/expense) з `alreadyExists: true`, HTTP 200.
 * Новий чек — 201.
 *
 * `fiscalNum: null` (vision без QR) — фіскальний unique-індекс не бачить
 * ці рядки, тож ON CONFLICT-гілку для них не застосовуємо. Без
 * `clientScanId` кожен save = новий рядок (задокументована поведінка,
 * незмінна review-фіксом нижче). З `clientScanId` — клієнт-генерований
 * uuid, що лишається тим самим на КОЖЕН retry того самого save; сервер
 * шукає існуючий чек за ним ПЕРЕД insert-ом
 * (`findExistingVisionReceiptByClientScanId`) — той самий "no new
 * rows/expense on replay" контракт, що fiscalNum-гілка вище (review-фікс
 * MAJOR: без цього мережевий таймаут+retry на save дублював і чек, і
 * manual-витрату). Послідовний retry ловить SELECT; КОНКУРЕНТНУ гонку —
 * партіальний UNIQUE `receipts_user_client_scan_idx` (міграція 121) на
 * JSONB-виразі + SAVEPOINT-обробка 23505 у гілці insert-у нижче.
 */
export default async function saveReceiptHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseBody(ReceiptSaveRequestSchema, req);
  const userId = (req as WithSessionUser).user!.id;

  const storeName = body.store.trim() || FALLBACK_STORE_NAME;
  const purchasedAt = new Date(body.purchasedAt);
  const rawPayloadWithScanId = withClientScanId(
    body.rawPayload,
    body.clientScanId ?? null,
  );
  const rawPayloadJson = JSON.stringify(rawPayloadWithScanId);
  // ЕФЕКТИВНИЙ ключ ідемпотентності — те, що РЕАЛЬНО ляже в raw_payload і
  // що бачить партіальний UNIQUE `receipts_user_client_scan_idx` (міграція
  // 121): body.clientScanId, а без нього — рядковий clientScanId, який
  // клієнт міг покласти в opaque blob самостійно. Дедуп-SELECT, guard
  // 23505-гонки нижче і предикат індексу (jsonb_typeof = 'string') мусять
  // дивитись на ОДНЕ значення — конфлікт, який індекс бачить, а код ні,
  // давав би незʼясовне 500 замість reload-у існуючого чека.
  const effectiveClientScanId =
    isPlainRecord(rawPayloadWithScanId) &&
    typeof rawPayloadWithScanId["clientScanId"] === "string"
      ? rawPayloadWithScanId["clientScanId"]
      : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let receiptRow: ReceiptRow | undefined;
    let isNew: boolean;

    if (body.fiscalNum) {
      const inserted = await client.query<ReceiptRow>(
        `INSERT INTO receipts
           (user_id, source, fiscal_num, store_name, store_tax_id, purchased_at, total_kopiykas, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (user_id, fiscal_num) WHERE fiscal_num IS NOT NULL DO NOTHING
         RETURNING id, user_id, source, fiscal_num, store_name, store_tax_id,
                   purchased_at, total_kopiykas, created_at, updated_at`,
        [
          userId,
          body.source,
          body.fiscalNum,
          storeName,
          body.storeTaxId,
          purchasedAt.toISOString(),
          body.totalKopiykas,
          rawPayloadJson,
        ],
      );
      if (inserted.rows[0]) {
        receiptRow = inserted.rows[0];
        isNew = true;
      } else {
        receiptRow = await findExistingReceipt(client, userId, body.fiscalNum);
        isNew = false;
        // INSERT ... ON CONFLICT DO NOTHING повернув 0 рядків (конфлікт
        // стався), але наступний SELECT ТЕЖ порожній — driver/race
        // аномалія, не очікуваний стан (партіальний unique гарантує, що
        // конфлікт означає "рядок існує"). Fail loud, як
        // manualExpenses.ts робить на власному RETURNING guard.
        if (!receiptRow) {
          throw new Error(
            "receipts INSERT ... ON CONFLICT DO NOTHING повернув 0 рядків, але наступний SELECT теж — драйвер-аномалія",
          );
        }
      }
    } else {
      const existingByClientScanId = effectiveClientScanId
        ? await findExistingVisionReceiptByClientScanId(
            client,
            userId,
            effectiveClientScanId,
          )
        : undefined;

      if (existingByClientScanId) {
        // Retry того самого save (мережевий таймаут / подвійний тап) —
        // повертаємо ІСНУЮЧИЙ чек, без нового item/matcher/expense
        // insert-у (той самий контракт, що fiscalNum ON CONFLICT-гілка
        // вище: `isNew=false` веде у гілку fetch нижче автоматично).
        receiptRow = existingByClientScanId;
        isNew = false;
      } else {
        // SAVEPOINT (ревʼю PR #818): дедуп-SELECT вище ловить лише
        // ПОСЛІДОВНИЙ retry — два КОНКУРЕНТНІ запити з одним clientScanId
        // обидва бачать «нема рядка» до першого INSERT-у. Гонку закриває
        // партіальний UNIQUE `receipts_user_client_scan_idx` (міграція
        // 121): той, хто програв, отримує 23505, відкочується до
        // savepoint-у (після помилки Postgres блокує транзакцію до
        // ROLLBACK — той самий патерн, що link_mono нижче) і перечитує
        // рядок переможця — isNew=false, як у послідовному retry.
        await client.query("SAVEPOINT insert_vision_receipt");
        try {
          const inserted = await client.query<ReceiptRow>(
            `INSERT INTO receipts
               (user_id, source, fiscal_num, store_name, store_tax_id, purchased_at, total_kopiykas, raw_payload)
             VALUES ($1, $2, NULL, $3, $4, $5, $6, $7::jsonb)
             RETURNING id, user_id, source, fiscal_num, store_name, store_tax_id,
                       purchased_at, total_kopiykas, created_at, updated_at`,
            [
              userId,
              body.source,
              storeName,
              body.storeTaxId,
              purchasedAt.toISOString(),
              body.totalKopiykas,
              rawPayloadJson,
            ],
          );
          receiptRow = inserted.rows[0];
          isNew = true;
          if (!receiptRow) {
            throw new Error(
              "receipts INSERT (fiscalNum=null) повернув 0 рядків — драйвер-аномалія",
            );
          }
        } catch (err) {
          const clientScanIdRace =
            typeof err === "object" &&
            err !== null &&
            (err as { code?: string }).code === "23505" &&
            (err as { constraint?: string }).constraint ===
              "receipts_user_client_scan_idx";
          if (!clientScanIdRace || effectiveClientScanId === null) throw err;
          await client.query("ROLLBACK TO SAVEPOINT insert_vision_receipt");
          receiptRow = await findExistingVisionReceiptByClientScanId(
            client,
            userId,
            effectiveClientScanId,
          );
          isNew = false;
          // 23505 на receipts_user_client_scan_idx гарантує, що рядок
          // переможця існує і закомічений (unique-перевірка чекала його
          // COMMIT-у); порожній reload = аномалія, fail loud (той самий
          // guard, що fiscalNum-гілка вище).
          if (!receiptRow) {
            throw new Error(
              "23505 на receipts_user_client_scan_idx, але reload за clientScanId порожній — драйвер-аномалія",
            );
          }
        }
      }
    }

    let items: ReceiptItemRow[];
    let link: ReceiptLinkRow | null;

    if (isNew) {
      items = await insertReceiptItems(client, receiptRow.id, body.items);

      const match = await matchReceiptToMono(client, {
        userId,
        fiscalNum: body.fiscalNum,
        totalKopiykas: body.totalKopiykas,
        purchasedAt,
      });

      if (match.kind === "mono") {
        // Міграція 121: UNIQUE (tx_kind, tx_ref) — одна транзакція має
        // щонайбільше один чек. matcher уже відсіює прилінковані mono-tx
        // (NOT EXISTS), тож 23505 тут — лише гонка двох конкурентних
        // save-ів на той самий платіж. Graceful-гілка: чек лишається
        // unmatched (link=null — першокласний стан за спекою), manual
        // expense НЕ створюємо — mono-транзакція вже «зайнята»
        // чеком-переможцем гонки, і дубль-витрата порахувала б покупку
        // двічі. SAVEPOINT, бо після помилки в транзакції Postgres
        // блокує подальші запити до ROLLBACK.
        await client.query("SAVEPOINT link_mono");
        try {
          await client.query(
            `INSERT INTO finyk_tx_receipt_links (receipt_id, tx_kind, tx_ref) VALUES ($1, 'mono', $2)`,
            [receiptRow.id, match.monoTxId],
          );
          link = { tx_kind: "mono", tx_ref: match.monoTxId };
        } catch (err) {
          const uniqueViolation =
            typeof err === "object" &&
            err !== null &&
            (err as { code?: string }).code === "23505";
          if (!uniqueViolation) throw err;
          await client.query("ROLLBACK TO SAVEPOINT link_mono");
          link = null;
        }
      } else {
        const expenseId = await insertManualExpenseForReceipt(client, userId, {
          storeName,
          category: body.category,
          purchasedAt,
          amountHryvnia: body.totalKopiykas / 100,
        });
        await client.query(
          `INSERT INTO finyk_tx_receipt_links (receipt_id, tx_kind, tx_ref) VALUES ($1, 'manual', $2)`,
          [receiptRow.id, expenseId],
        );
        link = { tx_kind: "manual", tx_ref: expenseId };
      }
    } else {
      // Ідемпотентний повторний скан — items/link уже створені на
      // попередньому save; читаємо їх для консистентної відповіді, нових
      // не створюємо (спека: matcher/expense-створення НЕ повторюється).
      items = await fetchReceiptItems(client, receiptRow.id);
      link = await fetchReceiptLink(client, receiptRow.id);
    }

    // Серіалізація + schema.parse ДО COMMIT (review-фікс Trivial): якщо
    // serializeReceipt/.parse() впаде ПІСЛЯ COMMIT-у, транзакція вже
    // записана, а клієнт все одно отримав би 500 — неконсистентний стан
    // (дані в БД є, відповіді нема). Побудувавши payload тут, будь-яка
    // помилка серіалізації йде через звичайний catch/ROLLBACK нижче, як
    // і решта помилок цього handler-а.
    const responseBody = ReceiptSaveResponseSchema.parse({
      receipt: serializeReceipt(receiptRow, items, link),
      alreadyExists: !isNew,
    });

    await client.query("COMMIT");

    res.status(isNew ? 201 : 200).json(responseBody);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* secondary rollback failure swallowed — оригінальна помилка важливіша */
    }
    throw err;
  } finally {
    client.release();
  }
}
