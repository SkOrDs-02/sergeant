import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../auth.js", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("../../db.js", () => {
  const pool = { connect: vi.fn(), query: vi.fn() };
  return { default: pool, pool };
});

vi.mock("../../obs/requestContext.js", () => ({
  setRequestModule: vi.fn(),
}));

vi.mock("../../obs/metrics.js", () => ({
  syncConflictsTotal: { inc: vi.fn() },
  syncDurationMs: { observe: vi.fn() },
  syncOperationsTotal: { inc: vi.fn() },
  syncPayloadBytes: { observe: vi.fn() },
}));

vi.mock("../../obs/logger.js", async () => {
  const actual = await vi.importActual("../../obs/logger.js");
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  };
});

import { getSessionUser as _getSessionUser } from "../../auth.js";
import _pool from "../../db.js";
import { logger as _logger } from "../../obs/logger.js";
import {
  syncConflictsTotal,
  syncOperationsTotal as _syncOperationsTotal,
} from "../../obs/metrics.js";
import {
  MAX_BLOB_SIZE,
  syncPull,
  syncPullAll,
  syncPush,
  syncPushAll,
  VALID_MODULES,
} from "./sync.js";

const getSessionUser = _getSessionUser as unknown as Mock;
const pool = _pool as unknown as { connect: Mock; query: Mock };
const logger = _logger as unknown as {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  fatal: Mock;
};
const syncOperationsTotal = _syncOperationsTotal as unknown as { inc: Mock };

interface TestResBody {
  ok?: boolean;
  error?: string;
  details?: unknown;
  results?: Record<
    string,
    { ok: boolean; error?: string; conflict?: boolean; version?: number }
  >;
  data?: unknown;
  module?: string;
  version?: number;
  conflict?: boolean;
}

interface TestRes {
  statusCode: number;
  body: TestResBody;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {} as TestResBody,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload as TestRes["body"];
      return this;
    },
  };
  return res as TestRes & Response;
}

// `req.user` проставляє `requireSession` middleware у роутері; у юніт-тестах
// викликаємо хендлер напряму, тож імітуємо його тут.
function makeReq(body: unknown): Request {
  return {
    method: "POST",
    body,
    user: { id: "user_1" },
  } as unknown as Request;
}

interface OutcomeLabels {
  op: string;
  module?: string;
  outcome?: string;
}

/** Збирає всі виклики `.inc(labels)` у масив для зручних assert-ів. */
function outcomesFor(op: string): OutcomeLabels[] {
  return (syncOperationsTotal.inc.mock.calls as [OutcomeLabels][])
    .map(([labels]) => labels)
    .filter((l) => l.op === op);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user_1" });
});

