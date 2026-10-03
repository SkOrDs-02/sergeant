import { z } from "zod";
import * as Sentry from "@sentry/node";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import {
  AppError,
  ExternalServiceError,
  RateLimitError,
} from "../../obs/errors.js";
import {
  callMcpTool,
  listMcpTools,
  type McpError,
  type McpResult,
} from "./mcpClient.js";
import { resolveBranchContext } from "./branchContext.js";
import { diffToolContract } from "./toolContract.js";
import {
  OFFLINE_ORDERS_LIMIT,
  ONLINE_ORDERS_LIMIT,
  ONLINE_ORDERS_PAGE_SIZE,
} from "./orderLimits.js";
import { matchAndLink } from "./receiptsMatch.js";
import {
  defaultWithTransaction,
  upsertReceipt,
  type ParsedItem,
  type ParsedReceipt,
  type SilpoTransactionRunner,
} from "./receiptsUpsert.js";
import {
  callWithFreshAccessToken,
  type QueryFn,
  type SilpoAuthedCallErrorKind,
} from "./tokenStore.js";

/**
 * Pulls Silpo order history (offline + online), normalizes it into our own
 * `silpo_receipts` / `silpo_receipt_items` snapshot, and runs the
 * deterministic matcher against the user's Mono transactions. Spec:
 * `docs/work/specs/silpo-mcp-integration.md` § Рішення дизайну
 * ("Збагачення, а не створення витрат" / "Unmatched-чеки — першокласний стан").
 *
 * Форми звірені живим спайком §0 (2026-08-18, `serverInfo.version 1.108.0`):
 *
 * - `silpo_get_my_offline_orders` вимагає `branchId`/`deliveryType`/
 *   `timeslot*` (див. `branchContext.ts`); порожні timeslot-и приймаються.
 *   Order: `{filId, filialName, cityName, createdAt, sumReg, sumDiscount,
 *   accruedBalaBonusesSum, receiptUrl, chequeMagicName, rewards, products}`.
 *   `products[]`: `{lagerId, name, unit, quantity, price}` — `price` це ЦІНА
 *   ЗА ОДИНИЦЮ (Σ price×quantity ≈ sumReg, звірено на живих чеках), `unit` —
 *   фасування ("шт", "кг", "870г", "пачка"...). Власного `id` чек НЕ має —
 *   стабільний ідентифікатор деривуємо з токена `receiptUrl`
 *   (`https://receipt.silpo.elkasa.com.ua/<token>`).
 * - `silpo_get_my_online_orders` — всі аргументи опційні. Order: `{orderId,
 *   number, status, createdAt, amount, discount, delivery, address,
 *   products}`; `products[]`: `{id, name, price, quantity, subtotal,
 *   removed}`. `amount` ≠ Σ subtotal (доставка/знижки) — беремо `amount`.
 * - Дати: offline `createdAt` — НАЇВНИЙ Kyiv-local рядок без офсету
 *   (`2026-08-09T20:12:24`); online — ISO з офсетом (`...+00:00`).
 * - Суми — UAH decimal → ×100 у копійки. Баркодів/категорій у чеках немає.
 *
 * Every raw schema stays `.passthrough()`; a receipt/item that doesn't
 * parse is DROPPED with a `logger.warn` (never crashes the sync).
 */

// ──────────────────────── Raw shapes (спайк §0, 2026-08-18) ─────────────────

const RawItemSchema = z
  .object({
    // offline
    lagerId: z.number().optional(),
    name: z.string().optional(),
    unit: z.string().optional(),
    quantity: z.number().optional(),
    price: z.number().optional(), // UAH за одиницю
    // online
    id: z.union([z.string(), z.number()]).optional(),
    subtotal: z.number().optional(), // UAH line total (online)
  })
  .passthrough();
type RawItem = z.infer<typeof RawItemSchema>;

