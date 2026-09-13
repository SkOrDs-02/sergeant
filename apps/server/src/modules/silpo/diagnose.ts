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
  /** Однорядковий людський вердикт — що саме зламано. */
  verdict: string;
}

function buildVerdict(
  missingTools: readonly string[],
  probe: McpToolProbe,
): string {
  if (missingTools.length > 0) {
    return `Сільпо прибрали або перейменували тули: ${missingTools.join(", ")}. Це справжній дрейф контракту.`;
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
      const probe = await probeMcpTool({
        accessToken,
        toolName: "silpo_get_my_online_orders",
        args: { limit: 1 },
      });
      return { ok: true as const, data: { tools, probe } };
    },
    deps.query ? { query: deps.query } : {},
  );

  if (!call.ok) return { unavailable: call.error.kind as McpError["kind"] };

  const { tools, probe } = call.data;
  const names = tools.ok ? new Set(tools.data.tools.map((t) => t.name)) : null;
  const missingTools = names
    ? REQUIRED_TOOLS.filter((name) => !names.has(name))
    : [];

  return {
    toolsTotal: tools.ok ? tools.data.tools.length : null,
    toolsError: tools.ok ? null : tools.error,
    missingTools,
    onlineOrdersProbe: probe,
    verdict: buildVerdict(missingTools, probe),
  };
}