describe("syncPushAll metric correctness around transaction boundary", () => {
  it("emits per-module outcomes only after COMMIT succeeds", async () => {
    const client = {
      query: vi.fn(),
      release: vi.fn(),
    };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // pre-fetch existing module_data
      .mockResolvedValueOnce({}) // BEGIN
      // finyk — ok
      .mockResolvedValueOnce({
        rows: [{ server_updated_at: "2026-01-01T00:00:00Z", version: 2 }],
      })
      // routine — ok
      .mockResolvedValueOnce({
        rows: [{ server_updated_at: "2026-01-01T00:00:01Z", version: 5 }],
      })
      .mockResolvedValueOnce({}); // COMMIT
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await syncPushAll(
      makeReq({
        modules: {
          finyk: { data: { x: 1 }, clientUpdatedAt: "2026-01-01T00:00:00Z" },
          routine: { data: { y: 2 }, clientUpdatedAt: "2026-01-01T00:00:00Z" },
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    const pushOutcomes = outcomesFor("push");
    expect(pushOutcomes).toHaveLength(2);
    expect(pushOutcomes.map((o) => [o.module, o.outcome])).toEqual(
      expect.arrayContaining([
        ["finyk", "ok"],
        ["routine", "ok"],
      ]),
    );
    expect(outcomesFor("push_all")).toEqual([
      { op: "push_all", module: "all", outcome: "ok" },
    ]);
  });

  it("reclassifies in-flight records as error when COMMIT fails → ROLLBACK", async () => {
    const client = {
      query: vi.fn(),
      release: vi.fn(),
    };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // pre-fetch existing module_data
      .mockResolvedValueOnce({}) // BEGIN
      // finyk — «успішний» INSERT у межах транзакції
      .mockResolvedValueOnce({
        rows: [{ server_updated_at: "2026-01-01T00:00:00Z", version: 2 }],
      })
      // routine — INSERT кидає (наприклад, deadlock)
      .mockRejectedValueOnce(
        Object.assign(new Error("deadlock detected"), { code: "40P01" }),
      )
      .mockResolvedValueOnce({}); // ROLLBACK
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await expect(
      syncPushAll(
        makeReq({
          modules: {
            finyk: { data: { x: 1 }, clientUpdatedAt: "2026-01-01T00:00:00Z" },
            routine: {
              data: { y: 2 },
              clientUpdatedAt: "2026-01-01T00:00:00Z",
            },
          },
        }),
        res,
      ),
    ).rejects.toThrow(/deadlock/);

    // Ключова гарантія: finyk, який «пройшов» INSERT у try-блоці, ПІСЛЯ
    // ROLLBACK-у враховується як error, а не як ok.
    const pushOutcomes = outcomesFor("push");
    expect(pushOutcomes).toEqual([
      expect.objectContaining({
        op: "push",
        module: "finyk",
        outcome: "error",
      }),
    ]);
    expect(outcomesFor("push_all")).toEqual([
      { op: "push_all", module: "all", outcome: "error" },
    ]);
    // Conflict counter НЕ має рухатись при error-гілці.
    expect(syncConflictsTotal.inc).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("emits too_large immediately (pre-DML reject), but defers ok/conflict until COMMIT", async () => {
    const big = "x".repeat(6 * 1024 * 1024); // > 5 MB MAX_BLOB_SIZE
    const client = {
      query: vi.fn(),
      release: vi.fn(),
    };
    client.query
      // pre-fetch повертає існуючий рядок для nutrition → конфлікт-гілка
      // нижче читає version/server_updated_at саме звідси (а не з
      // окремого SELECT всередині циклу — той запит прибрали).
      .mockResolvedValueOnce({
        rows: [
          {
            module: "nutrition",
            server_updated_at: "2026-01-01T00:00:00Z",
            version: 7,
          },
        ],
      })
      .mockResolvedValueOnce({}) // BEGIN
      // nutrition — conflict (INSERT returns 0 rows)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({}); // COMMIT
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await syncPushAll(
      makeReq({
        modules: {
          // too_large — reject до DML, метрика емітиться одразу в циклі.
          finyk: { data: big, clientUpdatedAt: "2026-01-01T00:00:00Z" },
          nutrition: {
            data: { z: 3 },
            clientUpdatedAt: "2026-01-01T00:00:00Z",
          },
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.results!["finyk"]).toEqual({
      ok: false,
      error: "Too large",
    });
    expect(res.body.results!["nutrition"]).toMatchObject({
      ok: true,
      conflict: true,
      version: 7,
    });

    const pushOutcomes = outcomesFor("push");
    expect(pushOutcomes.map((o) => [o.module, o.outcome])).toEqual(
      expect.arrayContaining([
        ["finyk", "too_large"],
        ["nutrition", "conflict"],
      ]),
    );
    expect(syncConflictsTotal.inc).toHaveBeenCalledWith({
      module: "nutrition",
    });
  });

  it("missing clientUpdatedAt in push_all → 400 before transaction", async () => {
    const res = makeRes();

    await syncPushAll(
      makeReq({
        modules: {
          finyk: { data: { x: 1 } },
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "modules.finyk.clientUpdatedAt" }),
      ]),
    );
    expect(pool.connect).not.toHaveBeenCalled();
    expect(syncOperationsTotal.inc.mock.calls.map(([l]) => l)).toContainEqual(
      expect.objectContaining({ op: "push_all", outcome: "invalid" }),
    );
  });
});

describe("syncPullAll module filtering", () => {
  it("фільтрує по VALID_MODULES — 'coach' та інші не-sync рядки не потрапляють у відповідь", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await syncPullAll(makeReq({}), res);

    // `module_data` має сканитись рівно одним запитом; додаткові виклики
    // `pool.query` після нього (зокрема fire-and-forget INSERT у
    // `sync_audit_log`) — не вважаємо за порушення контракту pull_all.
    const moduleDataCalls = pool.query.mock.calls.filter(([sql]) =>
      /module_data/.test(String(sql)),
    );
    expect(moduleDataCalls).toHaveLength(1);
    const [sql, params] = moduleDataCalls[0]!;
    expect(sql).toMatch(/module = ANY\(\$2::text\[\]\)/);
    expect(params![0]).toBe("user_1");
    // Параметр $2 має бути рівно множиною VALID_MODULES (без coach).
    expect(new Set(params![1] as string[])).toEqual(VALID_MODULES);
    expect(params![1]).toContain("profile");
    expect(params![1]).not.toContain("coach");
  });
});

describe("sync_event structured log", () => {
  it("емітить sync_event на кожен recordSync — level по outcome", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // pre-fetch existing module_data
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ server_updated_at: "2026-01-01T00:00:00Z", version: 2 }],
      }) // finyk ok
      .mockResolvedValueOnce({}); // COMMIT
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await syncPushAll(
      makeReq({
        modules: {
          finyk: { data: { x: 1 }, clientUpdatedAt: "2026-01-01T00:00:00Z" },
        },
      }),
      res,
    );

    // ok-outcome → info; push + push_all по одному info-виклику
    const infos = logger.info.mock.calls.map(([arg]) => arg);
    expect(infos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: "sync_event",
          op: "push",
          module: "finyk",
          outcome: "ok",
        }),
        expect.objectContaining({
          msg: "sync_event",
          op: "push_all",
          module: "all",
          outcome: "ok",
        }),
      ]),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("error outcome пише через logger.error (ROLLBACK path reclassifies pending)", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // pre-fetch existing module_data
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ server_updated_at: "2026-01-01T00:00:00Z", version: 2 }],
      }) // finyk «ок» у транзакції → потрапляє в pending
      .mockRejectedValueOnce(
        Object.assign(new Error("deadlock"), { code: "40P01" }),
      ) // routine кидає → catch
      .mockResolvedValueOnce({}); // ROLLBACK
    pool.connect.mockResolvedValue(client);

    await expect(
      syncPushAll(
        makeReq({
          modules: {
            finyk: { data: { x: 1 }, clientUpdatedAt: "2026-01-01T00:00:00Z" },
            routine: {
              data: { y: 2 },
              clientUpdatedAt: "2026-01-01T00:00:00Z",
            },
          },
        }),
        makeRes(),
      ),
    ).rejects.toThrow(/deadlock/);

    const errors = logger.error.mock.calls.map(([arg]) => arg);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: "sync_event",
          op: "push",
          module: "finyk",
          outcome: "error",
        }),
        expect.objectContaining({
          msg: "sync_event",
          op: "push_all",
          module: "all",
          outcome: "error",
        }),
      ]),
    );
    // ok-лог НЕ має існувати, хоча finyk «пройшов» INSERT: транзакція впала.
    const okLogs = logger.info.mock.calls.filter(
      ([arg]) => arg.msg === "sync_event" && arg.outcome === "ok",
    );
    expect(okLogs).toHaveLength(0);
  });
});