const RawOrderSchema = z
  .object({
    // offline
    filId: z.number().optional(),
    filialName: z.string().optional(),
    createdAt: z.string().optional(),
    sumReg: z.number().optional(), // UAH total
    receiptUrl: z.string().nullable().optional(),
    // online
    orderId: z.string().optional(),
    status: z.string().optional(),
    amount: z.number().optional(), // UAH total
    products: z.array(z.unknown()).optional(),
  })
  .passthrough();
type RawOrder = z.infer<typeof RawOrderSchema>;

/**
 * Envelope: живий сервер віддає `structuredContent` як обʼєкт
 * `{success, summary, orders: [...], meta}` — НЕ голий масив. Елементи
 * лишаються `z.unknown()`: per-order `RawOrderSchema.safeParse` нижче, щоб
 * один кривий чек DROP-ався з `logger.warn`, а не валив увесь sync як
 * `schema_drift` (spec § "Дрейф схеми tools — контрактний пояс").
 */
const RawOrdersEnvelopeSchema = z
  .object({ orders: z.array(z.unknown()).optional() })
  .passthrough();

// ─────────────────────────── Normalization (provisional) ────────────────────

function firstDefined<T>(
  ...values: Array<T | undefined | null>
): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function uahToKop(uah: number | undefined): number | undefined {
  return uah === undefined ? undefined : Math.round(uah * 100);
}

/**
 * Offline `createdAt` — наївний Kyiv-local рядок без офсету (спайк §0).
 * `Date.parse` трактував би його в TZ процесу — на UTC-сервері це зсув
 * на 2–3 год і потенційно інша доба для matcher-а. Парсимо явно як
 * Europe/Kyiv через Intl-офсет на цю мить.
 */
// ponytail: у годину переходу на зимовий час офсет неоднозначний ±1h —
// для day-вікна matcher-а несуттєво.
function kyivNaiveToMs(naive: string): number {
  const utcGuess = Date.parse(`${naive}Z`);
  if (!Number.isFinite(utcGuess)) return NaN;
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(utcGuess))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetPart ?? "");
  if (!m) return utcGuess;
  const offsetMs =
    (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
  return utcGuess - offsetMs;
}

/** `https://receipt.silpo.elkasa.com.ua/<token>` → `<token>` (стабільний id чека). */
function receiptIdFromUrl(receiptUrl: string): string | undefined {
  const token = receiptUrl.split("/").filter(Boolean).pop();
  return token && token.length > 0 ? token : undefined;
}

function normalizeRawItem(raw: RawItem): ParsedItem | null {
  const name = raw.name;
  if (!name) return null;
  const priceKop = uahToKop(raw.price);
  if (priceKop === undefined) return null;
  return {
    name,
    qty: raw.quantity ?? null,
    unit: raw.unit ?? null,
    priceKop,
    categorySlug: null, // чеки Сільпо не містять категорій (спайк §0)
    barcode: null, // ані EAN — лише внутрішній lagerId (лишається в raw JSONB)
  };
}

function normalizeRawOrder(
  raw: RawOrder,
  channel: "online" | "offline",
): ParsedReceipt | null {
  const receiptId =
    channel === "online"
      ? raw.orderId
      : firstDefined(
          raw.receiptUrl ? receiptIdFromUrl(raw.receiptUrl) : undefined,
          // Fallback без receiptUrl: детермінований складений ключ.
          raw.filId !== undefined && raw.createdAt !== undefined
            ? `offline_${raw.filId}_${raw.createdAt}`
            : undefined,
        );
  if (!receiptId) {
    logger.warn({ msg: "silpo_receipt_missing_id", channel });
    return null;
  }
  const purchasedAtMs = raw.createdAt
    ? channel === "offline"
      ? kyivNaiveToMs(raw.createdAt)
      : Date.parse(raw.createdAt)
    : NaN;
  if (!Number.isFinite(purchasedAtMs)) {
    logger.warn({ msg: "silpo_receipt_missing_date", channel, receiptId });
    return null;
  }
  const totalKop = uahToKop(channel === "offline" ? raw.sumReg : raw.amount);
  if (totalKop === undefined) {
    logger.warn({ msg: "silpo_receipt_missing_total", channel, receiptId });
    return null;
  }
  const items = (raw.products ?? [])
    .map((p) => {
      const parsed = RawItemSchema.safeParse(p);
      return parsed.success ? normalizeRawItem(parsed.data) : null;
    })
    .filter((i): i is ParsedItem => i !== null);

  return {
    receiptId,
    purchasedAtMs,
    storeId: raw.filId !== undefined ? String(raw.filId) : null,
    paymentHint: null, // способу оплати в жодному з order-tools немає (спайк §0)
    totalKop,
    items,
    raw,
  };
}

