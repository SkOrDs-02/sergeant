import { describe, expect, it } from "vitest";
import {
  ASSISTANT_CAPABILITIES,
  getCapabilityServerTool,
  getToolProgressLabel,
} from "./assistantCatalogue";
import { ALL_HUBCHAT_TOOL_NAMES } from "../hubchat/toolNames";

/**
 * С-1 (б), рішення власника 2026-11-18 (OD-30): поки клієнт виконує
 * інструменти першого ходу, бульбашка очікування в чаті каже, що саме
 * робить Сержант. Підпис береться з каталогу асистента, а не з другого
 * словника, тож каталог мусить мати його для КОЖНОГО інструмента реєстру.
 */
describe("getToolProgressLabel", () => {
  it("має підпис для кожного інструмента реєстру чату", () => {
    const missing = ALL_HUBCHAT_TOOL_NAMES.filter(
      (name) => getToolProgressLabel(name) === null,
    );
    expect(missing).toEqual([]);
  });

  it("повертає людську дію за іменем інструмента", () => {
    expect(getToolProgressLabel("find_transaction")).toBe("Шукаю операцію");
    expect(getToolProgressLabel("log_meal")).toBe("Записую їжу");
  });

  it("невідоме імʼя дає null, а не вигаданий крок", () => {
    expect(getToolProgressLabel("no_such_tool")).toBeNull();
    expect(getToolProgressLabel("")).toBeNull();
  });

  it("підписи короткі (влазять в один рядок бульбашки) і без крапки в кінці", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      if (c.progressLabel === undefined) continue;
      expect(c.progressLabel.length, c.id).toBeLessThanOrEqual(30);
      expect(c.progressLabel.trim(), c.id).toBe(c.progressLabel);
      expect(c.progressLabel, c.id).not.toMatch(/[.…!]$/);
    }
  });

  it("сценарії без інструмента (лише промпт) підпису кроку не мають", () => {
    for (const c of ASSISTANT_CAPABILITIES) {
      if (getCapabilityServerTool(c) === null) {
        expect(c.progressLabel, c.id).toBeUndefined();
      }
    }
  });
});