describe("syncPush (singular) — contract tests", () => {
  it("happy: INSERT повертає row → 200 + serverUpdatedAt/version", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ server_updated_at: "2026-01-01T00:00:00Z", version: 3 }],
    });

    const res = makeRes();
    await syncPush(
      makeReq({
        module: "finyk",
        data: { balance: 100 },
        clientUpdatedAt: "2026-01-01T00:00:00Z",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      module: "finyk",
      version: 3,
    });
    // INSERT … ON CONFLICT … RETURNING (без supplementary SELECT).
    // Фільтруємо `module_data` запити: fire-and-forget audit-вставка
    // після успіху теж використовує `pool.query`, але вона не належить
    // до контракту push.
    const moduleDataCalls = pool.query.mock.calls.filter(([sql]) =>
      /module_data/.test(String(sql)),
    );
    expect(moduleDataCalls).toHaveLength(1);
    const [sql, params] = moduleDataCalls[0]!;
    expect(sql).toMatch(/INSERT INTO module_data/);
    expect(params![0]).toBe("user_1");
    expect(params![1]).toBe("finyk");
  });

  it("accepts profile module for AI memory sync", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ server_updated_at: "2026-01-01T00:00:00Z", version: 4 }],
    });

    const res = makeRes();
    await syncPush(
      makeReq({
        module: "profile",
        data: [{ id: "mem_1", fact: "Не їм арахіс", category: "allergy" }],
        clientUpdatedAt: "2026-01-01T00:00:00Z",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      module: "profile",
      version: 4,
    });
    const [, params] = pool.query.mock.calls[0]!;
    expect(params[1]).toBe("profile");
  });

  it("invalid module → 400 + metric outcome='invalid'", async () => {
    const res = makeRes();
    await syncPush(makeReq({ module: "not-a-module", data: { x: 1 } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "module" })]),
    );
    expect(pool.query).not.toHaveBeenCalled();
    expect(syncOperationsTotal.inc.mock.calls.map(([l]) => l)).toContainEqual(
      expect.objectContaining({ op: "push", outcome: "invalid" }),
    );
  });

  it("missing data → 400 (пустий/undefined payload)", async () => {
    const res = makeRes();
    await syncPush(makeReq({ module: "finyk" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "data" })]),
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("missing clientUpdatedAt → 400 (раніше мовчки перезаписував чужі push-и)", async () => {
    const res = makeRes();
    await syncPush(makeReq({ module: "finyk", data: { balance: 100 } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "clientUpdatedAt" }),
      ]),
    );
    expect(pool.query).not.toHaveBeenCalled();
    expect(syncOperationsTotal.inc.mock.calls.map(([l]) => l)).toContainEqual(
      expect.objectContaining({ op: "push", outcome: "invalid" }),
    );
  });

  // Зона «проскакують zod, але крешать хендлер»: `""` / `"garbage"` / `NaN`
  // раніше проходили union `string|number|date` і ставали `Invalid Date` →
  // `pg` при серіалізації кидав `RangeError`, і відповідь була 500 замість
  // чистого 400.
  it.each<[string, unknown]>([
    ["empty string", ""],
    ["non-parseable string", "not a date"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])(
    "invalid clientUpdatedAt (%s) → 400 before reaching DB",
    async (_label, value) => {
      const res = makeRes();
      await syncPush(
        makeReq({
          module: "finyk",
          data: { balance: 100 },
          clientUpdatedAt: value,
        }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "clientUpdatedAt" }),
        ]),
      );
      expect(pool.query).not.toHaveBeenCalled();
    },
  );

  it("blob > MAX_BLOB_SIZE → 413 + outcome='too_large'", async () => {
    const huge = "x".repeat(MAX_BLOB_SIZE);
    const res = makeRes();
    await syncPush(
      makeReq({
        module: "finyk",
        data: huge,
        clientUpdatedAt: "2026-01-01T00:00:00Z",
      }),
      res,
    );
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: "Data too large" });
    expect(pool.query).not.toHaveBeenCalled();
    expect(syncOperationsTotal.inc.mock.calls.map(([l]) => l)).toContainEqual(
      expect.objectContaining({
        op: "push",
        module: "finyk",
        outcome: "too_large",
      }),
    );
  });

  it("conflict (INSERT вертає 0 рядків) → SELECT existing + outcome='conflict'", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // INSERT no-op (last-write-wins guard)
      .mockResolvedValueOnce({
        rows: [{ server_updated_at: "2026-01-02T00:00:00Z", version: 9 }],
      });

    const res = makeRes();
    await syncPush(
      makeReq({
        module: "routine",
        data: { y: 2 },
        clientUpdatedAt: "2026-01-01T00:00:00Z",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      module: "routine",
      conflict: true,
      version: 9,
    });
    expect(syncConflictsTotal.inc).toHaveBeenCalledWith({ module: "routine" });
    expect(syncOperationsTotal.inc.mock.calls.map(([l]) => l)).toContainEqual(
      expect.objectContaining({
        op: "push",
        module: "routine",
        outcome: "conflict",
      }),
    );
  });

  it("DB-exception → metric outcome='error' і помилка пробулькує", async () => {
    pool.query.mockRejectedValueOnce(new Error("boom"));
    const res = makeRes();
    await expect(
      syncPush(
        makeReq({
          module: "finyk",
          data: { x: 1 },
          clientUpdatedAt: "2026-01-01T00:00:00Z",
        }),
        res,
      ),
    ).rejects.toThrow(/boom/);
    expect(syncOperationsTotal.inc.mock.calls.map(([l]) => l)).toContainEqual(
      expect.objectContaining({
        op: "push",
        module: "finyk",
        outcome: "error",
      }),
    );
  });
});

