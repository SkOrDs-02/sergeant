// Тести для `sergeant-design/prefer-data-state` (Initiative 0011 Phase
// 2.9). Rule warn-only canary — підсвічує `if (X.isLoading|isError|
// isPending) return <…/>` ladder-патерни у `apps/web/src/modules/**`.
//
// `linter.verify()` тут використовується з flat-config-style options —
// rule mounts через `plugins`, опції передаються per-test. Шляхи —
// абсолютні POSIX-style, які rule нормалізує до `/apps/web/src/...`
// substring і використовує як scope-фільтр (без filesystem перевірок,
// тому temp-каталог тут НЕ потрібен — на відміну від
// `require-stories-for-ui-components`).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/prefer-data-state";

// ESLint flat config matches `files` glob relative to `process.cwd()`.
// Якщо filename — абсолютний шлях ПОЗА cwd (e.g. `/repo/apps/...`),
// ESLint видає "No matching configuration found" warning і rule НЕ
// запускається. Тому будуємо filename відносно поточного cwd —
// rule все одно паттерн-матчить `apps/web/src/modules/...` substring.
function fixturePath(rel) {
  return path.join(process.cwd(), rel);
}

function lint(code, relPath, options = []) {
  return linter
    .verify(
      code,
      {
        files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
        plugins: { "sergeant-design": plugin },
        rules: { [RULE_ID]: ["error", ...options] },
        languageOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
      },
      { filename: fixturePath(relPath) },
    )
    .filter((m) => m.ruleId !== null);
}

describe("sergeant-design/prefer-data-state", () => {
  // ─── BAD — flag manual ladder ─────────────────────────────────────────

  it("flags `if (q.isLoading) return <Skeleton/>` early-return ladder", () => {
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) return <Skeleton />;
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 1, "expected 1 message");
    assert.match(messages[0].message, /isLoading/);
    assert.match(messages[0].message, /<DataState>/);
  });

  it("flags `if (q.isError) return <ErrorBox/>` ladder", () => {
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isError) return <ErrorBox error={q.error} />;
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /isError/);
  });

  it("flags `if (isPending) return <Spinner/>` (RQ v5 alias)", () => {
    const code = `
      function MyPanel() {
        const { isPending, data } = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (isPending) return <Spinner />;
        return <div>{data}</div>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /isPending/);
  });

  it("flags blocked early-return: `if (q.isLoading) { return <X/>; }`", () => {
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) {
          return <Skeleton />;
        }
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 1);
  });

  it("flags compound test `if (q.isLoading || q.isError) return <X/>`", () => {
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading || q.isError) return <Skeleton />;
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 1);
  });

  it("flags unary `if (!q.isLoading) return <X/>` (still ladder, inverted)", () => {
    // Інверсія `!isLoading` — теж ladder, тому що control-flow змінено
    // через loading-flag. У реальному коді зустрічається rare-ly, але
    // якщо хтось напише такий patter — DataState виконає те ж саме.
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (!q.isLoading) return <div>{q.data}</div>;
        return <Skeleton />;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 1);
  });

  it("flags two ladders separately (loading + error)", () => {
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) return <Skeleton />;
        if (q.isError) return <ErrorBox />;
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 2);
  });

  // ─── GOOD — correct DataState usage / unrelated patterns ─────────────

  it("does NOT flag `<DataState query={q}>` adoption", () => {
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        return (
          <DataState query={q} skeleton={<Skeleton />}>
            {(data) => <div>{data}</div>}
          </DataState>
        );
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `disabled={isLoading}` button-disable pattern", () => {
    const code = `
      function MyForm() {
        const m = useMutation({ mutationFn: () => 1 });
        return <Button disabled={m.isLoading}>Save</Button>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Form.tsx");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `if (X.isLoading) doSideEffect()` (no JSX return)", () => {
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) {
          console.log("loading…");
        }
        return null;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag `if (other) return <X/>` (test ref doesn't include ladder name)", () => {
    const code = `
      function MyPanel() {
        const data = "hello";
        if (!data) return <Empty />;
        return <div>{data}</div>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 0);
  });

  // ─── SCOPE — only flag inside apps/web/src/modules/** ────────────────

  it("does NOT flag in `apps/web/src/shared/components/…`", () => {
    const code = `
      function SharedThing() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) return <Skeleton />;
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(
      code,
      "/repo/apps/web/src/shared/components/SharedThing.tsx",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag in DataState.tsx itself (allowlist)", () => {
    const code = `
      function DataState() {
        const q = arguments[0];
        if (q.isLoading) return <Skeleton />;
        return null;
      }
    `;
    const messages = lint(
      code,
      "/repo/apps/web/src/shared/components/ui/DataState.tsx",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag in `apps/web/src/core/auth/**` (auth-form pattern)", () => {
    const code = `
      function AuthPage() {
        const m = useMutation({ mutationFn: () => 1 });
        if (m.isLoading) return <Spinner />;
        return <form />;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/core/auth/AuthPage.tsx");
    assert.equal(messages.length, 0);
  });

  it("does NOT flag in `*.test.tsx` files", () => {
    const code = `
      function Component() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) return <Skeleton />;
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(
      code,
      "/repo/apps/web/src/modules/finyk/Panel.test.tsx",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag in `__tests__/*` files", () => {
    const code = `
      function Component() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) return <Skeleton />;
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(
      code,
      "/repo/apps/web/src/modules/finyk/__tests__/Panel.tsx",
    );
    assert.equal(messages.length, 0);
  });

  // ─── ALLOWLIST — opt-out via rule options ────────────────────────────

  it("does NOT flag files in user-supplied `allowlist` prefix", () => {
    const code = `
      function Coordinator() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) return <Skeleton />;
        return null;
      }
    `;
    const messages = lint(
      code,
      "/repo/apps/web/src/modules/finyk/coordinator/Coordinator.tsx",
      [{ allowlist: ["apps/web/src/modules/finyk/coordinator/"] }],
    );
    assert.equal(messages.length, 0);
  });

  it("flags files OUTSIDE allowlist prefix", () => {
    const code = `
      function Panel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) return <Skeleton />;
        return null;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx", [
      { allowlist: ["apps/web/src/modules/finyk/coordinator/"] },
    ]);
    assert.equal(messages.length, 1);
  });

  // ─── EDGE CASES ───────────────────────────────────────────────────────

  it("flags computed access `if (q['isLoading']) return <X/>`", () => {
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q["isLoading"]) return <Skeleton />;
        return null;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 1);
  });

  it("does NOT flag `if (isFetching) return <X/>` (stale, not loading)", () => {
    // `isFetching` живе у `stale` слоті DataState, але manual-ladder
    // на ньому rare-ly зустрічається і не вписується у канонічний
    // pattern — навмисно не покриваємо.
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isFetching) return <StaleBadge />;
        return null;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 0);
  });

  it("flags ConditionalExpression-returning JSX in consequent", () => {
    // `if (q.isLoading) return loading ? <A/> : <B/>` — ladder,
    // навіть якщо JSX повертається через ternary.
    const code = `
      function MyPanel() {
        const q = useQuery({ queryKey: ["x"], queryFn: () => 1 });
        if (q.isLoading) return q.error ? <ErrorBox /> : <Skeleton />;
        return <div>{q.data}</div>;
      }
    `;
    const messages = lint(code, "/repo/apps/web/src/modules/finyk/Panel.tsx");
    assert.equal(messages.length, 1);
  });
});