// ─────────────────────────────── MCP fetch step ─────────────────────────────

/**
 * Одна сторінка замовлень, розібрана **поелементно**: збій рівня MCP
 * (мережа/авторизація/протокол/дрейф схеми конверта) і далі спливає як
 * `McpError`, але окремий непарсабельний *елемент* просто відкидається з
 * `logger.warn("silpo_raw_order_unparseable")`, не валячи синк.
 *
 * Повертає ДВА числа, і різниця між ними принципова: `orders` — те, що
 * вдалось розібрати, `rawCount` — скільки елементів було в конверті. Для
 * пагінації годиться лише другий: сторінка з одним битим рядком виглядає
 * коротшою за запит, і по `orders.length` обхід вирішив би, що замовлення
 * скінчились, мовчки загубивши все, що йде далі.
 */
interface OrderPage {
  orders: RawOrder[];
  rawCount: number;
}

async function fetchOrderList(
  accessToken: string,
  toolName: "silpo_get_my_offline_orders" | "silpo_get_my_online_orders",
  args: Record<string, unknown>,
): Promise<McpResult<OrderPage>> {
  const result = await callMcpTool({
    accessToken,
    toolName,
    args,
    schema: RawOrdersEnvelopeSchema,
  });
  if (!result.ok) return result;

  const orders: RawOrder[] = [];
  const rawOrders = result.data.orders ?? [];
  rawOrders.forEach((raw, index) => {
    const parsed = RawOrderSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({
        msg: "silpo_raw_order_unparseable",
        toolName,
        index,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
        })),
      });
      return;
    }
    orders.push(parsed.data);
  });

  return { ok: true, data: { orders, rawCount: rawOrders.length } };
}

interface BothOrderLists {
  offline: RawOrder[];
  online: RawOrder[];
}

/**
/**
 * Стеля `limit`, яку Сільпо назвав у відмові валідації, або `null`.
 *
 * Текст відмови несе zod-issue дослівно:
 * `[{"origin":"number","code":"too_big","maximum":50,…,"path":["limit"],…}]`.
 * Читаємо саме `maximum` поруч із `"too_big"` — не перше число в рядку:
 * там же трапляються коди помилок (`-32602`) і номери шляхів.
 */
export function parseLimitCeilingFromRefusal(message: string): number | null {
  if (!/too_big/i.test(message) || !/"limit"/.test(message)) return null;
  const m = /"maximum"\s*:\s*(\d+)/.exec(message);
  if (!m?.[1]) return null;
  const ceiling = Number(m[1]);
  return Number.isInteger(ceiling) && ceiling > 0 ? ceiling : null;
}

