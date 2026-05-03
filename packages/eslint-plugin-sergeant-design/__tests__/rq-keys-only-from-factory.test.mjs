/**
 * Unit tests for the `sergeant-design/rq-keys-only-from-factory` rule.
 *
 * The rule enforces AGENTS.md hard rule #2: all React Query keys must
 * come from the centralized factory in `queryKeys.ts`. Inline array
 * literals for `queryKey` / `mutationKey` are forbidden.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/rq-keys-only-from-factory";

function lint(code, filename = "apps/web/src/modules/finyk/hooks/useTx.js") {
  return linter.verify(
    code,
    {
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "error" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    { filename },
  );
}

// ─── Happy path: factory usage (no errors) ─────────────────────────────

describe("rq-keys-only-from-factory — valid (factory keys)", () => {
  it("allows useQuery with factory identifier key", () => {
    const messages = lint(`
      import { finykKeys } from "@shared/lib/api/queryKeys";
      useQuery({ queryKey: finykKeys.all, queryFn: fetchAll });
    `);
    assert.equal(messages.length, 0);
  });

  it("allows useQuery with factory function call key", () => {
    const messages = lint(`
      import { finykKeys } from "@shared/lib/api/queryKeys";
      useQuery({ queryKey: finykKeys.monoStatement(accId, from, to), queryFn: fn });
    `);
    assert.equal(messages.length, 0);
  });

  it("allows useMutation without mutationKey", () => {
    const messages = lint(`
      useMutation({ mutationFn: doSomething });
    `);
    assert.equal(messages.length, 0);
  });

  it("allows useMutation with factory identifier key", () => {
    const messages = lint(`
      useMutation({ mutationKey: finykKeys.all, mutationFn: fn });
    `);
    assert.equal(messages.length, 0);
  });

  it("allows queryClient.invalidateQueries with factory key", () => {
    const messages = lint(`
      queryClient.invalidateQueries({ queryKey: finykKeys.all });
    `);
    assert.equal(messages.length, 0);
  });

  it("allows queryClient.getQueryData with factory key", () => {
    const messages = lint(`
      queryClient.getQueryData(finykKeys.mono);
    `);
    assert.equal(messages.length, 0);
  });

  it("allows queryClient.setQueryData with factory key", () => {
    const messages = lint(`
      queryClient.setQueryData(finykKeys.mono, newData);
    `);
    assert.equal(messages.length, 0);
  });

  it("allows spread in queryKey (not an array literal)", () => {
    const messages = lint(`
      const key = finykKeys.all;
      useQuery({ queryKey: key, queryFn: fn });
    `);
    assert.equal(messages.length, 0);
  });

  it("allows variable reference as queryKey", () => {
    const messages = lint(`
      const myKey = getKey();
      useQuery({ queryKey: myKey, queryFn: fn });
    `);
    assert.equal(messages.length, 0);
  });
});

// ─── Fail path: inline array literals ───────────────────────────────────

describe("rq-keys-only-from-factory — invalid (inline arrays)", () => {
  it("flags useQuery with inline array queryKey", () => {
    const messages = lint(`
      useQuery({ queryKey: ["finyk", "transactions", accountId], queryFn: fn });
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.ok(messages[0].message.includes("queryKey"));
  });

  it("flags useMutation with inline array mutationKey", () => {
    const messages = lint(`
      useMutation({ mutationKey: ["finyk", "update"], mutationFn: fn });
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.ok(messages[0].message.includes("mutationKey"));
  });

  it("flags useInfiniteQuery with inline array queryKey", () => {
    const messages = lint(`
      useInfiniteQuery({ queryKey: ["items", page], queryFn: fn, getNextPageParam: p => p });
    `);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
  });

  it("flags useSuspenseQuery with inline array queryKey", () => {
    const messages = lint(`
      useSuspenseQuery({ queryKey: ["data"], queryFn: fn });
    `);
    assert.equal(messages.length, 1);
  });

  it("flags queryClient.invalidateQueries with inline array", () => {
    const messages = lint(`
      queryClient.invalidateQueries({ queryKey: ["finyk"] });
    `);
    assert.equal(messages.length, 1);
  });

  it("flags queryClient.getQueryData with inline array", () => {
    const messages = lint(`
      queryClient.getQueryData(["finyk", "mono"]);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags queryClient.setQueryData with inline array", () => {
    const messages = lint(`
      queryClient.setQueryData(["finyk", "mono"], newData);
    `);
    assert.equal(messages.length, 1);
  });

  it("flags queryClient.fetchQuery with inline array", () => {
    const messages = lint(`
      queryClient.fetchQuery({ queryKey: ["data"], queryFn: fn });
    `);
    assert.equal(messages.length, 1);
  });

  it("flags queryClient.prefetchQuery with inline array", () => {
    const messages = lint(`
      queryClient.prefetchQuery({ queryKey: ["data"], queryFn: fn });
    `);
    assert.equal(messages.length, 1);
  });

  it("flags queryClient.cancelQueries with inline array", () => {
    const messages = lint(`
      queryClient.cancelQueries({ queryKey: ["data"] });
    `);
    assert.equal(messages.length, 1);
  });

  it("flags queryClient.removeQueries with inline array", () => {
    const messages = lint(`
      queryClient.removeQueries({ queryKey: ["data"] });
    `);
    assert.equal(messages.length, 1);
  });

  it("flags empty inline array queryKey", () => {
    const messages = lint(`
      useQuery({ queryKey: [], queryFn: fn });
    `);
    assert.equal(messages.length, 1);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────

describe("rq-keys-only-from-factory — edge cases", () => {
  it("does NOT flag inside the factory file itself (.ts)", () => {
    const messages = lint(
      `export const finykKeys = { all: ["finyk"] };`,
      "apps/web/src/shared/lib/api/queryKeys.js",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag inside the factory file itself (exact path match)", () => {
    const messages = lint(
      `useQuery({ queryKey: ["finyk"], queryFn: fn });`,
      "some/prefix/apps/web/src/shared/lib/api/queryKeys.js",
    );
    assert.equal(messages.length, 0);
  });

  it("does NOT flag unrelated function calls with array arguments", () => {
    const messages = lint(`
      someOtherFunction({ queryKey: ["test"] });
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag useQuery without queryKey property", () => {
    const messages = lint(`
      useQuery(someOptionsObject);
    `);
    assert.equal(messages.length, 0);
  });

  it("flags computed property name 'queryKey' with inline array", () => {
    const messages = lint(`
      useQuery({ ["queryKey"]: ["test"], queryFn: fn });
    `);
    assert.equal(messages.length, 1);
  });

  it("does NOT flag non-MemberExpression callee for QC methods", () => {
    const messages = lint(`
      invalidateQueries({ queryKey: ["test"] });
    `);
    assert.equal(messages.length, 0);
  });

  it("does NOT flag queryClient method with non-array first arg", () => {
    const messages = lint(`
      queryClient.getQueryData(finykKeys.all);
    `);
    assert.equal(messages.length, 0);
  });

  it("handles deeply nested useQuery call", () => {
    const messages = lint(`
      function useThing() {
        return useQuery({
          queryKey: ["deeply", "nested", id],
          queryFn: () => fetch("/api"),
          enabled: !!id,
        });
      }
    `);
    assert.equal(messages.length, 1);
  });

  it("does NOT flag array in other property of useQuery options", () => {
    const messages = lint(`
      useQuery({
        queryKey: finykKeys.all,
        queryFn: fn,
        select: (data) => [data],
      });
    `);
    assert.equal(messages.length, 0);
  });
});
