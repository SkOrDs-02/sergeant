/**
 * Unit tests for the `sergeant-design/no-raw-motion-value` rule.
 *
 * Правило тримає прохід П5 (анти-слоп §4): токени руху існують у
 * `theme.css` і прокинуті в Tailwind, але сирі `duration-200` / `ease-out`
 * лишаються валідними класами — тобто без гейта наступний автор напише їх
 * не зі зла, а тому, що воно працює. Саме так і накопичились 141 літерал
 * у пʼяти значеннях проти двох через токен.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();

const RULE_ID = "sergeant-design/no-raw-motion-value";

function lint(code) {
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: "error" },
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  });
}

describe("no-raw-motion-value", () => {
  it("пропускає токени тривалості й кривої", () => {
    for (const cls of [
      "transition-colors duration-base ease-standard",
      "duration-instant",
      "duration-slower hover:duration-fast",
      "ease-decelerate",
      "ease-emphasized ease-overshoot ease-accelerate",
    ]) {
      assert.equal(lint(`const a = "${cls}";`).length, 0, cls);
    }
  });

  it("не чіпає класи, що лише схожі на рух", () => {
    for (const cls of [
      "grid-cols-2 gap-2",
      "leading-none",
      // `ease-standard` починається з `ease-`, але це токен, не дефолт.
      "ease-standard",
    ]) {
      assert.equal(lint(`const a = "${cls}";`).length, 0, cls);
    }
  });

  it("ловить сиру тривалість — і з префіксом варіанта теж", () => {
    for (const cls of [
      "transition duration-200",
      "duration-300",
      "hover:duration-500",
      "motion-safe:duration-700",
    ]) {
      assert.equal(lint(`const a = "${cls}";`).length, 1, cls);
    }
  });

  it("ловить браузерні дефолтні криві", () => {
    for (const cls of [
      "transition ease-out",
      "ease-in",
      "ease-in-out",
      "ease-linear",
    ]) {
      assert.equal(lint(`const a = "${cls}";`).length, 1, cls);
    }
  });

  it("ловить довільне значення в дужках", () => {
    assert.equal(lint('const a = "duration-[230ms]";').length, 1);
  });

  it("бачить класи всередині шаблонного рядка", () => {
    assert.equal(lint("const a = `transition ease-in-out ${x}`;").length, 1);
  });
});
