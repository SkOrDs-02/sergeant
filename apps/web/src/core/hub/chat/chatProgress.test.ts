import { describe, expect, it } from "vitest";
import { MULTI_TOOL_STEP_LABEL, describeToolStep } from "./chatProgress";

describe("describeToolStep", () => {
  it("один інструмент дає його підпис з каталогу", () => {
    expect(describeToolStep(["find_transaction"])).toBe("Шукаю операцію");
  });

  it("кілька викликів того самого інструмента дають той самий підпис", () => {
    expect(describeToolStep(["log_meal", "log_meal"])).toBe("Записую їжу");
  });

  it("різні інструменти в одному ході дають загальний підпис, а не перший", () => {
    expect(describeToolStep(["find_transaction", "change_category"])).toBe(
      MULTI_TOOL_STEP_LABEL,
    );
  });

  it("порожній батч або невідомий інструмент дають null (нейтральний підпис)", () => {
    expect(describeToolStep([])).toBeNull();
    expect(describeToolStep(["no_such_tool"])).toBeNull();
  });
});
