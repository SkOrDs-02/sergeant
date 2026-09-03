// scripts/docs/__tests__/lint-spec-shape.test.mjs
//
// Unit tests for the `lint:specs` CI gate.
// Run with: node --test scripts/docs/__tests__/lint-spec-shape.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  diffAgainstBaseline,
  missingSections,
  normalizeHeading,
  planBaselineUpdate,
  skipReason,
} from "../lint-spec-shape.mjs";

const FULL_SPEC = [
  "# SPEC: приклад",
  "",
  "## Проблема",
  "## Мета",
  "## Поверхня змін",
  "## Поза скоупом v1",
  "## Верифікація (обовʼязково)",
].join("\n");

describe("normalizeHeading", () => {
  // Три апострофи (U+02BC / U+2019 / U+0027) реально трапляються в
  // specs/ упереміш — без нормалізації гейт ловив би друкарську
  // варіативність замість відсутньої секції.
  it("зводить усі три апострофи до однієї форми", () => {
    const variants = [
      "Верифікація (обовʼязково)",
      "Верифікація (обов’язково)",
      "Верифікація (обов'язково)",
    ].map(normalizeHeading);
    assert.deepEqual(variants, ["верифікація", "верифікація", "верифікація"]);
  });

  it("знімає версійний суфікс і хвіст у дужках", () => {
    assert.equal(normalizeHeading("Поза скоупом v1"), "поза скоупом");
    assert.equal(normalizeHeading("Мета (робоча)"), "мета");
  });
});

describe("missingSections", () => {
  it("повна спека не має пропусків", () => {
    assert.deepEqual(missingSections(FULL_SPEC), []);
  });

  it("називає рівно ті секції, яких бракує", () => {
    const source = "## Проблема\n## Мета\n";
    assert.deepEqual(missingSections(source), ["Поза скоупом", "Верифікація"]);
  });

  it("приймає англійський варіант «Out of scope»", () => {
    const source = "## Проблема\n## Мета\n## Out of scope\n## Верифікація\n";
    assert.deepEqual(missingSections(source), []);
  });

  it("приймає дописане уточнення після назви секції", () => {
    const source =
      "## Проблема\n## Мета\n## Поза скоупом — і чому саме так\n## Верифікація\n";
    assert.deepEqual(missingSections(source), []);
  });

  // Знахідка ревʼю: голий `startsWith` пускав сусідню секцію з довшою
  // назвою замість обовʼязкової, і спека проходила гейт без неї.
  it("не зараховує близьку назву замість обовʼязкової секції", () => {
    const source =
      "## Проблематика\n## Метадані\n## Поза скоупом\n## Верифікація\n";
    assert.deepEqual(missingSections(source), ["Проблема", "Мета"]);
  });

  it("але приймає назву з уточненням через межу", () => {
    const source =
      "## Проблема: чому зараз\n## Мета — вимірювана\n## Поза скоупом\n## Верифікація\n";
    assert.deepEqual(missingSections(source), []);
  });

  // Заголовок третього рівня не рахується за секцію: інакше «### Мета»
  // всередині чужого розділу закривала б вимогу, не даючи структури.
  it("не зараховує заголовки нижчого рівня", () => {
    const source = "## Проблема\n### Мета\n## Поза скоупом\n## Верифікація\n";
    assert.deepEqual(missingSections(source), ["Мета"]);
  });
});

describe("skipReason", () => {
  it("читає оголошення з шапки разом із причиною", () => {
    const source =
      "# Тексти\n\n> **Status:** Active\n> **Spec-lint:** skip — контент-план, не спека\n";
    assert.equal(skipReason(source), "контент-план, не спека");
  });

  it("оголошення без причини не рахується", () => {
    assert.equal(skipReason("> **Spec-lint:** skip\n"), null);
  });

  it("документ без оголошення перевіряється як спека", () => {
    assert.equal(skipReason(FULL_SPEC), null);
  });

  // Знахідка ревʼю: рядок потрібної форми будь-де в тілі глушив перевірку
  // всього документа. Шапка говорить про документ, тіло — про предмет.
  it("оголошення в ТІЛІ не рахується, лише в шапці", () => {
    const source = [
      "# Спека",
      "",
      "> **Status:** Active",
      "",
      "## Проблема",
      "",
      "Приклад того, як документ оголошує себе не-спекою:",
      "",
      "> **Spec-lint:** skip — це лише цитата в тілі",
    ].join("\n");
    assert.equal(skipReason(source), null);
  });

  it("документ без жодної секції має шапкою весь текст", () => {
    const source = "# Тексти\n\n> **Spec-lint:** skip — контент-план\n";
    assert.equal(skipReason(source), "контент-план");
  });
});

describe("diffAgainstBaseline", () => {
  it("успадкований пропуск із baseline не валить збірку", () => {
    const { added, stale } = diffAgainstBaseline(
      { "legacy.md": ["Мета"] },
      { "legacy.md": ["Мета"] },
    );
    assert.deepEqual(added, []);
    assert.deepEqual(stale, []);
  });

  it("новий пропуск у файлі, що вже в baseline, ловиться", () => {
    const { added } = diffAgainstBaseline(
      { "legacy.md": ["Мета", "Верифікація"] },
      { "legacy.md": ["Мета"] },
    );
    assert.deepEqual(added, [{ file: "legacy.md", section: "Верифікація" }]);
  });

  it("пропуск у новому файлі ловиться", () => {
    const { added } = diffAgainstBaseline({ "fresh.md": ["Верифікація"] }, {});
    assert.deepEqual(added, [{ file: "fresh.md", section: "Верифікація" }]);
  });

  // Храповик крутиться лише вниз: коли пропуск закрито, запис у baseline
  // мусить зникнути, інакше він тихо дозволяє регресію назад.
  it("закритий пропуск лишає протухлий запис, і це помилка", () => {
    const { added, stale } = diffAgainstBaseline({}, { "legacy.md": ["Мета"] });
    assert.deepEqual(added, []);
    assert.deepEqual(stale, [{ file: "legacy.md", section: "Мета" }]);
  });
});

// Знахідка ревʼю: `--update` писав поточний стан, тож ним можна було
// узаконити щойно прибрану секцію замість полагодити спеку.
describe("planBaselineUpdate", () => {
  it("відхиляє оновлення, що додає новий виняток", () => {
    const plan = planBaselineUpdate({ "a.md": ["Мета"] }, {});
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.added, [{ file: "a.md", section: "Мета" }]);
  });

  it("відхиляє і тоді, коли файл уже в baseline, але пропусків побільшало", () => {
    const plan = planBaselineUpdate(
      { "a.md": ["Мета", "Верифікація"] },
      { "a.md": ["Мета"] },
    );
    assert.equal(plan.ok, false);
  });

  it("дозволяє зняття винятку і називає, що саме знято", () => {
    const plan = planBaselineUpdate({}, { "a.md": ["Мета"] });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.removed, [{ file: "a.md", section: "Мета" }]);
  });

  it("дозволяє оновлення без змін", () => {
    const plan = planBaselineUpdate({ "a.md": ["Мета"] }, { "a.md": ["Мета"] });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.removed, []);
  });
});
