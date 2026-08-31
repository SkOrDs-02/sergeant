/**
 * Розбір вердикту судді.
 *
 * Найважливіше тут - третій стан. «Суддя не сказав нічого зрозумілого» це не
 * «суддя сказав погано»: злиття цих двох станів колись уже сталося у звіті
 * стенду моделей, де транспортні збої читались як провали моделі й давали
 * рядок «0/18» під цілком справною моделлю.
 */

import { describe, expect, it } from "vitest";

import { buildJudgePrompt, parseVerdict } from "./judge.js";
import type { ToolCase } from "../toolSelectionCases/index.js";

describe("розбір вердикту", () => {
  it("читає схвалення з причиною", () => {
    expect(parseVerdict("ОК: обрав пошук перед видаленням")).toEqual({
      ok: true,
      reason: "обрав пошук перед видаленням",
    });
  });

  it("читає відмову", () => {
    expect(parseVerdict("ПОГАНО: проігнорував другу частину прохання").ok).toBe(
      false,
    );
  });

  it("знаходить вердикт нижче за перший рядок", () => {
    // Перша версія брала лише перший рядок і віддала «без вердикту» на 37
    // кейсах із 81: модель регулярно починає порожнім рядком або службовою
    // фразою. Виглядало це як зламаний суддя, хоча судив він нормально.
    expect(parseVerdict("\n\nОцінка:\n**ОК**: розвідка перед дією").ok).toBe(
      true,
    );
  });

  it("не плутає невідомий формат із поганим вердиктом", () => {
    const v = parseVerdict("Важко сказати, залежить від контексту.");
    expect(v.ok).toBeNull();
    expect(v.reason).toContain("Важко сказати");
  });

  it("бере лише перший рядок і терпить тире замість двокрапки", () => {
    expect(parseVerdict("ОК - усе гаразд\nдодаткові міркування").reason).toBe(
      "усе гаразд",
    );
  });
});

describe("промпт судді", () => {
  const toolCase: ToolCase = {
    name: "синтетичний",
    user: "Видали ту витрату на каву",
    accept: ["delete_transaction"],
  };

  it("несе прохання, ходи й результати інструментів", () => {
    const prompt = buildJudgePrompt(toolCase, {
      name: toolCase.name,
      turns: [
        {
          blocks: [
            { type: "tool_use", id: "t1", name: "find_transaction", input: {} },
          ],
          fedResult: null,
        },
        {
          blocks: [{ type: "text", text: "Знайшов дві однакові." }],
          fedResult: "Знайдено 2: tx_9f21, tx_9f26",
        },
      ],
    });
    expect(prompt).toContain("Видали ту витрату на каву");
    expect(prompt).toContain("find_transaction");
    expect(prompt).toContain("tx_9f26");
    // Блок ДАНІ теж їде: без нього суддя не знає, що саме бачив асистент, і
    // судить вигадану ситуацію.
    expect(prompt).toContain("cat_groceries");
  });
});