/**
 * Онлайн-замовлення сторінками, з адаптацією до стелі `limit`.
 *
 * Доти запит ішов одним викликом на `ONLINE_ORDERS_LIMIT`, і коли Сільпо
 * 2026-09-14 знизили максимум зі 100 до 50, синк просто перестав працювати.
 * Числова константа тут ненадійна за побудовою: її значення живе на чужому
 * сервері й може змінитись мовчки будь-коли.
 *
 * Тому: йдемо сторінками по `ONLINE_ORDERS_PAGE_SIZE`, а коли сторінка
 * відмовлена через завеликий `limit` — звужуємось до стелі, яку Сільпо
 * назвав САМ, і повторюємо цю ж сторінку. Звуження одноразове на сторінку:
 * друга відмова поспіль — це вже не відома нам межа, і її треба показати,
 * а не крутити цикл.
 *
 * Обхід зупиняється, коли набрано `ONLINE_ORDERS_LIMIT`, або коли сторінка
 * прийшла коротшою за запит (замовлення скінчились) — інакше порожні
 * сторінки крутились би до стелі.
 */
async function fetchOnlineOrders(
  accessToken: string,
): Promise<McpResult<RawOrder[]>> {
  const orders: RawOrder[] = [];
  let pageSize = ONLINE_ORDERS_PAGE_SIZE;
  let offset = 0;

  while (orders.length < ONLINE_ORDERS_LIMIT) {
    const want = Math.min(pageSize, ONLINE_ORDERS_LIMIT - orders.length);
    let page = await fetchOrderList(accessToken, "silpo_get_my_online_orders", {
      limit: want,
      offset,
    });

    if (!page.ok && page.error.kind === "tool_error") {
      const ceiling = parseLimitCeilingFromRefusal(page.error.message);
      if (ceiling !== null && ceiling < want) {
        logger.warn({
          msg: "silpo_online_limit_ceiling_lowered",
          asked: want,
          ceiling,
        });
        pageSize = ceiling;
        page = await fetchOrderList(accessToken, "silpo_get_my_online_orders", {
          limit: ceiling,
          offset,
        });
      }
    }

    if (!page.ok) return page;
    orders.push(...page.data.orders);
    // Коротша сторінка = замовлення скінчились. Два уточнення, і обидва
    // з граблів. Перше: порівнюємо з тим, що РЕАЛЬНО просили останнім
    // запитом, а не з `want` — після звуження це різні числа, і `want`
    // дав би нескінченний цикл на повній сторінці. Друге: міряємо
    // `rawCount`, а не `orders.length` — один непарсабельний рядок робить
    // повну сторінку «короткою», і обхід зупинився б, загубивши решту.
    if (page.data.rawCount < Math.min(pageSize, want)) break;
    offset += page.data.rawCount;
  }

  return { ok: true, data: orders.slice(0, ONLINE_ORDERS_LIMIT) };
}

/**
 * Як часто звіряти живу специфікацію тул із тим, що шле код. Раз на добу:
 * це один додатковий `tools/list` на всіх користувачів разом, а зміни на
 * їхньому боці не бувають частішими за деплої.
 */
const CONTRACT_CHECK_INTERVAL_MS = 24 * 60 * 60_000;
let lastContractCheckAt = 0;

/** Test-only: скидає вікно звірки контракту між тестами. */
export function __resetSilpoContractCheck(): void {
  lastContractCheckAt = 0;
}

/**
 * Профілактична звірка специфікації тул — щоб зміна на боці Сільпо
 * називала себе САМА, а не через два тижні мертвого синку.
 *
 * 2026-09-14 вони знизили стелю `limit` зі 100 до 50, і єдиним сигналом був
 * збій синку, який виглядав як «змінили формат відповіді». Снапшот-тест
 * цього не бачив за побудовою (він звіряє код із записом, не з сервером).
 *
 * Три властивості цієї перевірки навмисні:
 *   - **не блокує синк.** Будь-яка її помилка ковтається: діагностика не
 *     має права зламати те, що працює;
 *   - **раз на добу**, не на кожен синк — зайвий виклик до чужого API
 *     коштує квоти, а специфікація так часто не міняється;
 *   - **дзвонить у Sentry**, а не лише в лог. Рядок у лозі, якого ніхто не
 *     читає, — це не сигнал; той самий урок, що й з дрейфом схеми.
 */
