import { describe, expect, it } from "vitest";

import { applyFizrukInjuries } from "./applyInjuries.js";
import {
  asClient,
  FakeClient,
  lastQuery,
  syncOp,
} from "./__tests__/testHelpers.js";

// Харнес (FakeClient / asClient / syncOp / lastQuery) винесено у
// __testHelpers.ts і поділяється з applySync.test.ts та
// applyMisc.test.ts — той самий fake-клієнт, три колоковані файли.

describe("applyFizrukInjuries", () => {
  // ADR-0083 "не можна" model — storage-behavior тестується тут на рівні
  // apply-функції; syncV2-table-smoke.integration.test.ts покриває
  // push→pull roundtrip проти реальної Postgres.
  const clientTs = new Date("2026-07-21T08:00:00.000Z");

  function validRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "inj_00000005-0009-4000-8001-000000000001",
      user_id: "user-1",
      site: "spine-lumbar",
      started_at: "2026-07-20T06:00:00.000Z",
      cleared_at: null,
      ...overrides,
    };
  }

  it("rejects a row without id before any query runs", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", { user_id: "user-1" }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a completely missing user_id before any query runs", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["user_id"];

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", row),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a mismatched user_id (cross-user isolation)", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ user_id: "someone-else" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });

  it("accepts a client-minted TEXT id that is not a bare uuid", async () => {
    // Ризик, задокументований прямо в applyInjuries.ts: `id` — це
    // `inj_<uuid>`, ніколи не голий uuid; uuid-колонка впала б з 22P02 на
    // кожному push. Тест фіксує, що apply-шар не відхиляє за формою id.
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", validRow({ id: "inj_not_a_uuid" })),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("rejects a missing site with missing_site", async () => {
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["site"];

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", row),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_site" });
  });

  it("rejects a whitespace-only site with missing_site", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", validRow({ site: "   " })),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_site" });
  });

  it("rejects a missing/invalid started_at with invalid_started_at", async () => {
    const fake = new FakeClient();
    const missing = validRow();
    delete (missing as Record<string, unknown>)["started_at"];

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "insert", missing),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_started_at" });

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ started_at: "not-a-date" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_started_at" });
  });

  it("rejects an unparseable cleared_at with invalid_cleared_at", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ cleared_at: "not-a-date" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_cleared_at" });
  });

  it("rejects garbage created_at / deleted_at with field-specific reasons", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ created_at: "not-a-date" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_created_at" });

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ deleted_at: "not-a-date" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_deleted_at" });
  });

  it("never coerces an absent cleared_at to clientTs — null keeps the mark ACTIVE", async () => {
    // Регресія, названа прямо в applyInjuries.ts: перетворення відсутнього
    // cleared_at на clientTs мовчки закрило б активну травму.
    const fake = new FakeClient();
    const row = validRow();
    delete (row as Record<string, unknown>)["cleared_at"];

    await applyFizrukInjuries(
      asClient(fake),
      syncOp("fizruk_injuries", "insert", row),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    // params order: id, user_id, site, started_at, cleared_at, note,
    // created_at, updated_at, deleted_at
    expect(insert.params[4]).toBeNull();
  });

  it("stores an explicit cleared_at when the client marks the injury resolved", async () => {
    const fake = new FakeClient();

    await applyFizrukInjuries(
      asClient(fake),
      syncOp(
        "fizruk_injuries",
        "insert",
        validRow({ cleared_at: "2026-07-25T09:00:00.000Z" }),
      ),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    expect(insert.params[4]).toEqual(new Date("2026-07-25T09:00:00.000Z"));
  });

  it("trims the site and defaults note to an empty string", async () => {
    const fake = new FakeClient();

    await applyFizrukInjuries(
      asClient(fake),
      syncOp(
        "fizruk_injuries",
        "insert",
        validRow({ site: "  spine-lumbar  " }),
      ),
      "user-1",
      clientTs,
    );

    const insert = lastQuery(fake);
    expect(insert.params[2]).toBe("spine-lumbar");
    expect(insert.params[5]).toBe("");
  });

  it("inserts a new injury with the full param set in order", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "insert",
          validRow({ note: "aggravated during squats" }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO fizruk_injuries");
    expect(insert.params).toEqual([
      "inj_00000005-0009-4000-8001-000000000001",
      "user-1",
      "spine-lumbar",
      new Date("2026-07-20T06:00:00.000Z"),
      null,
      "aggravated during squats",
      clientTs,
      clientTs,
      null,
    ]);
  });

  it("rejects fk_violation when the existing row belongs to another user", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "someone-else",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });
  });

  it("rejects lww_conflict when the existing row is newer or equal to clientTs", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      { user_id: "user-1", updated_at: clientTs, deleted_at: null },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  // Регресія SERGEANT-WEB-T. Раніше цей стан давав `tombstoned`: правило
  // «видалення остаточне» стояло після LWW, тож ловило лише записи, НОВІШІ
  // за видалення, — рівно ті, що за LWW мають вигравати.
  it("новіший запис воскрешає soft-deleted позначку травми", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "update", validRow()),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    // Мітку видалення знято: `deleted_at` це `$6`, а `validRow()` його не
    // несе, тож туди лягає `null`.
    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_injuries");
    expect(update.params[5]).toBeNull();
  });

  it("rejects deleting a row that does not exist", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "delete", {
          id: "inj_00000005-0009-4000-8001-000000000001",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });
  });

  it("soft-deletes an existing injury with the client timestamp", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "delete", {
          id: "inj_00000005-0009-4000-8001-000000000001",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_injuries");
    expect(update.sql).toMatch(/SET deleted_at = \$1, updated_at = \$1/);
    expect(update.params).toEqual([
      clientTs,
      "inj_00000005-0009-4000-8001-000000000001",
      "user-1",
    ]);
  });

  it("allows deleting a row that is already soft-deleted (idempotent retract)", async () => {
    // Повторний delete-op з офлайн-черги не має падати з помилкою:
    // видалення вже видаленого — той самий стан, а не конфлікт.
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T06:00:00.000Z"),
        deleted_at: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp("fizruk_injuries", "delete", {
          id: "inj_00000005-0009-4000-8001-000000000001",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("updates an existing injury, keeping the same field order in params", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      {
        user_id: "user-1",
        updated_at: new Date("2026-07-21T07:00:00.000Z"),
        deleted_at: null,
      },
    ]);

    await expect(
      applyFizrukInjuries(
        asClient(fake),
        syncOp(
          "fizruk_injuries",
          "update",
          validRow({
            cleared_at: "2026-07-22T09:00:00.000Z",
            note: "resolved after rest",
          }),
        ),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_injuries");
    expect(update.params).toEqual([
      "spine-lumbar",
      new Date("2026-07-20T06:00:00.000Z"),
      new Date("2026-07-22T09:00:00.000Z"),
      "resolved after rest",
      clientTs,
      null,
      "inj_00000005-0009-4000-8001-000000000001",
      "user-1",
    ]);
  });
});
