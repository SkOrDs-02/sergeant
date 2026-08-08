/**
 * Unit tests for the `sergeant-design/no-opacity-on-text-token` rule.
 *
 * Правило закриває атрактор 9 (анти-слоп §3.2, аудит 2026-08-08).
 * Значення `--c-subtle` / `--c-muted` підібрані рівно на порозі WCAG AA —
 * це записано в `theme.css` прямим текстом. Тому `/70` на них не стильове
 * рішення, а арифметичне падіння під поріг: subtle дає 4.88 на фоні
 * сторінки при 100% і 2.76 при /70.
 *
 * Головне, що тут перевіряється, — правило дивиться на МІСЦЕ
 * ВИКОРИСТАННЯ. Гейт контрасту в `design-tokens` перевіряє значення
 * токенів і проходить; композицію в className не бачить ніхто, і саме
 * цей розрив дав 37 сабконтрастних місць у проді.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-opacity-on-text-token";

function lint(code) {
  return linter.verify(code, {
    plugins: { "sergeant-design": plugin },
    rules: { [RULE_ID]: "error" },
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  });
}

describe("no-opacity-on-text-token", () => {
  it("пропускає токени без прозорості", () => {
    for (const cls of [
      "text-subtle",
      "text-muted text-style-caption",
      "text-danger-strong dark:text-danger",
      "text-success-strong",
    ]) {
      assert.equal(
        lint(`const c = "${cls}";`).length,
        0,
        `не мало б скаржитись: ${cls}`,
      );
    }
  });

  it("не чіпає прозорість на НЕ-текстових утилітах", () => {
    // Фон і рамка мають власний поріг (нетекстовий контраст 3:1) і
    // розводяться навмисно — `bg-success/10` це заливка, не текст.
    for (const cls of [
      "bg-success/10 border-line",
      "border-warning/60",
      "ring-focus/45",
      "bg-danger/10 text-danger-strong",
    ]) {
      assert.equal(
        lint(`const c = "${cls}";`).length,
        0,
        `не мало б скаржитись: ${cls}`,
      );
    }
  });

  it("ловить прозорість на кольоровому токені тексту", () => {
    for (const cls of [
      "text-subtle/70",
      "text-muted/80",
      "text-danger/60",
      "text-style-caption text-subtle/50",
    ]) {
      assert.equal(
        lint(`const c = "${cls}";`).length,
        1,
        `мало б спіймати: ${cls}`,
      );
    }
  });

  it("ловить під варіантами — саме там воно й ховається", () => {
    // Реальні місця в репо мають вигляд `dark:text-subtle/70`, тобто
    // регекс без урахування префіксів пропустив би половину.
    for (const cls of [
      "dark:text-subtle/70",
      "hover:text-muted/60",
      "sm:dark:text-danger/80",
      "placeholder:text-subtle/70",
    ]) {
      assert.equal(
        lint(`const c = "${cls}";`).length,
        1,
        `мало б спіймати: ${cls}`,
      );
    }
  });

  it("ловить у template literal, а не лише в рядку", () => {
    const msgs = lint("const c = `text-style-caption ${x} text-subtle/70`;");
    assert.equal(msgs.length, 1);
  });

  it("повідомлення пояснює причину, а не лише забороняє", () => {
    const [msg] = lint('const c = "text-subtle/70";');
    assert.match(msg.message, /WCAG AA/);
    assert.match(msg.message, /тихіший ТОКЕН/);
  });
});