async function checkToolContract(accessToken: string): Promise<void> {
  const now = Date.now();
  if (now - lastContractCheckAt < CONTRACT_CHECK_INTERVAL_MS) return;
  lastContractCheckAt = now;

  try {
    const tools = await listMcpTools(accessToken);
    if (!tools.ok) return;

    const drift = diffToolContract(tools.data);
    if (drift.length === 0) return;

    logger.error({ msg: "silpo_tool_contract_drift", drift });
    try {
      Sentry.captureException(
        new Error(`Silpo tool contract drift: ${drift.join("; ")}`), // NOSONAR — синтетична помилка як носій алерту
        {
          level: "warning",
          tags: { integration: "silpo", kind: "contract_drift" },
        },
      );
    } catch {
      /* Sentry ніколи не має ламати обробку */
    }
  } catch (err) {
    logger.warn({
      msg: "silpo_tool_contract_check_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Offline-tool вимагає контекст філії (спайк §0). Якщо контекст добути не
 * вдалося — offline-канал деградує до порожнього списку з `logger.warn`
 * (best-effort принцип спеки), online синкається завжди.
 */
function makeFetchBothOrderLists(
  userId: string,
): (accessToken: string) => Promise<McpResult<BothOrderLists>> {
  return async (accessToken) => {
    let offline: RawOrder[] = [];
    const ctx = await resolveBranchContext(userId, accessToken);
    if (ctx.ok) {
      const offlineResult = await fetchOrderList(
        accessToken,
        "silpo_get_my_offline_orders",
        {
          branchId: ctx.data.branchId,
          deliveryType: ctx.data.deliveryType,
          timeslotStart: ctx.data.timeslotStart,
          timeslotEnd: ctx.data.timeslotEnd,
          limit: OFFLINE_ORDERS_LIMIT,
        },
      );
      if (!offlineResult.ok) {
        // auth_required має спливти нагору — callWithFreshAccessToken
        // зробить refresh і повторить; решта — деградація каналу.
        if (offlineResult.error.kind === "auth_required") return offlineResult;
        logger.warn({
          msg: "silpo_offline_orders_skipped",
          kind: offlineResult.error.kind,
        });
      } else {
        offline = offlineResult.data.orders;
      }
    } else {
      logger.warn({ msg: "silpo_offline_orders_skipped_no_branch_context" });
    }

    const online = await fetchOnlineOrders(accessToken);
    if (!online.ok) return { ok: false, error: online.error };

    // Після успішного синку — профілактична звірка специфікації (раз на
    // добу). Саме після, а не до: зайвий виклик не має стояти на шляху
    // роботи, заради якої користувач тапнув кнопку.
    await checkToolContract(accessToken);

    return { ok: true, data: { offline, online: online.data } };
  };
}

// ────────────────────────────────── Orchestration ────────────────────────────

export interface SilpoSyncResult {
  status: "connected" | "reauth_required";
  offlinePulled: number;
  onlinePulled: number;
  receiptsInserted: number;
  itemsInserted: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
}

/**
 * Дедуп-вікно для Sentry-алерту про збій Сільпо. Усі ці відмови — СТАНИ, а
 * не події: якщо Сільпо змінили формат чи лежать, ЖОДЕН наступний виклик не
 * пройде, і без вікна кожен тап «Оновити чеки» кожного користувача став би
 * окремою подією. Одна подія на 15 хв достатня, щоб побачити проблему, і не
 * заливає квоту.
 */
const SILPO_ALERT_WINDOW_MS = 15 * 60_000;

/**
 * Вікно ведеться ПО ВИДУ збою, а не одне спільне.
 *
 * AI-DANGER: спільний лічильник зробив би алерти взаємно глушними —
 * `upstream_unavailable` (найчастіший і найменш цікавий) з'їдав би вікно, і
 * `schema_drift`, який стається раз на місяці й вимагає правки коду, мовчав
 * би цілих 15 хв після нього. Тобто найгучніший вид ховав би найважливіший.
 */
const lastAlertAt = new Map<SilpoAlertKind, number>();

/** Види збою, про які ми сигналимо. Решта — очікувані стани користувача. */
type SilpoAlertKind =
  | "schema_drift"
  | "tool_error"
  | "protocol_error"
  | "upstream_unavailable"
  | "unknown";

/** Test-only: скидає вікна дедупу між тестами. */
export function __resetSilpoAlerts(): void {
  lastAlertAt.clear();
}

/**
 * Сигналить у Sentry про збій інтеграції.
 *
 * **Чому це потрібно окремим викликом.** `errorHandler` шле в Sentry лише
 * НЕ-operational 5xx, а все, що повертає цей мапер, — `AppError`, тобто
 * operational. Без явного capture жоден із цих збоїв у дашборді не
 * з'являється: `schema_drift` лишався б самим лише warn-рядком у логах, а
 * три інші — двома полями (`last_failed_at`, `last_error_code`) у таблиці
 * `silpo_connection`, куди ніхто не дивиться, доки чеки не перестануть
 * приходити. Знахідка 2026-09-17: у Sentry летів РІВНО ОДИН вид із чотирьох.
 *
 * **`detail` передається лише там, де він НАШ.** Для `schema_drift` це опис
 * форми відповіді, який склали ми (`mcpClient.ts`), і без нього подія
 * марна — вона має назвати зламане поле. Для решти видів текст приходить
 * від Сільпо і може нести поля покупки, тож у подію він НЕ потрапляє
 * (Hard Rule #21) — там достатньо самого виду, а причина лишається в логах.
 */
function captureSilpoFailure(kind: SilpoAlertKind, detail?: string): void {
  logger.error({ msg: `silpo_${kind}`, ...(detail ? { detail } : {}) });
  const now = Date.now();
  const previous = lastAlertAt.get(kind) ?? 0;
  if (previous && now - previous < SILPO_ALERT_WINDOW_MS) return;
  lastAlertAt.set(kind, now);
  // Заголовок — це ключ групування Sentry, тож для `schema_drift` він
  // лишається ДОСЛІВНО тим, що був до 2026-09-17. Інакше справжній повтор
  // дрейфу завів би НОВУ issue замість того, щоб перевідкрити вже закриту, —
  // і зв'язок «та сама поломка повернулась» загубився б саме тоді, коли він
  // потрібен. Решта видів заводиться вперше, тож там формат вільний.
  const title =
    kind === "schema_drift" ? "Silpo MCP schema drift" : `Silpo MCP ${kind}`;
  try {
    Sentry.captureException(
      new Error(detail ? `${title}: ${detail}` : title), // NOSONAR — навмисно синтетична помилка як носій алерту
      {
        level: "warning",
        tags: { integration: "silpo", kind },
      },
    );
  } catch {
    /* Sentry ніколи не має ламати обробку помилки */
  }
}

/** Maps a token/MCP-layer error to the HTTP-facing `AppError` the route should throw. */
export function silpoErrorToAppError(
  error: McpError | { kind: SilpoAuthedCallErrorKind; message: string },
): AppError {
  switch (error.kind) {
    case "not_connected":
      return new AppError("Сільпо не підключено", {
        status: 409,
        code: "SILPO_NOT_CONNECTED",
      });
    case "reauth_required":
    case "auth_required":
      return new AppError("Потрібне повторне підключення Сільпо", {
        status: 409,
        code: "SILPO_REAUTH_REQUIRED",
      });
    case "config_missing":
      return new AppError("Сільпо-інтеграція не налаштована на сервері", {
        status: 503,
        code: "SILPO_CONFIG_MISSING",
      });
    case "rate_limited":
      return new RateLimitError("Забагато запитів до Сільпо. Спробуй пізніше", {
        code: "SILPO_RATE_LIMITED",
      });
    case "tool_error":
      // Тула відпрацювала і ВІДМОВИЛА — контракт цілий, зламалось щось на
      // боці Сільпо (ліміт, тимчасова помилка, відкликаний доступ). Текст
      // відмови вже в логах (`silpo_mcp_tool_error`); людині він нічого не
      // дає, тож копія лишається про стан, а не про формат — і в подію
      // Sentry він теж не йде (може нести поля покупки, Hard Rule #21).
      captureSilpoFailure("tool_error");
      return new ExternalServiceError(
        "Сільпо не віддав чеки, спробуй пізніше",
        { code: "SILPO_TOOL_ERROR" },
      );
    case "schema_drift":
      // Єдиний детектор того, що Сільпо мовчки змінили контракт: версіонування
      // в них немає, зламатись може будь-коли (спека § Дрейф схеми tools).
      // `errorHandler` сюди НЕ докричиться до Sentry: він шле лише
      // НЕ-operational 5xx, а це `AppError` (operational) — тож без явного
      // capture дрейф лишався б самим лише warn-рядком у логах, який ніхто
      // не читає. Звідси прямий виклик тут.
      captureSilpoFailure("schema_drift", error.message);
      return new ExternalServiceError(
        "Сільпо змінили формат відповіді, оновлення тимчасово недоступне",
        { code: "SILPO_SCHEMA_DRIFT" },
      );
    case "protocol_error":
    case "upstream_unavailable":
    default:
      // Мережа або протокол. Людині показуємо те саме «тимчасово
      // недоступний», але в дашборді ці два види мають бути РІЗНИМИ: перший
      // означає, що Сільпо відповів чимось, чого ми не вміємо читати
      // (тобто підозра на ту саму зміну контракту), другий — що не
      // відповів узагалі. Невідомий вид підписується як `unknown`, щоб
      // нова гілка в чужому API не з'їхала мовчки в купу до мережевих.
      captureSilpoFailure(
        error.kind === "protocol_error" || error.kind === "upstream_unavailable"
          ? error.kind
          : "unknown",
      );
      return new ExternalServiceError("Сільпо тимчасово недоступний", {
        code: "SILPO_UPSTREAM_ERROR",
      });
  }
}

/**
 * Лишає в `silpo_connection` слід останнього провалу синку.
 *
 * Це та половина, якої бракувало два тижні. `last_sync_at` торкався лише
 * на успіху, тож «синк зламано» і «людина не ходила в магазин» виглядали
 * в інтерфейсі однаково — поломку видно було тільки в Sentry (304 події),
 * куди власник продукту не дивиться. Тепер провал лишає слід там же, де
 * успіх, і застосунок може про нього сказати.
 *
 * Пишемо НАШ код, а не текст відмови Сільпо: чужий текст може нести поля
 * покупки, а це друга копія чекових даних у місці, де їх ніхто не чекає
 * (Hard Rule #21). Причина лишається в логах і в діагностиці.
 *
 * **Помилка запису ковтається навмисно.** Ця функція викликається на
 * шляху, який УЖЕ падає: кинути звідси другу помилку означало б підмінити
 * справжню причину збою технічною — тобто зламати рівно ту діагностику,
 * заради якої все це й робиться.
 */
async function recordSyncFailure(
  userId: string,
  code: string,
  queryFn: QueryFn,
): Promise<void> {
  try {
    await queryFn(
      `UPDATE silpo_connection
          SET last_failed_at = NOW(),
              last_error_code = $2,
              updated_at = NOW()
        WHERE user_id = $1`,
      [userId, code],
      { op: "silpo_connection_record_failure" },
    );
  } catch (err) {
    logger.warn({
      msg: "silpo_record_sync_failure_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * `POST /api/silpo/sync` ("Оновити чеки") entry point. Pulls both order
 * lists, upserts new receipts/items (existing ones are immutable — never
 * re-fetched/re-written), then runs the deterministic matcher over
 * receipts that don't already have a `silpo_tx_receipt_links` row.
 *
 * Throws a mapped {@link AppError} (via {@link silpoErrorToAppError}) on
 * connection/upstream failure — explicit user-triggered action, so a clean
 * 4xx/5xx is correct; the "staleness banner, never a crash" principle
 * (spec § Ізоляція збою) governs BACKGROUND degradation, not this button.
 */
export async function pullAndSyncReceipts(
  userId: string,
  deps: { query?: QueryFn; withTransaction?: SilpoTransactionRunner } = {},
): Promise<SilpoSyncResult> {
  const queryFn = deps.query ?? defaultQuery;
  const withTransaction = deps.withTransaction ?? defaultWithTransaction;

  const call = await callWithFreshAccessToken(
    userId,
    makeFetchBothOrderLists(userId),
    { query: queryFn },
  );
  if (!call.ok) {
    const appError = silpoErrorToAppError(call.error);
    await recordSyncFailure(userId, appError.code, queryFn);
    throw appError;
  }

  const offlineParsed = call.data.offline
    .map((raw) => normalizeRawOrder(raw, "offline"))
    .filter((r): r is ParsedReceipt => r !== null);
  const onlineParsed = call.data.online
    .map((raw) => normalizeRawOrder(raw, "online"))
    .filter((r): r is ParsedReceipt => r !== null);

  let receiptsInserted = 0;
  let itemsInserted = 0;
  for (const receipt of offlineParsed) {
    const r = await upsertReceipt(userId, "offline", receipt, withTransaction);
    if (r.inserted) receiptsInserted++;
    itemsInserted += r.itemsInserted;
  }
  for (const receipt of onlineParsed) {
    const r = await upsertReceipt(userId, "online", receipt, withTransaction);
    if (r.inserted) receiptsInserted++;
    itemsInserted += r.itemsInserted;
  }

  const { matched, ambiguous, unmatched } = await matchAndLink(userId, queryFn);

  // Персистимо факт УСПІШНОГО завершення: sync без нових чеків теж оновлює
  // «Останнє оновлення» в UI (MAX(created_at) по чеках цього не вміє).
  //
  // Тим самим запитом ГАСИМО слід останнього провалу. Без цього плашка
  // «синк зламано» лишалась би висіти після того, як усе полагодилось —
  // а хибна тривога знецінює сигнал швидше, ніж його відсутність.
  await queryFn(
    `UPDATE silpo_connection
        SET last_sync_at = NOW(),
            last_failed_at = NULL,
            last_error_code = NULL,
            updated_at = NOW()
      WHERE user_id = $1`,
    [userId],
    { op: "silpo_connection_touch_last_sync" },
  );

  logger.info({
    msg: "silpo.sync.completed",
    offlinePulled: call.data.offline.length,
    onlinePulled: call.data.online.length,
    receiptsInserted,
    itemsInserted,
    matched,
    ambiguous,
    unmatched,
  });

  return {
    status: "connected",
    offlinePulled: call.data.offline.length,
    onlinePulled: call.data.online.length,
    receiptsInserted,
    itemsInserted,
    matched,
    ambiguous,
    unmatched,
  };
}

// Write path (DB upsert + transaction runner) lives in `receiptsUpsert.ts`
// (Hard Rule #18) — re-exported so callers and existing tests keep importing
// from `./receipts.js`.
export {
  defaultWithTransaction,
  upsertReceipt,
  type SilpoTransactionRunner,
} from "./receiptsUpsert.js";

// Read paths live in `receiptsRead.ts` (Hard Rule #18), re-exported here.
export {
  listReceipts,
  getReceiptDetail,
  unlinkReceiptFromTransaction,
  relinkReceiptToTransaction,
  type ReceiptsPage,
  type ReceiptSummaryRow,
} from "./receiptsRead.js";

// Re-exported for tests exercising internals without a DB.
export const __test__ = {
  normalizeRawOrder,
  normalizeRawItem,
  upsertReceipt,
  defaultWithTransaction,
};