describe("syncPull (singular) — contract tests", () => {
  it("happy: віддає data+version+timestamps", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          data: JSON.stringify({ balance: 100 }),
          client_updated_at: "2026-01-01T00:00:00Z",
          server_updated_at: "2026-01-01T00:00:01Z",
          version: 4,
        },
      ],
    });
    const res = makeRes();
    await syncPull(makeReq({ module: "finyk" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      module: "finyk",
      data: { balance: 100 },
      version: 4,
    });
  });

  it("empty (рядка ще немає) → 200 + data=null, version=0, outcome='empty'", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = makeRes();
    await syncPull(makeReq({ module: "nutrition" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      module: "nutrition",
      data: null,
      serverUpdatedAt: null,
      version: 0,
    });
    expect(syncOperationsTotal.inc.mock.calls.map(([l]) => l)).toContainEqual(
      expect.objectContaining({
        op: "pull",
        module: "nutrition",
        outcome: "empty",
      }),
    );
  });

  it("invalid module → 400", async () => {
    const res = makeRes();
    await syncPull(makeReq({ module: "coach" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні дані запиту" });
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "module" })]),
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("повертає raw об'єкт коли `data` — не-string (JSONB)", async () => {
    // pg драйвер повертає JSONB як обʼєкт, не як string — перевіряємо
    // обидві гілки парсера.
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          data: { cached: true, items: [1, 2, 3] },
          client_updated_at: "2026-01-01T00:00:00Z",
          server_updated_at: "2026-01-01T00:00:01Z",
          version: 2,
        },
      ],
    });
    const res = makeRes();
    await syncPull(makeReq({ module: "routine" }), res);
    expect(res.body.data).toEqual({ cached: true, items: [1, 2, 3] });
  });
});
