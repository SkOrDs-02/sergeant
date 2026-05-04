import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("../../db.js", () => {
  const pool = { connect: vi.fn(), query: vi.fn() };
  return {
    default: pool,
    pool,
    query: vi.fn(),
  };
});

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../obs/metrics.js", () => ({
  monoWebhookReceivedTotal: { inc: vi.fn() },
  monoWebhookDurationMs: { observe: vi.fn() },
  // AI memory ingest hook (PR2). Заглушки достатньо — webhook-test не
  // верифікує enqueue-метрики напряму, а лише poll-ить, що hook не
  // throw-нув. Реальні поведінкові тести queue-у — у `ingestQueue.test.ts`.
  aiMemoryIngestEnqueuedTotal: { inc: vi.fn() },
  aiMemoryIngestProcessedTotal: { inc: vi.fn() },
  aiMemoryIngestDurationMs: { observe: vi.fn() },
  aiMemoryIngestQueueDepth: { set: vi.fn() },
}));

vi.mock("../ai-memory/ingestQueue.js", () => ({
  // PR2 hook: webhook-у достатньо знати, що `enqueueMemoryIngest` resolved-ить
  // без помилки. Реальний flow покрито у ingestQueue.test.ts.
  enqueueMemoryIngest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../push/send.js", () => ({
  sendToUserQuietly: vi.fn().mockResolvedValue(undefined),
}));

import _pool, { query as _query } from "../../db.js";
import {
  monoWebhookReceivedTotal as _counter,
  monoWebhookDurationMs as _histogram,
} from "../../obs/metrics.js";
import { sendToUserQuietly as _sendToUserQuietly } from "../../push/send.js";
import { webhookHandler } from "./webhook.js";

const dbQuery = _query as unknown as Mock;
const pool = _pool as unknown as { connect: Mock; query: Mock };
const counter = _counter as unknown as { inc: Mock };
const histogram = _histogram as unknown as { observe: Mock };
const sendPushMock = _sendToUserQuietly as unknown as Mock;

// ── Helpers ──────────────────────────────────────────────────

interface TestResBody {
  ok?: boolean;
  error?: string;
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
      this.body = payload as TestResBody;
      return this;
    },
  };
  return res as TestRes & Response;
}

const VALID_SECRET = "a".repeat(64);

function validPayload() {
  return {
    type: "StatementItem",
    data: {
      account: "acc_uah",
      statementItem: {
        id: "tx_001",
        time: 1714000000,
        description: "Кава",
        mcc: 5814,
        amount: -6500,
        operationAmount: -6500,
        currencyCode: 980,
        balance: 1500000,
      },
    },
  };
}

function makeReq(secret: string, body?: unknown): Request {
  return {
    params: { secret },
    headers: {},
    body: body ?? validPayload(),
  } as unknown as Request;
}

/**
 * Header-based webhook req — secret їде у `X-Mono-Webhook-Secret`, path-param
 * відсутній. Це preferred-форма після C1-rollout-у; шлях у Express тоді
 * `POST /api/mono/webhook` (без `:secret`-сегмента), тож `req.params.secret`
 * — undefined.
 */
function makeHeaderReq(headerSecret: string, body?: unknown): Request {
  return {
    params: {},
    headers: { "x-mono-webhook-secret": headerSecret },
    body: body ?? validPayload(),
  } as unknown as Request;
}

interface ClientMock {
  query: Mock;
  release: Mock;
}

function makeClient(): ClientMock {
  return { query: vi.fn(), release: vi.fn() };
}

/**
 * Послідовність client.query-викликів для happy-path транзакції без
 * autocreate-у: BEGIN → SAVEPOINT → tx upsert → RELEASE → balance update →
 * connection event → enrichment outbox → COMMIT.
 *
 * Параметр `inserted` керує `(xmax = 0) AS inserted` у result-row upsert-а.
 * `withBalance` контролює, чи robimo `UPDATE mono_account SET balance` (true
 * для дефолтного payload-у з `balance: 1500000`).
 */
