/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Звірка ЖИВОЇ специфікації тул Сільпо з тим, на що спирається наш код.
 *
 * Існує через конкретну поразку. 2026-09-14 Сільпо мовчки знизили максимум
 * `limit` у `silpo_get_my_online_orders` зі 100 до 50. Синк просив рівно
 * 100 і перестав працювати — на два тижні, непомітно: чеки просто не
 * оновлювались, а помилка виглядала як «Сільпо змінили формат відповіді».
 *
 * **Чому снапшот-тест цього не зловив.** Він звіряє код із ЗАФІКСОВАНОЮ
 * фікстурою (`__fixtures__/tools-list.json`, капчур 18 серпня). Тобто
 * ловить, коли розходимось МИ. Коли розходиться сам сервер, фікстура й код
 * лишаються в згоді між собою, і тест зелений. Це межа методу, а не його
 * поломка: статичний запис не може знати про зміну на чужому боці.
 *
 * Тут — друга половина пояса: та сама таблиця очікувань, але звірена з
 * ЖИВИМ `tools/list`. Вона відповідає на питання, якого снапшот не ставить:
 * «чи приймає Сільпо СЬОГОДНІ те, що ми шлемо?»
 *
 * Перевіряються рівно ті властивості, зламом яких ламається синк:
 *   1. тула існує;
 *   2. кожен аргумент, який ми шлемо, ще є в її схемі;
 *   3. числові значення, які ми шлемо, вкладаються в `minimum`/`maximum`;
 *   4. кожен ОБОВʼЯЗКОВИЙ аргумент схеми ми справді шлемо — нова вимога з
 *      їхнього боку ламає виклик так само надійно, як знижена стеля.
 */
import type { McpToolsList } from "./mcpClient.js";
import {
  OFFLINE_ORDERS_LIMIT,
  ONLINE_ORDERS_PAGE_SIZE,
} from "./orderLimits.js";

/** Що саме код шле в тулу — джерело правди для звірки. */
export interface ToolExpectation {
  tool: string;
  /**
   * Аргументи виклику. Числа звіряються з `minimum`/`maximum` схеми;
   * рядки — лише на існування поля (діапазонів у них немає).
   */
  sends: Readonly<Record<string, number | string>>;
}

/**
 * Очікування по тулах, які реально викликає синк.
 *
 * Значення беруться з констант виклику, а не переписуються числом: інакше
 * таблиця розійдеться з кодом рівно так само тихо, як розійшлась фікстура
 * з сервером.
 */
export const SILPO_TOOL_EXPECTATIONS: readonly ToolExpectation[] = [
  {
    tool: "silpo_get_my_online_orders",
    sends: { limit: ONLINE_ORDERS_PAGE_SIZE, offset: 0 },
  },
  {
    tool: "silpo_get_my_offline_orders",
    sends: {
      branchId: "<uuid>",
      deliveryType: "<type>",
      timeslotStart: "<iso>",
      timeslotEnd: "<iso>",
      limit: OFFLINE_ORDERS_LIMIT,
    },
  },
];

interface JsonSchemaProp {
  minimum?: number;
  maximum?: number;
}

interface ToolInputSchema {
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
}

/**
 * Розбіжності між живою схемою і тим, що шле код. Порожній масив —
 * контракт цілий.
 *
 * Повертає готові людські рядки: єдиний споживач — діагноз, який їх
 * показує, і алерт, який їх логує. Структурувати нема для кого.
 */
export function diffToolContract(
  tools: McpToolsList,
  expectations: readonly ToolExpectation[] = SILPO_TOOL_EXPECTATIONS,
): string[] {
  const byName = new Map(tools.tools.map((t) => [t.name, t]));
  const drifts: string[] = [];

  for (const expectation of expectations) {
    const tool = byName.get(expectation.tool);
    if (!tool) {
      drifts.push(`тула «${expectation.tool}» зникла`);
      continue;
    }

    const schema = (tool as { inputSchema?: ToolInputSchema }).inputSchema;
    const props = schema?.properties ?? {};
    const sentNames = Object.keys(expectation.sends);

    for (const [arg, value] of Object.entries(expectation.sends)) {
      const prop = props[arg];
      if (!prop) {
        drifts.push(`${expectation.tool}: аргумент «${arg}» зник зі схеми`);
        continue;
      }
      if (typeof value !== "number") continue;
      if (prop.maximum !== undefined && value > prop.maximum) {
        drifts.push(
          `${expectation.tool}: шлемо ${arg}=${value}, а стеля тепер ${prop.maximum}`,
        );
      }
      if (prop.minimum !== undefined && value < prop.minimum) {
        drifts.push(
          `${expectation.tool}: шлемо ${arg}=${value}, а мінімум тепер ${prop.minimum}`,
        );
      }
    }

    for (const required of schema?.required ?? []) {
      if (!sentNames.includes(required)) {
        drifts.push(
          `${expectation.tool}: зʼявився обовʼязковий аргумент «${required}», якого ми не шлемо`,
        );
      }
    }
  }

  return drifts;
}
