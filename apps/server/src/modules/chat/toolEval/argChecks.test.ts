/**
 * Перевірка аргументів на укус.
 *
 * На записаній касеті ці перевірки мовчать: модель заповнює аргументи чисто.
 * Мовчазна перевірка й непрацююча перевірка виглядають однаково, тому кожен
 * тип порушення тут навмисно спричиняється синтетичним викликом. Без цього
 * файлу «нуль порушень» означав би «не знаю».
 */

import { describe, expect, it } from "vitest";

import type { ToolCase } from "../toolSelectionCases/index.js";
import { expectedArgViolations, schemaViolations } from "./argChecks.js";

function call(name: string, input: Record<string, unknown>) {
  return [{ type: "tool_use", id: "tu_1", name, input }];
}

const kinds = (violations: { kind: string }[]) => violations.map((v) => v.kind);

describe("механічні перевірки зі схеми", () => {
  it("ловить пропущене обовʼязкове поле", () => {
    // `create_reminder` вимагає habit_id і time.
    expect(
      kinds(schemaViolations(call("create_reminder", { time: "09:00" }))),
    ).toEqual(["required"]);
  });

  it("ловить поле, якого немає в схемі", () => {
    const v = schemaViolations(
      call("convert_units", { value: 1, from: "kg", to: "lb", precision: 2 }),
    );
    expect(kinds(v)).toEqual(["unknown"]);
    expect(v[0]?.field).toBe("precision");
  });

  it("ловить рядок там, де схема чекає число", () => {
    // Класика tool-use: «250» замість 250. Виконавець отримає NaN.
    const v = schemaViolations(call("create_transaction", { amount: "250" }));
    expect(kinds(v)).toEqual(["type"]);
  });

  it("ловить значення поза enum", () => {
    const v = schemaViolations(
      call("set_budget_limit", {
        category_id: "cat_x",
        limit: 100,
        period: "рік",
      }),
    );
    expect(kinds(v)).toEqual(["enum"]);
  });

  it("ловить дату не у форматі YYYY-MM-DD", () => {
    const v = schemaViolations(
      call("add_calendar_event", { name: "ДН", date: "15 вересня" }),
    );
    expect(kinds(v)).toEqual(["date"]);
  });

  it("ловить час не у форматі HH:MM", () => {
    const v = schemaViolations(
      call("create_reminder", { habit_id: "hab_water", time: "9 ранку" }),
    );
    expect(kinds(v)).toEqual(["time"]);
  });

  it("не приймає одиниці конвертації за дати", () => {
    // Перша версія перевірки розпізнавала дати за назвою поля і рахувала
    // `from: "kg"` зіпсованою датою. Ознака формату тепер зі схеми.
    expect(
      schemaViolations(
        call("convert_units", { value: 82, from: "kg", to: "lb" }),
      ),
    ).toEqual([]);
  });

  it("мовчить на правильному виклику", () => {
    expect(
      schemaViolations(
        call("create_reminder", { habit_id: "hab_water", time: "09:00" }),
      ),
    ).toEqual([]);
  });
});

describe("очікування кейса", () => {
  const withExpectations: ToolCase = {
    name: "синтетичне очікування",
    user: "Запиши витрату 250 грн на таксі",
    accept: ["create_transaction"],
    expectArgs: {
      create_transaction: { amount: 250, category: ["транспорт", "transport"] },
    },
  };

  it("ловить копійки замість гривень", () => {
    const v = expectedArgViolations(
      withExpectations,
      call("create_transaction", { amount: 25000, category: "транспорт" }),
    );
    expect(v).toHaveLength(1);
    expect(v[0]?.detail).toContain("25000");
  });

  it("приймає будь-яке значення зі списку прийнятних", () => {
    expect(
      expectedArgViolations(
        withExpectations,
        call("create_transaction", { amount: 250, category: "transport" }),
      ),
    ).toEqual([]);
  });

  it("ловить пропущене очікуване поле", () => {
    const v = expectedArgViolations(
      withExpectations,
      call("create_transaction", { amount: 250 }),
    );
    expect(kinds(v)).toEqual(["expected"]);
  });

  it("мовчить про інструмент, якого модель не викликала", () => {
    // Промах вибору вже зарахований окремо; рахувати ту саму поразку двічі
    // означало б зробити число неспівставним між кейсами.
    expect(
      expectedArgViolations(withExpectations, call("query_transactions", {})),
    ).toEqual([]);
  });
});
