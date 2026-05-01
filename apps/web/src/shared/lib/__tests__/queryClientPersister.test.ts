/**
 * Tests for the web React Query persister's `shouldDehydrateQuery`
 * selector. The selector is the choke-point that decides which
 * cached queries reach IndexedDB on every cache mutation, so a
 * silent regression here (e.g. a new sensitive feed is added but
 * nobody updates the block-list) leaks data verbatim to disk.
 *
 * See PR #004 in `docs/planning/storage-roadmap.md`.
 */
import { describe, it, expect } from "vitest";
import { QueryClient, dehydrate, type Query } from "@tanstack/react-query";

import { shouldDehydrateQueryForPersist } from "../queryClientPersister";

/**
 * Build a fake `Query`-like object good enough for the selector,
 * which only inspects `state.status`, `state.dataUpdateCount`, and
 * `queryKey`. Anything else stays unset.
 */
function fakeQuery(opts: {
  queryKey: readonly unknown[];
  status?: "success" | "error" | "pending";
  dataUpdateCount?: number;
}): Query {
  return {
    queryKey: opts.queryKey,
    state: {
      status: opts.status ?? "success",
      dataUpdateCount: opts.dataUpdateCount ?? 1,
    },
  } as unknown as Query;
}

describe("shouldDehydrateQueryForPersist — base filters", () => {
  it("rejects errored queries", () => {
    expect(
      shouldDehydrateQueryForPersist(
        fakeQuery({ queryKey: ["routine"], status: "error" }),
      ),
    ).toBe(false);
  });

  it("rejects queries that have never had a successful response", () => {
    expect(
      shouldDehydrateQueryForPersist(
        fakeQuery({ queryKey: ["routine"], dataUpdateCount: 0 }),
      ),
    ).toBe(false);
  });

  it("accepts a vanilla, non-sensitive successful query", () => {
    expect(
      shouldDehydrateQueryForPersist(
        fakeQuery({ queryKey: ["routine", "today"] }),
      ),
    ).toBe(true);
  });
});

describe("shouldDehydrateQueryForPersist — sensitive query exclusion", () => {
  it.each([
    ["auth namespace", ["auth", "session"]],
    ["me namespace", ["me", "current"]],
    ["coach namespace", ["coach", "memory"]],
    ["coach insight tuple", ["coach", "insight", "2025-05-01"]],
    ["sync manifest tuple", ["sync", "manifest"]],
    ["sync module data tuple", ["sync", "module", "finyk"]],
    ["balance fragment under privat", ["privat", "balance", "uah"]],
    ["balance-final fragment", ["privat", "balance-final"]],
  ])("rejects %s", (_label, queryKey) => {
    expect(shouldDehydrateQueryForPersist(fakeQuery({ queryKey }))).toBe(false);
  });
});

describe("dehydrate() integration", () => {
  it("omits sensitive queries from the dehydrated snapshot", () => {
    const client = new QueryClient();
    // Seed a mix of sensitive and safe queries.
    client.setQueryData(["coach", "memory"], { advice: "save more" });
    client.setQueryData(["me", "current"], { email: "user@example.com" });
    client.setQueryData(["sync", "manifest"], { items: [{ id: "x" }] });
    client.setQueryData(["privat", "balance"], { uah: 12345 });
    // Safe ones, should survive.
    client.setQueryData(["routine", "today"], { steps: 7 });
    client.setQueryData(["finyk", "transactions"], [{ id: 1 }]);
    client.setQueryData(["nutrition", "log", "2025-05-01"], []);

    const snapshot = dehydrate(client, {
      shouldDehydrateQuery: shouldDehydrateQueryForPersist,
    });

    const dehydratedKeys = snapshot.queries.map((q) =>
      JSON.stringify(q.queryKey),
    );

    // None of the sensitive feeds leak into the snapshot.
    expect(dehydratedKeys).not.toContain(JSON.stringify(["coach", "memory"]));
    expect(dehydratedKeys).not.toContain(JSON.stringify(["me", "current"]));
    expect(dehydratedKeys).not.toContain(JSON.stringify(["sync", "manifest"]));
    expect(dehydratedKeys).not.toContain(JSON.stringify(["privat", "balance"]));

    // The non-sensitive feeds DO survive.
    expect(dehydratedKeys).toContain(JSON.stringify(["routine", "today"]));
    expect(dehydratedKeys).toContain(JSON.stringify(["finyk", "transactions"]));
    expect(dehydratedKeys).toContain(
      JSON.stringify(["nutrition", "log", "2025-05-01"]),
    );

    client.clear();
  });

  it("does not embed sensitive payloads anywhere in the snapshot JSON", () => {
    const client = new QueryClient();
    client.setQueryData(["coach", "memory"], {
      advice: "PRIVATE_COACH_PAYLOAD",
    });
    client.setQueryData(["me", "current"], {
      email: "PRIVATE_USER_EMAIL@example.com",
    });
    client.setQueryData(["privat", "balance"], {
      uah: "PRIVATE_BALANCE_AMOUNT",
    });
    // Safe, harmless data.
    client.setQueryData(["routine", "today"], { steps: 7 });

    const snapshot = dehydrate(client, {
      shouldDehydrateQuery: shouldDehydrateQueryForPersist,
    });

    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("PRIVATE_COACH_PAYLOAD");
    expect(json).not.toContain("PRIVATE_USER_EMAIL");
    expect(json).not.toContain("PRIVATE_BALANCE_AMOUNT");

    client.clear();
  });
});
