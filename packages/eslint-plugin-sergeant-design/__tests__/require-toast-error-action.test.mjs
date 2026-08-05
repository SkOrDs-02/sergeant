/**
 * Unit tests for the `sergeant-design/require-toast-error-action` rule.
 *
 * Правило вимагає recovery-дію `{ label, onClick }` на кожному
 * `toast.error(...)`. Однойменне правило існувало до ADR-0081 і було
 * retired із тезою «коректність дії залежить від сценарію й не має
 * надійного синтаксичного сигналу». Теза правильна — тому нова версія
 * НЕ намагається судити про якість дії: вона ловить лише факт її
 * відсутності, а винятки живуть у явному `allowlist` із причиною.
 * За пів року без гейта дію мали 3 з 37 error-тостів у `apps/web`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/require-toast-error-action";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(
  code,
  filename = abs("apps/web/src/core/profile/Foo.tsx"),
  options,
) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: options ? ["error", options] : "error" },
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    { filename },
  );
}

describe("require-toast-error-action", () => {
  it("прапорить `toast.error` без третього аргументу", () => {
    const messages = lint(`toast.error("Не вдалося оновити аватар");`);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("прапорить, коли передана лише тривалість", () => {
    assert.equal(lint(`toast.error("Впало", 5000);`).length, 1);
  });

  it("пропускає повний `{ label, onClick }`", () => {
    const code = `toast.error("Впало", undefined, { label: "Повторити", onClick: retry });`;
    assert.equal(lint(code).length, 0);
  });

  it("прапорить неповну дію — сам `label` без обробника", () => {
    assert.equal(
      lint(`toast.error("Впало", undefined, { label: "Повторити" });`).length,
      1,
    );
  });

  it("прапорить `onClick` без підпису на кнопці", () => {
    assert.equal(
      lint(`toast.error("Впало", undefined, { onClick: retry });`).length,
      1,
    );
  });

  it("довіряє змінній та spread — форму статично не прочитати", () => {
    assert.equal(lint(`toast.error("Впало", undefined, action);`).length, 0);
    assert.equal(
      lint(`toast.error("Впало", undefined, { ...base });`).length,
      0,
    );
  });

  it("ловить приймачів із будь-якою назвою, що містить `toast`", () => {
    assert.equal(lint(`currentToast.error("Впало");`).length, 1);
    assert.equal(lint(`this.toast.error("Впало");`).length, 1);
    // Optional chaining — саме через нього два виклики у
    // `useFinykBackupSync` пережили ручний grep-аудит.
    assert.equal(lint(`toast?.error("Впало");`).length, 1);
  });

  it("не чіпає `error` на сторонньому обʼєкті", () => {
    assert.equal(lint(`logger.error("Впало");`).length, 0);
    assert.equal(lint(`console.error("Впало");`).length, 0);
  });

  it("ловить голий `error()`, деструктурований з `useToast()`", () => {
    const code = `const { error } = useToast(); error("Впало");`;
    assert.equal(lint(code).length, 1);
  });

  it("поважає перейменування при деструктуризації", () => {
    const code = `const { error: showError } = useToast(); showError("Впало");`;
    assert.equal(lint(code).length, 1);
  });

  it("не чіпає голий `error()`, що прийшов не з `useToast()`", () => {
    const code = `const { error } = useQuery(); error("Впало");`;
    assert.equal(lint(code).length, 0);
  });

  it("звільняє файли з allowlist (suffix-match)", () => {
    const file = abs("apps/web/src/core/pricing/WaitlistForm.tsx");
    const opts = { allowlist: ["apps/web/src/core/pricing/WaitlistForm.tsx"] };
    assert.equal(lint(`toast.error("429");`, file, opts).length, 0);
    // Сусідній файл із того ж каталогу — не звільнений.
    const other = abs("apps/web/src/core/pricing/Other.tsx");
    assert.equal(lint(`toast.error("429");`, other, opts).length, 1);
  });

  it("звільняє тести і stories за конвенцією", () => {
    for (const p of [
      "apps/web/src/core/profile/Foo.test.tsx",
      "apps/web/src/core/profile/__tests__/Foo.tsx",
      "apps/web/src/shared/components/ui/Toast.stories.tsx",
    ]) {
      assert.equal(lint(`toast.error("Впало");`, abs(p)).length, 0, p);
    }
  });
});
