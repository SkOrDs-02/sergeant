/**
 * Unit tests for `modules/alerts/telegramShipper.ts` (O4 / B.1,
 * sprint-roadmap §1.2, telegram-improvements-roadmap §4.2).
 *
 * Покриває:
 *   1. Fresh send — no signature OR no match (legacy alerts not affected).
 *   2. Grace-period — duplicate within 10-min window → editMessageText
 *      with `🔁 N× за 10 хв:` prefix.
 *   3. Edge race на 10:00 — точно на межі (exact boundary) → DB filter
 *      `last_occurrence_at >= NOW() - 10m` визначає grouping; ми
 *      перевіряємо, що windowMs параметризується.
 *   4. Fallthrough при API-помилці — `editMessageText` повертає 4xx →
 *      fallback на новий `sendMessage` + log warn.
 *   5. Counter formatter — корректний text "🔁 N× за 10 хв: …".
 *
 * Стратегія: мокаємо `pg.Pool` (як у `store.test.ts`) + `TelegramApiClient`
 * port. Жодних реальних HTTP-викликів.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  DEFAULT_DEDUP_WINDOW_MS,
  formatOccurrenceCounterText,
  postOrEditDedupedAlert,
  type PostOrEditDedupedAlertInput,
  type TelegramApiClient,
} from "./telegramShipper.js";

// ─────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function makePool(): MockPool {
  return { query: vi.fn() };
}

type MockFn = ReturnType<typeof vi.fn>;

interface MockClient {
  sendMessage: MockFn;
  editMessageText: MockFn;
  asTelegramClient: TelegramApiClient;
}

function makeClient(): MockClient {
  const sendMessage = vi.fn();
  const editMessageText = vi.fn();
  const asClient: TelegramApiClient = {
    sendMessage: sendMessage as unknown as TelegramApiClient["sendMessage"],
    editMessageText:
      editMessageText as unknown as TelegramApiClient["editMessageText"],
  };
  return {
    sendMessage,
    editMessageText,
    asTelegramClient: asClient,
  };
}

const BASE_INPUT: PostOrEditDedupedAlertInput = {
  alertId: "wf-15:exec-42",
  topic: "incidents",
  severity: "P1",
  summary: "Railway deploy failed",
  text: "⚠️ WF-15 failed: connection refused",
  chatId: -1001234567890,
  messageThreadId: 7,
};

const SIGNATURE = "wf-15:railway-deploy-failed:api";

// ─────────────────────────────────────────────────────────────────────────
// 1. Fresh send — first alert OR signature-less legacy mode
// ─────────────────────────────────────────────────────────────────────────

describe("postOrEditDedupedAlert — fresh send (no dedup match)", () => {
  let pool: MockPool;
  let client: ReturnType<typeof makeClient>;
  beforeEach(() => {
    pool = makePool();
    client = makeClient();
  });

  it("без dedupSignature → recordAlertPost + sendMessage + recordTelegramMessage", async () => {
    // recordAlertPost INSERT … RETURNING id (fresh)
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    // recordTelegramMessage UPDATE
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 555 });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      BASE_INPUT,
    );

    expect(result).toEqual({
      action: "sent",
      alertId: "wf-15:exec-42",
      messageId: 555,
      occurrenceCount: 1,
      alreadyPosted: false,
    });
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledWith({
      chatId: -1001234567890,
      messageThreadId: 7,
      text: BASE_INPUT.text,
      disableNotification: undefined,
    });
    // ensure NO editMessageText call on fresh path
    expect(client.editMessageText).not.toHaveBeenCalled();
  });

  it("з dedupSignature, але no recent match → fresh send + UPDATE dedup_signature", async () => {
    // 1) findRecentDedupMatch → no rows
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // 2) recordAlertPost INSERT → fresh
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "10" }] });
    // 3) UPDATE … SET dedup_signature = $2 (idempotent backfill)
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    // 4) recordTelegramMessage UPDATE
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "10" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 777 });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      { ...BASE_INPUT, dedupSignature: SIGNATURE },
    );

    expect(result).toMatchObject({
      action: "sent",
      messageId: 777,
      occurrenceCount: 1,
    });
    // 3-я query — UPDATE dedup_signature backfill
    const [updateSql, updateParams] = pool.query.mock.calls[2]!;
    expect(updateSql).toContain("SET dedup_signature = $2");
    expect(updateSql).toContain("dedup_signature IS NULL");
    expect(updateParams).toEqual(["wf-15:exec-42", SIGNATURE]);
  });

  it("recordAlertPost idempotent retry → alreadyPosted=true пропагується", async () => {
    // INSERT ON CONFLICT DO NOTHING → 0 rows
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // SELECT id fallback
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "5" }] });
    // recordTelegramMessage UPDATE
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "5" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 1 });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      BASE_INPUT,
    );
    if (result.action === "sent") {
      expect(result.alreadyPosted).toBe(true);
    } else {
      throw new Error(`expected action=sent, got ${result.action}`);
    }
  });

  it("sendMessage failure → action=error без recordTelegramMessage", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    client.sendMessage.mockResolvedValueOnce({
      ok: false,
      errorCode: 400,
      description: "Bad Request: can't parse entities",
    });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      BASE_INPUT,
    );
    expect(result).toEqual({
      action: "error",
      reason: "Bad Request: can't parse entities",
    });
    // recordTelegramMessage НЕ викликається на send-failure path.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Grace-period — dedup HIT within 10-min window
// ─────────────────────────────────────────────────────────────────────────

describe("postOrEditDedupedAlert — grace-period dedup HIT", () => {
  let pool: MockPool;
  let client: ReturnType<typeof makeClient>;
  beforeEach(() => {
    pool = makePool();
    client = makeClient();
  });

  it("matching row у вікні → editMessageText із counter-prefix", async () => {
    // findRecentDedupMatch → existing row
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "77",
          posted_at: new Date("2026-05-13T10:00:00Z"),
          alert_id: "wf-15:exec-1",
          topic: "incidents",
          severity: "P1",
          summary: "boom",
          ack_at: null,
          ack_by_tg_user_id: null,
          ack_action: null,
          escalated_at: null,
          metadata: {},
          dedup_signature: SIGNATURE,
          occurrence_count: 4,
          last_occurrence_at: new Date("2026-05-13T10:08:00Z"),
          telegram_chat_id: "-1001234567890",
          telegram_message_id: "99",
        },
      ],
    });
    // incrementOccurrence UPDATE → returns occurrence_count=5
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          occurrence_count: 5,
          last_occurrence_at: new Date("2026-05-13T10:09:30Z"),
        },
      ],
    });
    client.editMessageText.mockResolvedValueOnce({ ok: true });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      { ...BASE_INPUT, dedupSignature: SIGNATURE },
    );

    expect(result).toEqual({
      action: "edited",
      alertId: "wf-15:exec-42",
      groupAlertId: "wf-15:exec-1",
      messageId: 99,
      occurrenceCount: 5,
    });

    // editMessageText викликано з counter-prefix
    expect(client.editMessageText).toHaveBeenCalledTimes(1);
    const editCall = client.editMessageText.mock.calls[0]![0];
    expect(editCall.chatId).toBe(-1001234567890);
    expect(editCall.messageId).toBe(99);
    expect(editCall.text).toBe(`🔁 5× за 10 хв:\n${BASE_INPUT.text}`);

    // sendMessage НЕ викликаний.
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it("counter renders як plain (occurrence=1) для першого зустрічу", () => {
    expect(formatOccurrenceCounterText("hello", 1)).toBe("hello");
  });

  it("counter renders з prefix для N>1", () => {
    expect(formatOccurrenceCounterText("hello", 7, 10)).toBe(
      "🔁 7× за 10 хв:\nhello",
    );
  });

  it("counter window-minutes налаштовується", () => {
    expect(formatOccurrenceCounterText("hello", 2, 30)).toBe(
      "🔁 2× за 30 хв:\nhello",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Edge race на 10:00 — boundary behaviour
// ─────────────────────────────────────────────────────────────────────────

describe("postOrEditDedupedAlert — edge race at the 10-min boundary", () => {
  let pool: MockPool;
  let client: ReturnType<typeof makeClient>;
  beforeEach(() => {
    pool = makePool();
    client = makeClient();
  });

  it("default windowMs (10 хв) → секундний argument до make_interval", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 10 });

    await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      {
        ...BASE_INPUT,
        dedupSignature: SIGNATURE,
      },
    );

    expect(DEFAULT_DEDUP_WINDOW_MS).toBe(600_000);
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("make_interval(secs => $3::double precision)");
    expect(params).toEqual(["incidents", SIGNATURE, 600]);
  });

  it("кастомний windowMs пропускається у DB запит", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 11 });

    await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      {
        ...BASE_INPUT,
        dedupSignature: SIGNATURE,
        windowMs: 30 * 60 * 1000, // 30 хв
      },
    );

    const params = pool.query.mock.calls[0]![1] as unknown[];
    expect(params[2]).toBe(1800); // 30 хв = 1800 сек
  });

  it("exactly-at-boundary: DB поверне 0 (last_occurrence_at < NOW() - windowMs) → fresh send", async () => {
    // Симулюємо: рядок існує, але вийшов за межі вікна — `last_occurrence_at
    // < NOW() - 10m` фільтрує його. findRecentDedupMatch повертає null.
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "2" }] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "2" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 22 });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      { ...BASE_INPUT, dedupSignature: SIGNATURE },
    );
    expect(result.action).toBe("sent");
    if (result.action === "sent") {
      expect(result.occurrenceCount).toBe(1);
    }
    expect(client.editMessageText).not.toHaveBeenCalled();
  });

  it("windowMinutes у counter-prefix корректно округляється до цілих хвилин", async () => {
    // Match → edit. Виходимо з windowMs=605_000 (10.083 хв) → округлено до 10.
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "1",
          posted_at: new Date(),
          alert_id: "g-1",
          topic: "incidents",
          severity: "P1",
          summary: null,
          ack_at: null,
          ack_by_tg_user_id: null,
          ack_action: null,
          escalated_at: null,
          metadata: {},
          dedup_signature: SIGNATURE,
          occurrence_count: 1,
          last_occurrence_at: new Date(),
          telegram_chat_id: "-100",
          telegram_message_id: "5",
        },
      ],
    });
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ occurrence_count: 2, last_occurrence_at: new Date() }],
    });
    client.editMessageText.mockResolvedValueOnce({ ok: true });

    await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      {
        ...BASE_INPUT,
        dedupSignature: SIGNATURE,
        windowMs: 605_000,
      },
    );

    const editText = client.editMessageText.mock.calls[0]![0].text as string;
    expect(editText).toContain("за 10 хв"); // 605_000 ms → 10 min rounded
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Fallthrough при API-помилці
// ─────────────────────────────────────────────────────────────────────────

describe("postOrEditDedupedAlert — fallthrough on Telegram API error", () => {
  let pool: MockPool;
  let client: ReturnType<typeof makeClient>;
  beforeEach(() => {
    pool = makePool();
    client = makeClient();
  });

  it("editMessageText fails (400 message_to_edit_not_found) → fallback на sendMessage", async () => {
    // 1) findRecentDedupMatch → existing row
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "1",
          posted_at: new Date(),
          alert_id: "g-1",
          topic: "incidents",
          severity: "P1",
          summary: null,
          ack_at: null,
          ack_by_tg_user_id: null,
          ack_action: null,
          escalated_at: null,
          metadata: {},
          dedup_signature: SIGNATURE,
          occurrence_count: 1,
          last_occurrence_at: new Date(),
          telegram_chat_id: "-100",
          telegram_message_id: "5",
        },
      ],
    });
    // 2) incrementOccurrence
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ occurrence_count: 2, last_occurrence_at: new Date() }],
    });
    // 3) Telegram editMessageText fails
    client.editMessageText.mockResolvedValueOnce({
      ok: false,
      errorCode: 400,
      description: "message to edit not found",
    });
    // 4) freshSend → recordAlertPost
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "2" }] });
    // 5) freshSend → UPDATE dedup_signature
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    // 6) freshSend → recordTelegramMessage
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "2" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 100 });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      { ...BASE_INPUT, dedupSignature: SIGNATURE },
    );

    expect(result).toEqual({
      action: "sent_after_edit_failure",
      alertId: "wf-15:exec-42",
      messageId: 100,
      occurrenceCount: 2,
      editError: "message to edit not found",
    });
    expect(client.editMessageText).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("editMessageText fails AND fallback sendMessage також fails → action=error", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "1",
          posted_at: new Date(),
          alert_id: "g-1",
          topic: "incidents",
          severity: "P1",
          summary: null,
          ack_at: null,
          ack_by_tg_user_id: null,
          ack_action: null,
          escalated_at: null,
          metadata: {},
          dedup_signature: SIGNATURE,
          occurrence_count: 1,
          last_occurrence_at: new Date(),
          telegram_chat_id: "-100",
          telegram_message_id: "5",
        },
      ],
    });
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ occurrence_count: 2, last_occurrence_at: new Date() }],
    });
    client.editMessageText.mockResolvedValueOnce({
      ok: false,
      errorCode: 400,
      description: "message_not_found",
    });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "2" }] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    client.sendMessage.mockResolvedValueOnce({
      ok: false,
      errorCode: 502,
      description: "Bad Gateway",
    });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      { ...BASE_INPUT, dedupSignature: SIGNATURE },
    );
    expect(result).toEqual({
      action: "error",
      reason: "Bad Gateway",
    });
  });

  it("DB error під час findRecentDedupMatch → fallback на freshSend (fail-open)", async () => {
    // findRecentDedupMatch → throw
    pool.query.mockRejectedValueOnce(new Error("connection refused"));
    // freshSend → recordAlertPost
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 50 });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      { ...BASE_INPUT, dedupSignature: SIGNATURE },
    );

    expect(result).toMatchObject({
      action: "sent",
      messageId: 50,
      occurrenceCount: 1,
    });
    // Жодного editMessageText виклику.
    expect(client.editMessageText).not.toHaveBeenCalled();
  });

  it("row knows-no-message_id (legacy row, n8n не записав) → fresh send без edit-у", async () => {
    // findRecentDedupMatch → matched row, але без message_id
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "1",
          posted_at: new Date(),
          alert_id: "legacy",
          topic: "incidents",
          severity: "P1",
          summary: null,
          ack_at: null,
          ack_by_tg_user_id: null,
          ack_action: null,
          escalated_at: null,
          metadata: {},
          dedup_signature: SIGNATURE,
          occurrence_count: 1,
          last_occurrence_at: new Date(),
          telegram_chat_id: null,
          telegram_message_id: null,
        },
      ],
    });
    // freshSend path
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "2" }] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "2" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 60 });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      { ...BASE_INPUT, dedupSignature: SIGNATURE },
    );
    expect(result.action).toBe("sent");
    expect(client.editMessageText).not.toHaveBeenCalled();
  });

  it("incrementOccurrence повертає NaN (row vanished race) → fallback на freshSend", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: "1",
          posted_at: new Date(),
          alert_id: "g-1",
          topic: "incidents",
          severity: "P1",
          summary: null,
          ack_at: null,
          ack_by_tg_user_id: null,
          ack_action: null,
          escalated_at: null,
          metadata: {},
          dedup_signature: SIGNATURE,
          occurrence_count: 1,
          last_occurrence_at: new Date(),
          telegram_chat_id: "-100",
          telegram_message_id: "5",
        },
      ],
    });
    // incrementOccurrence → rowCount: 0 → NaN guard
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // freshSend path
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "9" }] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "9" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 80 });

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      { ...BASE_INPUT, dedupSignature: SIGNATURE },
    );
    expect(result.action).toBe("sent");
    expect(client.editMessageText).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. recordTelegramMessage non-fatal failure on fresh send
// ─────────────────────────────────────────────────────────────────────────

describe("postOrEditDedupedAlert — recordTelegramMessage non-fatal failure", () => {
  let pool: MockPool;
  let client: ReturnType<typeof makeClient>;
  beforeEach(() => {
    pool = makePool();
    client = makeClient();
  });

  it("recordTelegramMessage throws → message все одно delivered, action=sent", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "1" }] });
    client.sendMessage.mockResolvedValueOnce({ ok: true, messageId: 12 });
    // recordTelegramMessage UPDATE throws → swallowed by inner try/catch
    pool.query.mockRejectedValueOnce(new Error("connection lost"));

    const result = await postOrEditDedupedAlert(
      pool as unknown as Pool,
      client.asTelegramClient,
      BASE_INPUT,
    );
    expect(result).toMatchObject({
      action: "sent",
      messageId: 12,
    });
  });
});
