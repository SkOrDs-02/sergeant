import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../test/__mocks__/anthropic.js";

/**
 * sec-14 (ADR-0100): refine того самого знімка нічого не списує, refine будь-
 * якого іншого кадру списує `week:photo`, як analyze. Тут справжні
 * `requireAiQuota("photo")`, `analyze-photo` і `requireRefineGrantOrQuota`,
 * а Postgres замінено лічильником у памʼяті, який емулює SQL квоти й грантів.
 * Відро рахується по тому самому ключу, що й у `aiQuota.test.ts`.
 */

const { state } = vi.hoisted(() => ({
  state: {
    user: "u-free" as string,
    usage: new Map<string, number>(),
    grants: new Map<string, Date>(),
    failGrantInsert: false,
    failGrantSelect: false,
  },
}));

vi.mock("../../auth.js", () => ({
  getSessionUser: vi.fn(async () => ({ id: state.user })),
}));
vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());
vi.mock("../../db.js", () => {
  const query = vi.fn(async (text: string, values: unknown[]) => {
    if (/INSERT INTO ai_usage_daily/i.test(text)) {
      const [subject, day, bucket, endpoint, cost, limit] = values as [
        string,
        string,
        string,
        string,
        number,
        number,
      ];
      const key = `${subject}|${day}|${bucket}|${endpoint}`;
      const next = (state.usage.get(key) ?? 0) + cost;
      if (next > limit) return { rows: [], rowCount: 0 };
      state.usage.set(key, next);
      return { rows: [{ request_count: next }], rowCount: 1 };
    }
    if (/INSERT INTO ai_photo_refine_grants/i.test(text)) {
      if (state.failGrantInsert) throw new Error("grants table unavailable");
      const [user, sha, at] = values as [string, string, Date];
      state.grants.set(`${user}|${sha}`, at);
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT 1 FROM ai_photo_refine_grants/i.test(text)) {
      if (state.failGrantSelect) throw new Error("grants table unavailable");
      const [user, sha, freshAfter] = values as [string, string, Date];
      const at = state.grants.get(`${user}|${sha}`);
      const fresh = at !== undefined && at.getTime() > freshAfter.getTime();
      return {
        rows: fresh ? [{ "?column?": 1 }] : [],
        rowCount: fresh ? 1 : 0,
      };
    }
    if (/DELETE FROM ai_photo_refine_grants/i.test(text)) {
      const isGlobal = /ctid/i.test(text);
      const cutoff = (isGlobal ? values[0] : values[1]) as Date;
      for (const [k, at] of [...state.grants]) {
        const mine = isGlobal || k.startsWith(`${String(values[0])}|`);
        if (mine && at.getTime() < cutoff.getTime()) state.grants.delete(k);
      }
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
  const pool = { connect: vi.fn(), query };
  const passthrough = (_id: string, fn: (db: unknown) => unknown) => fn(pool);
  return {
    default: pool,
    pool,
    withUserContext: passthrough,
    withBypassContext: (fn: (db: unknown) => unknown) => fn(pool),
    withSubjectContext: passthrough,
  };
});

import { requireAiQuota } from "../../http/index.js";
import { logger } from "../../obs/logger.js";
import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import { aiQuotaCircuitBreaker } from "../chat/aiQuotaCircuitBreaker.js";
import analyzePhoto from "./analyze-photo.js";
import {
  REFINE_GRANT_TTL_MS,
  __photoRefineGrantTestHooks,
  photoSha256,
  requireRefineGrantOrQuota,
} from "./photoRefineGrant.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
function png(salt: number): string {
  const body = Buffer.alloc(200 - PNG_HEADER.length);
  body.writeUInt8(salt, 0);
  return Buffer.concat([PNG_HEADER, body]).toString("base64");
}
const PHOTO_A = png(1);
const PHOTO_B = png(2);

interface TestRes {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
  setHeader(name: string, value: string): void;
}
function makeRes(): TestRes & Response {
  const res: TestRes = {
    headers: {},
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  return res as unknown as TestRes & Response;
}
function makeReq(body: unknown): Request {
  return {
    headers: {},
    body,
    anthropicKey: "sk-test",
    user: { id: state.user },
    socket: { remoteAddress: "1.2.3.4" },
  } as unknown as Request;
}

const WEEK_KEY = (user: string) => `u:${user}|2026-06-08|week:photo|quota`;
const used = (user = "u-free") => state.usage.get(WEEK_KEY(user)) ?? 0;

/** analyze як на проді: квота фото -> хендлер. Повертає чи дійшов запит до кінця. */
async function analyze(image: string): Promise<{ status: number }> {
  const req = makeReq({ image_base64: image, mime_type: "image/png" });
  const res = makeRes();
  let passed = false;
  await requireAiQuota("photo")(req, res, (() => {
    passed = true;
  }) as NextFunction);
  if (!passed) return { status: res.statusCode };
  await analyzePhoto(req, res);
  return { status: res.statusCode };
}

/** refine як на проді: грант-або-квота. `passed` = дійшов би до refinePhoto. */
async function refine(
  body: unknown,
): Promise<{ passed: boolean; res: TestRes & Response }> {
  const req = makeReq(body);
  const res = makeRes();
  let passed = false;
  await requireRefineGrantOrQuota()(req, res, (() => {
    passed = true;
  }) as NextFunction);
  return { passed, res };
}

const ENV = ["AI_QUOTA_DISABLED", "AI_QUOTA_FOUNDER_IDS", "DATABASE_URL"];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) savedEnv[k] = process.env[k];
  process.env["DATABASE_URL"] = "postgres://ignored";
  delete process.env["AI_QUOTA_DISABLED"];
  delete process.env["AI_QUOTA_FOUNDER_IDS"];
  state.user = "u-free";
  state.usage.clear();
  state.grants.clear();
  state.failGrantInsert = false;
  state.failGrantSelect = false;
  aiQuotaCircuitBreaker.reset();
  __photoRefineGrantTestHooks.resetSweepClock();
  anthropicMessages.mockReset();
  anthropicMessages.mockImplementation(async () =>
    anthropicResponses.text(
      JSON.stringify({
        dishName: "Борщ",
        confidence: 0.8,
        macros: { kcal: 180, protein_g: 6, fat_g: 7, carbs_g: 22 },
      }),
    ),
  );
  vi.useFakeTimers();
  // Середа 2026-06-10 15:00 Kyiv, тиждень від понеділка 2026-06-08.
  vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("sec-14: refine того самого знімка", () => {
  it("analyze -> refine того самого image_base64: week:photo лишається на 1", async () => {
    expect((await analyze(PHOTO_A)).status).toBe(200);
    expect(used()).toBe(1);

    const { passed } = await refine({ image_base64: PHOTO_A });
    expect(passed).toBe(true);
    expect(used()).toBe(1);

    // Кілька refine підряд (людина відповідає на питання по черзі): все ще 1.
    expect((await refine({ image_base64: PHOTO_A })).passed).toBe(true);
    expect(used()).toBe(1);
  });

  it("пробіли навколо base64 не міняють «той самий знімок»", async () => {
    await analyze(PHOTO_A);
    const { passed } = await refine({ image_base64: `  ${PHOTO_A}\n` });
    expect(passed).toBe(true);
    expect(used()).toBe(1);
    expect(photoSha256(`  ${PHOTO_A}\n`)).toBe(photoSha256(PHOTO_A));
  });

  it("refine кадру без гранту списує 1 з week:photo", async () => {
    const { passed } = await refine({ image_base64: PHOTO_B });
    expect(passed).toBe(true);
    expect(used()).toBe(1);
  });

  it("refine ІНШОГО кадру після analyze списує ще 1", async () => {
    await analyze(PHOTO_A);
    const { passed } = await refine({ image_base64: PHOTO_B });
    expect(passed).toBe(true);
    expect(used()).toBe(2);
  });

  it("refine без гранту при вичерпаному відрі: 429 AI_PHOTO_QUOTA, refine не виконується", async () => {
    for (const salt of [10, 11, 12]) {
      expect((await analyze(png(salt))).status).toBe(200);
    }
    expect(used()).toBe(3);

    const { passed, res } = await refine({ image_base64: PHOTO_B });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ code: "AI_PHOTO_QUOTA", limit: 3 });
    expect(used()).toBe(3);
  });

  it("вичерпане відро не заважає refine кадру, який analyze уже проаналізував", async () => {
    await analyze(PHOTO_A);
    await analyze(png(20));
    await analyze(png(21));
    expect(used()).toBe(3);
    // PHOTO_A має грант, тож його refine проходить без списання...
    expect((await refine({ image_base64: PHOTO_A })).passed).toBe(true);
    expect(used()).toBe(3);
    // ...а чужий кадр уже ні.
    expect((await refine({ image_base64: PHOTO_B })).res.statusCode).toBe(429);
  });

  it("грант старший за 24 год не діє: refine списує", async () => {
    await analyze(PHOTO_A);
    expect(used()).toBe(1);

    vi.setSystemTime(Date.now() + REFINE_GRANT_TTL_MS - 60_000);
    expect((await refine({ image_base64: PHOTO_A })).passed).toBe(true);
    expect(used()).toBe(1);

    vi.setSystemTime(Date.now() + 2 * 60_000);
    const stale = await refine({ image_base64: PHOTO_A });
    expect(stale.passed).toBe(true);
    // Інша календарна доба в тому самому тижні: відро те саме, +1.
    expect(used()).toBe(2);
  });

  it("грант іншого користувача не діє", async () => {
    state.user = "u-alice";
    await analyze(PHOTO_A);
    expect(used("u-alice")).toBe(1);

    state.user = "u-bob";
    const { passed } = await refine({ image_base64: PHOTO_A });
    expect(passed).toBe(true);
    expect(used("u-bob")).toBe(1);
    expect(used("u-alice")).toBe(1);
  });

  it("збій запису гранту не ламає analyze, а refine потім списує квоту", async () => {
    state.failGrantInsert = true;
    const warn = vi.spyOn(logger, "warn");

    const res = await analyze(PHOTO_A);
    expect(res.status).toBe(200);
    expect(used()).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "photo_refine_grant_record_failed" }),
    );
    // У лог не потрапляє ні base64, ні хеш кадру.
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(PHOTO_A);
    expect(logged).not.toContain(photoSha256(PHOTO_A));

    state.failGrantInsert = false;
    expect((await refine({ image_base64: PHOTO_A })).passed).toBe(true);
    expect(used()).toBe(2);
  });

  it("збій пошуку гранту падає в звичайне списання, а не в безкоштовний refine", async () => {
    await analyze(PHOTO_A);
    state.failGrantSelect = true;
    expect((await refine({ image_base64: PHOTO_A })).passed).toBe(true);
    expect(used()).toBe(2);
  });

  it("невдалий analyze (upstream упав) гранту не видає", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: false, status: 500 },
      data: { error: { message: "boom" } },
    });
    await expect(analyze(PHOTO_A)).rejects.toBeDefined();
    expect(state.grants.size).toBe(0);
  });

  it("тіло без image_base64 квоту не списує: 400 дасть хендлер", async () => {
    const { passed } = await refine({ prior_result: {} });
    expect(passed).toBe(true);
    expect(used()).toBe(0);
  });

  it("AI_QUOTA_DISABLED: refine проходить без жодного списання", async () => {
    process.env["AI_QUOTA_DISABLED"] = "1";
    const { passed } = await refine({ image_base64: PHOTO_B });
    expect(passed).toBe(true);
    expect(used()).toBe(0);
  });

  it("founder не списує й без гранту", async () => {
    process.env["AI_QUOTA_FOUNDER_IDS"] = "u-free";
    const { passed } = await refine({ image_base64: PHOTO_B });
    expect(passed).toBe(true);
    expect(used()).toBe(0);
  });
});

describe("sec-14: підчищення прострочених грантів", () => {
  it("analyze прибирає прострочені гранти цього користувача, чужі лишає до глобального проходу", async () => {
    await analyze(PHOTO_A);
    state.grants.set(
      `u-other|stale`,
      new Date(Date.now() - 2 * REFINE_GRANT_TTL_MS),
    );
    state.grants.set(
      `u-free|stale`,
      new Date(Date.now() - 2 * REFINE_GRANT_TTL_MS),
    );

    // Перший analyze вже відпрацював глобальне підчищення, тож таймер
    // лишається «свіжим»: чужий прострочений рядок поки живий.
    vi.setSystemTime(Date.now() + 60_000);
    await analyze(PHOTO_B);
    expect(state.grants.has("u-free|stale")).toBe(false);
    expect(state.grants.has("u-other|stale")).toBe(true);

    // Через 10 хв глобальний прохід чистить і чужі.
    vi.setSystemTime(Date.now() + 11 * 60_000);
    await analyze(png(5));
    expect(state.grants.has("u-other|stale")).toBe(false);
  });
});