function queueHappyPathClient(
  client: ClientMock,
  opts: { inserted: boolean; withBalance?: boolean; withEnrichment?: boolean },
): void {
  client.query
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({}) // SAVEPOINT
    .mockResolvedValueOnce({
      rows: [{ inserted: opts.inserted }],
      rowCount: 1,
    }) // upsert
    .mockResolvedValueOnce({}); // RELEASE
  if (opts.withBalance !== false) {
    client.query.mockResolvedValueOnce({}); // UPDATE balance
  }
  client.query.mockResolvedValueOnce({}); // UPDATE connection event
  if (opts.inserted && opts.withEnrichment !== false) {
    client.query.mockResolvedValueOnce({}); // INSERT enrichment outbox
  }
  client.query.mockResolvedValueOnce({}); // COMMIT
}

// ── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhookHandler", () => {
  it("returns 404 for unknown secret", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await webhookHandler(makeReq("unknown_secret_value"), res);

    expect(res.statusCode).toBe(404);
    expect(counter.inc).toHaveBeenCalledWith({ status: "invalid_secret" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payload", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET, { type: "SomethingElse" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid payload");
    expect(counter.inc).toHaveBeenCalledWith({ status: "bad_payload" });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("processes valid webhook: upserts transaction, updates balance and last_event_at", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });

    const client = makeClient();
    queueHappyPathClient(client, { inserted: true });
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(counter.inc).toHaveBeenCalledWith({ status: "ok" });
    expect(histogram.observe).toHaveBeenCalledWith(
      { status: "ok" },
      expect.any(Number),
    );

    // Транзакція виконує 8 client.query-викликів: BEGIN + SAVEPOINT + upsert
    // + RELEASE + UPDATE balance + UPDATE connection + INSERT outbox + COMMIT.
    expect(client.query).toHaveBeenCalledTimes(8);
    expect(client.query.mock.calls[0][0]).toBe("BEGIN");
    expect(client.query.mock.calls[1][0]).toMatch(/^SAVEPOINT/);
    expect(client.query.mock.calls[2][0]).toMatch(
      /INSERT INTO mono_transaction/,
    );
    expect(client.query.mock.calls[3][0]).toMatch(/^RELEASE SAVEPOINT/);
    expect(client.query.mock.calls[4][0]).toMatch(
      /UPDATE mono_account[\s\S]+SET balance/,
    );
    expect(client.query.mock.calls[5][0]).toMatch(/UPDATE mono_connection/);
    expect(client.query.mock.calls[6][0]).toMatch(
      /INSERT INTO mono_ai_enrichment_queue/,
    );
    expect(client.query.mock.calls[7][0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("fires push (fire-and-forget) on first INSERT with formatted amount + balance", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: true });
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET), res);
    await Promise.resolve();

    expect(res.statusCode).toBe(200);
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock.mock.calls[0][0]).toBe("user_1");
    const payload = sendPushMock.mock.calls[0][1];
    // amount=-6500 копійок → -65.00 ₴ → "−65,00 ₴" (U+2212 minus, NBSP separator)
    expect(payload.title).toBe("−65,00 ₴");
    expect(payload.body).toBe("Кава · доступно 15\u00A0000,00 ₴");
    expect(payload.data).toMatchObject({
      kind: "mono_tx",
      monoTxId: "tx_001",
      monoAccountId: "acc_uah",
    });
    expect(sendPushMock.mock.calls[0][2]).toEqual({ module: "mono" });
  });

  it("does NOT fire push when ON CONFLICT updates existing transaction (Monobank retry)", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: false });
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET), res);
    await Promise.resolve();

    expect(res.statusCode).toBe(200);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("marks `(резерв)` in body for hold transactions", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: true });
    pool.connect.mockResolvedValue(client);

    const base = validPayload();
    const holdPayload = {
      ...base,
      data: {
        ...base.data,
        statementItem: {
          ...base.data.statementItem,
          hold: true,
        },
      },
    };

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET, holdPayload), res);
    await Promise.resolve();

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock.mock.calls[0][1].body).toBe(
      "(резерв) Кава · доступно 15\u00A0000,00 ₴",
    );
  });

  it("idempotent: duplicate mono_tx_id is handled by ON CONFLICT", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client1 = makeClient();
    queueHappyPathClient(client1, { inserted: true });
    pool.connect.mockResolvedValueOnce(client1);

    const res1 = makeRes();
    await webhookHandler(makeReq(VALID_SECRET), res1);
    expect(res1.statusCode).toBe(200);

    vi.clearAllMocks();
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client2 = makeClient();
    queueHappyPathClient(client2, { inserted: false });
    pool.connect.mockResolvedValueOnce(client2);

    const res2 = makeRes();
    await webhookHandler(makeReq(VALID_SECRET), res2);
    expect(res2.statusCode).toBe(200);
  });

  it("returns 400 when payload is missing statementItem.id", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });

    const badPayload = {
      type: "StatementItem",
      data: {
        account: "acc_uah",
        statementItem: { description: "no id" },
      },
    };

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET, badPayload), res);

    expect(res.statusCode).toBe(400);
    expect(counter.inc).toHaveBeenCalledWith({ status: "bad_payload" });
  });

  it("returns 404 for missing secret param", async () => {
    const req = {
      params: {},
      headers: {},
      body: validPayload(),
    } as unknown as Request;
    const res = makeRes();
    await webhookHandler(req, res);
    expect(res.statusCode).toBe(404);
  });

  // ── C1 — X-Mono-Webhook-Secret header transport ──────────────
  // `docs/security/hardening/C1-mono-webhook-secret-in-url.md`
  // Secret лізе у URL-path → access-логи Railway/Sentry/Pino. Header-варіант
  // вирішує це: header не потрапляє у `req.url`, отже не записується в
  // access-log. Path-варіант лишається працювати як deprecated fallback,
  // поки Monobank не мігрує на header-конфіг.

  it("C1: приймає секрет через X-Mono-Webhook-Secret header (header-only, path порожній)", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: true });
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await webhookHandler(makeHeaderReq(VALID_SECRET), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(counter.inc).toHaveBeenCalledWith({ status: "ok" });
    // Lookup мусить відбутись по тому самому secret-hash, що й path-варіант.
    expect(dbQuery).toHaveBeenCalledTimes(1);
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it("C1: header виграє при колізії з path (forward-compat для rollout-у)", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: true });
    pool.connect.mockResolvedValue(client);

    // Якщо Monobank ще шле path-secret, але мі вже додали header у proxy/CDN
    // — header має пріоритет. Path тут — заведомо невалідний.
    const req = {
      params: { secret: "old-path-secret-not-valid" },
      headers: { "x-mono-webhook-secret": VALID_SECRET },
      body: validPayload(),
    } as unknown as Request;

    const res = makeRes();
    await webhookHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(counter.inc).toHaveBeenCalledWith({ status: "ok" });
  });

  it("C1: 404 коли header і path обидва порожні", async () => {
    const req = {
      params: {},
      headers: {},
      body: validPayload(),
    } as unknown as Request;
    const res = makeRes();
    await webhookHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect(counter.inc).toHaveBeenCalledWith({ status: "invalid_secret" });
  });

  it("C1: ігнорує header-array (defensive — Express нормалізує, але safe-by-default)", async () => {
    // Якщо Express колись поверне `string[]` у headers (rare, в обхід
    // proxy-нормалізації), ми трактуємо це як відсутність header-у і не
    // crash-имо. Тоді fallback на path-secret.
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: true });
    pool.connect.mockResolvedValue(client);

    const req = {
      params: { secret: VALID_SECRET },
      headers: { "x-mono-webhook-secret": ["a", "b"] },
      body: validPayload(),
    } as unknown as Request;

    const res = makeRes();
    await webhookHandler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("маппить mcc → category_slug і передає його у INSERT (Monobank Roadmap C)", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: true });
    pool.connect.mockResolvedValue(client);

    // mcc=5814 → 'restaurant' (з validPayload())
    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET), res);
    expect(res.statusCode).toBe(200);

    // Третій client.query-call — це сам upsert (після BEGIN, SAVEPOINT);
    // останній параметр — categorySlug.
    const upsertCall = client.query.mock.calls[2];
    const params = upsertCall[1];
    expect(params[params.length - 1]).toBe("restaurant");
  });

  it("category_slug = null для невідомого MCC", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: true });
    pool.connect.mockResolvedValue(client);

    const base = validPayload();
    const unknownMccPayload = {
      ...base,
      data: {
        ...base.data,
        statementItem: { ...base.data.statementItem, mcc: 9999 },
      },
    };

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET, unknownMccPayload), res);
    expect(res.statusCode).toBe(200);

    const params = client.query.mock.calls[2][1];
    expect(params[params.length - 1]).toBeNull();
  });

  it("ON CONFLICT-гілка SQL зберігає category_slug під захистом category_overridden", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    queueHappyPathClient(client, { inserted: false });
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET), res);

    const sql = client.query.mock.calls[2][0] as string;
    // Sanity-check, що SQL містить захист category_overridden.
    expect(sql).toMatch(/category_overridden/);
    expect(sql).toMatch(/category_slug = CASE/);
  });

  it("re-throws DB errors and records error metric (rollback runs)", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockRejectedValueOnce(new Error("DB gone")) // upsert fails
      .mockResolvedValueOnce({}); // ROLLBACK (catch path)
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await expect(webhookHandler(makeReq(VALID_SECRET), res)).rejects.toThrow(
      "DB gone",
    );

    expect(counter.inc).toHaveBeenCalledWith({ status: "error" });
    expect(counter.inc).not.toHaveBeenCalledWith({ status: "ok" });
    // ROLLBACK був викликаний на catch-гілці.
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("FK violation (23503) on tx upsert → autocreates mono_account stub and retries inside same TX", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });

    const fkErr = Object.assign(new Error("FK violation"), { code: "23503" });
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockRejectedValueOnce(fkErr) // first upsert attempt
      .mockResolvedValueOnce({}) // ROLLBACK TO SAVEPOINT
      .mockResolvedValueOnce({}) // INSERT mono_account stub
      .mockResolvedValueOnce({
        rows: [{ inserted: true }],
        rowCount: 1,
      }) // retry upsert
      .mockResolvedValueOnce({}) // UPDATE balance
      .mockResolvedValueOnce({}) // UPDATE connection
      .mockResolvedValueOnce({}) // INSERT enrichment outbox
      .mockResolvedValueOnce({}); // COMMIT
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await webhookHandler(makeReq(VALID_SECRET), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(counter.inc).toHaveBeenCalledWith({ status: "account_autocreated" });
    expect(counter.inc).toHaveBeenCalledWith({ status: "ok" });

    // Перевіряємо, що ROLLBACK TO SAVEPOINT справді викликаний перед stub-INSERT.
    const calls = client.query.mock.calls.map((c) => c[0]);
    const rollbackIdx = calls.findIndex((sql: string) =>
      /^ROLLBACK TO SAVEPOINT/.test(sql),
    );
    expect(rollbackIdx).toBeGreaterThanOrEqual(0);
    expect(calls[rollbackIdx + 1]).toMatch(/INSERT INTO mono_account/);

    // Stub використовує currency + balance з самого StatementItem.
    const stubCall = client.query.mock.calls[rollbackIdx + 1];
    expect(stubCall[1]).toEqual(["user_1", "acc_uah", 980, 1500000]);

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("non-FK errors are NOT retried (only 23503 triggers autocreate)", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ user_id: "user_1", webhook_secret: VALID_SECRET }],
    });

    const otherErr = Object.assign(new Error("connection lost"), {
      code: "08006",
    });
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockRejectedValueOnce(otherErr) // upsert fails with non-FK code
      .mockResolvedValueOnce({}); // ROLLBACK
    pool.connect.mockResolvedValue(client);

    const res = makeRes();
    await expect(webhookHandler(makeReq(VALID_SECRET), res)).rejects.toThrow(
      "connection lost",
    );

    expect(counter.inc).toHaveBeenCalledWith({ status: "error" });
    expect(counter.inc).not.toHaveBeenCalledWith({
      status: "account_autocreated",
    });
    // BEGIN, SAVEPOINT, fail, ROLLBACK — рівно 4 виклики, ніяких retry.
    expect(client.query).toHaveBeenCalledTimes(4);
  });
});
