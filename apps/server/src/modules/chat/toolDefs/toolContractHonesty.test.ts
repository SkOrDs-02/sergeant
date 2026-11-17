import { describe, expect, it } from "vitest";

import { CROSS_MODULE_TOOLS } from "./crossModule.js";
import { FIZRUK_TOOLS } from "./fizruk.js";
import { MEMORY_TOOLS } from "./memory.js";
import { TOOLS } from "../tools.js";

/**
 * Модельний контракт тулу мусить збігатися з тим, що тул реально робить
 * (аудит модулів 2026-11-17 § 5.4). Модель вірить опису: обіцянка, якої код не
 * виконує, коштує ходу й вводить людину в оману.
 */
function find(tools: readonly { name: string }[], name: string) {
  const tool = tools.find((t) => t.name === name) as
    | {
        description: string;
        input_schema: { properties: Record<string, { description: string }> };
      }
    | undefined;
  if (!tool) throw new Error(`немає тулу ${name}`);
  return tool;
}

describe("чесність опису тулів (аудит 2026-11-17 § 5.4)", () => {
  it("recall_memory: sources лише ті, що приймає сервер (digest, profile, legacy)", () => {
    const tool = find(MEMORY_TOOLS, "recall_memory");
    const text = `${tool.description} ${tool.input_schema.properties["sources"]?.description}`;
    // Сервер відповідає 400 на ці значення з 2026-09-03 (ініціатива 0024).
    for (const retired of [
      "chat",
      "finyk",
      "fizruk",
      "nutrition",
      "routine",
      "journal",
    ]) {
      expect(text, `згадано знятий source «${retired}»`).not.toMatch(
        new RegExp(`\\b${retired}\\b`),
      );
    }
    expect(text).toMatch(/digest/);
    expect(text).toMatch(/profile/);
  });

  it("set_goal: не обіцяє комплексну ціль, лише ккал/день", () => {
    const tool = find(CROSS_MODULE_TOOLS, "set_goal");
    expect(tool.description).not.toMatch(/комплексн/i);
    expect(tool.description).toMatch(/ккал/i);
    const kcal = tool.input_schema.properties["daily_kcal"]?.description ?? "";
    expect(kcal).not.toMatch(/порахує/i);
  });

  it("add_program_day: тул прибрано з реєстру (рішення 2026-10-20)", () => {
    expect(FIZRUK_TOOLS.map((t) => t.name)).not.toContain("add_program_day");
    expect(TOOLS.map((t) => t.name)).not.toContain("add_program_day");
  });
});
