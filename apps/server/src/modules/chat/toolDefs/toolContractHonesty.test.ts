import { describe, expect, it } from "vitest";

import { CROSS_MODULE_TOOLS } from "./crossModule.js";
import { FIZRUK_TOOLS } from "./fizruk.js";
import { MEMORY_TOOLS } from "./memory.js";
import { NUTRITION_TOOLS } from "./nutrition.js";
import { ROUTINE_TOOLS } from "./routine.js";
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
  it("forget: видаляє лише за id з my_profile, текст факту не обіцяє (2026-11-18)", () => {
    // Виконавець (`crossActions/memoryHandlers.ts`) шукає факт за точним id.
    // Опис обіцяв «або текст факту для пошуку», і модель слухняно клала текст
    // у `fact_id`: усі шість прогонів стенду 2026-11-18, на обох глибинах.
    const tool = find(MEMORY_TOOLS, "forget");
    const factId = tool.input_schema.properties["fact_id"]?.description ?? "";
    expect(factId).not.toMatch(/текст факту для пошуку/);
    expect(`${tool.description} ${factId}`).toMatch(/my_profile/);
  });

  it("plan_workout: не обіцяє зберегти повторення (2026-11-18)", () => {
    // `planWorkout` сіє незараховані рядки (`reps: 0`): у план лягають лише
    // підходи й вага, повтори з запиту не записуються.
    const tool = find(FIZRUK_TOOLS, "plan_workout") as unknown as {
      description: string;
      input_schema: {
        properties: {
          exercises: {
            description: string;
            items: { properties: Record<string, { description: string }> };
          };
        };
      };
    };
    expect(tool.description).not.toMatch(/повтореннями/);
    const reps =
      tool.input_schema.properties.exercises.items.properties["reps"]
        ?.description ?? "";
    expect(reps).toMatch(/не записуються/);
    // Секунди плану так само не записуються: рядок із ними вже зарахований.
    const seconds =
      tool.input_schema.properties.exercises.items.properties["seconds"]
        ?.description ?? "";
    expect(seconds).toMatch(/не записуються/);
  });

  it("log_set: підхід на повтори, час або дистанцію, reps не обовʼязкове (тип виміру, зріз 7)", () => {
    const tool = find(FIZRUK_TOOLS, "log_set") as unknown as {
      input_schema: {
        properties: Record<string, { type: string }>;
        required: string[];
      };
    };
    expect(tool.input_schema.required).toEqual(["exercise_name"]);
    expect(tool.input_schema.properties["duration_sec"]?.type).toBe("number");
    expect(tool.input_schema.properties["distance_m"]?.type).toBe("number");
  });

  it("pause_habit: день паузи за календарем пристрою, не Europe/Kyiv (ADR-0078)", () => {
    const tool = find(ROUTINE_TOOLS, "pause_habit");
    const text = JSON.stringify(tool);
    expect(text).not.toMatch(/Europe\/Kyiv/);
  });

  it("archive_habit та інші: habit_id веде до query_habits, назва не є id (2026-11-18)", () => {
    for (const name of ["archive_habit", "edit_habit", "pause_habit"]) {
      const d =
        find(ROUTINE_TOOLS, name).input_schema.properties["habit_id"]
          ?.description ?? "";
      expect(d, name).toMatch(/query_habits/);
      expect(d, name).toMatch(/не є id/);
    }
  });
  it("log_meal: вага в грамах необовʼязкова, модель її не вигадує (комора з чату, 2026-11-19)", () => {
    const tool = find(NUTRITION_TOOLS, "log_meal") as unknown as {
      input_schema: {
        properties: Record<string, { type: string; description: string }>;
        required: string[];
      };
    };
    const amount = tool.input_schema.properties["amount_g"];
    expect(amount?.type).toBe("number");
    expect(tool.input_schema.required).not.toContain("amount_g");
    // Без ваги виконавець не пропонує списання з комори, тож вигадана вага
    // дала б пропозицію списати те, чого людина не казала.
    expect(amount?.description).toMatch(/не вигадуй/i);
  });
});
