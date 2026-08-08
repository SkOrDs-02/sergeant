/**
 * Unit tests for the `sergeant-design/no-raw-type-size` rule.
 *
 * Правило закриває атрактор 8 (анти-слоп §3.2, аудит 2026-08-08).
 * Формулювання існувало давно — П4, пункт 5 — але лишалось прозою, тож
 * набралось 300 сирих розмірів у 116 файлах поруч із 2062 семантичними
 * ролями.
 *
 * Рівень у конфігу — `warn`, бо заміна не механічна: `text-style-label`
 * це clamp(13→14px) плюс вага 500, а `text-sm` — рівно 14px з
 * успадкованою вагою. Тест перевіряє детекцію, а не рівень.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-raw-type-size";

function lint(code) {
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: "error" },
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  });
}

describe("no-raw-type-size", () => {
  it("пропускає семантичні ролі", () => {
    for (const cls of [
      "text-style-caption",
      "text-style-label text-muted",
      "text-style-display tabular-nums",
      "text-style-overline",
    ]) {
      assert.equal(
        lint(`const c = "${cls}";`).length,
        0,
        `не мало б скаржитись: ${cls}`,
      );
    }
  });

  it("не плутає розмір із кольором чи вирівнюванням", () => {
    // Найлегший спосіб зіпсувати таке правило — зловити `text-success`
    // чи `text-start`. Межа слова після розміру обовʼязкова.
    for (const cls of [
      "text-success text-center",
      "text-subtle",
      "text-start",
      "text-balance",
      "text-transparent",
      "text-ellipsis",
    ]) {
      assert.equal(
        lint(`const c = "${cls}";`).length,
        0,
        `не мало б скаржитись: ${cls}`,
      );
    }
  });

  it("ловить сирі розміри", () => {
    for (const cls of [
      "text-xs",
      "text-sm text-muted",
      "text-base",
      "text-lg font-semibold",
      "text-2xl",
    ]) {
      assert.equal(
        lint(`const c = "${cls}";`).length,
        1,
        `мало б спіймати: ${cls}`,
      );
    }
  });

  it("ловить під варіантами й з `!`", () => {
    for (const cls of ["sm:text-lg", "dark:text-sm", "hover:text-base"]) {
      assert.equal(
        lint(`const c = "${cls}";`).length,
        1,
        `мало б спіймати: ${cls}`,
      );
    }
  });

  it("ловить у template literal", () => {
    const msgs = lint("const c = `flex ${x} text-sm`;");
    assert.equal(msgs.length, 1);
  });

  it("повідомлення називає заміну, а не лише заборону", () => {
    const [msg] = lint('const c = "text-sm";');
    assert.match(msg.message, /text-style-/);
  });
});
