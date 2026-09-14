/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * Самообслуговна діагностика інтеграції Сільпо.
 *
 * Існує через конкретну поразку: `SILPO_SCHEMA_DRIFT` віддає людині одну
 * копію («Сільпо змінили формат відповіді») на кілька різних причин, а
 * причину пише лише в серверний лог. Власник продукту в Coolify-логи не
 * лазить, тож питання «що саме там змінили?» лишалось без відповіді навіть
 * тоді, коли відповідь у системі була (звіт 2026-09-13).
 *
 * Віддає рівно два шари доказів:
 *   1. **Контракт tools** — які з потрібних тул ще існують. Перейменування
 *      чи зникнення видно одразу, і це буквально «що змінили Сільпо».
 *      Той самий список, що його пінить снапшот-тест
 *      `mcpClient.tools-list-snapshot.test.ts`.
 *   2. **Проба виклику** — форма відповіді `silpo_get_my_online_orders`:
 *      ключі результату, `isError` з текстом відмови, чи дістався payload
 *      і які в нього ключі.
 *
 * ФОРМА, не вміст: імена ключів, типи content-блоків і лічильники. Жодного
 * поля покупки (Hard Rule #21) — діагностика не має права стати другим
 * каналом витоку чекових даних.
 */
import {
  listMcpTools,
  probeMcpTool,
  type McpError,
  type McpToolProbe,
} from "./mcpClient.js";
import { callWithFreshAccessToken, type QueryFn } from "./tokenStore.js";
import { parseLimitCeilingFromRefusal } from "./receipts.js";
import { ONLINE_ORDERS_PAGE_SIZE } from "./orderLimits.js";
import { diffToolContract } from "./toolContract.js";

/**
 * Тули, на яких тримається інтеграція. Дзеркало списку з
 * `mcpClient.tools-list-snapshot.test.ts` — снапшот ловить дрейф у CI на
 * зафіксованому фікстурі, цей список ловить його на ЖИВОМУ сервері.
 */
const REQUIRED_TOOLS = [
  "silpo_get_my_offline_orders",
  "silpo_get_my_online_orders",
  "silpo_find_products_batch",
  "silpo_get_product_details",
  "silpo_get_my_shopping_cart",
  "silpo_get_shopping_cart_by_id",
  "silpo_list_branches",
] as const;

export interface SilpoDiagnosis {
  /** `null` — `tools/list` не вдався; помилка тоді в `toolsError`. */
  toolsTotal: number | null;
  toolsError: McpError | null;
  /** Потрібні тули, яких на живому сервері БІЛЬШЕ НЕМАЄ. */
  missingTools: string[];
  /** Проба `silpo_get_my_online_orders` з `limit: 1`. */
  onlineOrdersProbe: McpToolProbe;
  /**
   * Розбіжності живої специфікації тул із тим, що шле код: знижена стеля
   * аргументу, зниклий аргумент, нова обовʼязкова вимога. Порожньо —
   * контракт цілий.
   */
  contractDrift: string[];
  /** Однорядковий людський вердикт — що саме зламано. */
  verdict: string;
}

function buildVerdict(
  missingTools: readonly string[],
  probe: McpToolProbe,
  probeSmall: McpToolProbe,
  contractDrift: readonly string[] = [],
): string {
  // Найцінніший випадок: дрібний запит проходить, справжній — ні. Це не
  // «формат змінили», а межа обсягу, і назвати її треба першою.
  const smallOk = probeSmall.payloadExtracted && !probeSmall.isError;
  const bigBroken = !probe.payloadExtracted || probe.isError;
  if (smallOk && bigBroken) {
    // Відмова, яка САМА називає стелю, — це вже не збій: `fetchOnlineOrders`
    // читає з неї число і повторює сторінку меншою. Рапортувати такий стан
    // як поломку синку означало б відправити людину лагодити справне.
    const ceiling = probe.isError
      ? parseLimitCeilingFromRefusal(probe.refusal ?? "")
      : null;
    if (ceiling !== null) {
      return `Сільпо знизили стелю «limit» до ${ceiling} (синк стартує з ${ONLINE_ORDERS_PAGE_SIZE}). Це синк переживає сам — звужує сторінку до названої стелі й тягне решту наступними. Правити код треба лише якщо чеки все одно не приїжджають.`;
    }
    const why = probe.isError
      ? `відмова: «${probe.refusal ?? "без тексту"}»`
      : `payload не дістається, ключі ${JSON.stringify(probe.resultKeys)}`;
    return `Сільпо віддає 1 замовлення, але ламається на ${ONLINE_ORDERS_PAGE_SIZE} — ${why}. Синк просить сторінку саме такого розміру, звідси й збій.`;
  }
  if (missingTools.length > 0) {
    return `Сільпо прибрали або перейменували тули: ${missingTools.join(", ")}. Це справжній дрейф контракту.`;
  }
  // Далі — розбіжність специфікації. Порядок навмисний: зникла тула
  // фундаментальніша, бо без неї не працює нічого, і решта перевірок лише
  // повторила б це іншими словами. А от серед решти специфікація йде
  // ПЕРШОЮ: вона називає причину прямо, тоді як проби нижче показують
  // тільки наслідок. Саме цього бракувало 2026-09-14 — знижену стелю
  // `limit` довелось вичитувати з тексту відмови.
  if (contractDrift.length > 0) {
    return `Сільпо змінили специфікацію тул: ${contractDrift.join("; ")}.`;
  }
  if (probe.transportError) {
    return `Виклик не дійшов до результату: ${probe.transportError.kind} — ${probe.transportError.message}.`;
  }
  if (probe.isError) {
    return `Тула відпрацювала і ВІДМОВИЛА (не дрейф формату): «${probe.refusal ?? "без тексту"}».`;
  }
  if (!probe.payloadExtracted) {
    return `Результат прийшов, але payload не дістається: ключі ${JSON.stringify(probe.resultKeys)}. Це справжній дрейф формату.`;
  }
  if (probe.ordersCount === null) {
    return `Payload є, але поля «orders» у ньому немає — ключі ${JSON.stringify(probe.payloadKeys)}. Схоже на перейменування поля.`;
  }
  return `Все справне: тули на місці, відповідь розбирається, у вибірці ${probe.ordersCount} замовлень.`;
}

/**
 * Проганяє обидва шари під токеном користувача. Повертає `null`, коли
 * підключення взагалі немає або потребує повторної авторизації — цей стан
 * UI вже показує окремо, дублювати його діагнозом немає сенсу.
 */
export async function diagnoseSilpo(
  userId: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoDiagnosis | { unavailable: McpError["kind"] | "auth" }> {
  const call = await callWithFreshAccessToken(
    userId,
    async (accessToken) => {
      const tools = await listMcpTools(accessToken);
      // Проба мусить відтворювати ТОЙ САМИЙ виклик, що впав.
      //
      // Перша версія шукала `limit: 1` — дрібний запит, щоб не тягнути
      // зайвого. Через це 2026-09-14 діагноз сказав «Все справне: тули на
      // місці, відповідь розбирається, у вибірці 1 замовлень» рівно тоді,
      // коли синк падав: синк шле сторінку `ONLINE_ORDERS_PAGE_SIZE`, і
      // ламається саме на ній. Діагностика, яка виконує НЕ те, що
      // зламалось, гірша за її відсутність — вона відводить від причини.
      //
      // Береться САМЕ розмір сторінки, а не `ONLINE_ORDERS_LIMIT`: після
      // переходу на пагінацію синк ніколи не просить сотню одним запитом,
      // і проба сотнею рапортувала б збій там, де синк цілком справний.
      //
      // Тепер проби дві: дешева (1) і справжня (та, що в синку). Різниця
      // між ними САМА є діагнозом — вона називає межу, за якою Сільпо
      // перестає віддавати відповідь.
      const probeSmall = await probeMcpTool({
        accessToken,
        toolName: "silpo_get_my_online_orders",
        args: { limit: 1 },
      });
      const probe = await probeMcpTool({
        accessToken,
        toolName: "silpo_get_my_online_orders",
        args: { limit: ONLINE_ORDERS_PAGE_SIZE },
      });
      return { ok: true as const, data: { tools, probe, probeSmall } };
    },
    deps.query ? { query: deps.query } : {},
  );

  if (!call.ok) return { unavailable: call.error.kind as McpError["kind"] };

  const { tools, probe, probeSmall } = call.data;
  const names = tools.ok ? new Set(tools.data.tools.map((t) => t.name)) : null;
  const missingTools = names
    ? REQUIRED_TOOLS.filter((name) => !names.has(name))
    : [];

  const contractDrift = tools.ok ? diffToolContract(tools.data) : [];

  return {
    toolsTotal: tools.ok ? tools.data.tools.length : null,
    toolsError: tools.ok ? null : tools.error,
    missingTools,
    onlineOrdersProbe: probe,
    contractDrift,
    verdict: buildVerdict(missingTools, probe, probeSmall, contractDrift),
  };
}
