import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * Route-level contract test для `PUT /api/me/profile` — L-8 Фаза 2
 * (2026-08-09, docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md).
 *
 * Головна гарантія, яку тут перевіряємо end-to-end (не лише юніт-рівнем
 * `profileMirror.test.ts`): дзеркалення `memoryBank` у `ai_memories` —
 * побічний ефект ПІСЛЯ upsert-у профілю, і навіть коли AI-memory-сервіс
 * падає (Voyage circuit open / мережева помилка), сам PUT все одно
 * повертає 200 з уже збереженим профілем (ПАСТКА 4 задачі L-8 Фаза 2).
 */

const {
  mockPool,
  queryMock,
  getSessionUserMock,
  rememberMock,
  forgetSourceMock,
} = vi.hoisted(() => {
  process.env["AI_MEMORY_ENABLED"] = "true";
  const queryMock = vi.fn();
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  const getSessionUserMock = vi.fn().mockResolvedValue(null);
  const rememberMock = vi.fn().mockResolvedValue(undefined);
  const forgetSourceMock = vi.fn().mockResolvedValue(undefined);
  return {
    mockPool,
    queryMock,
    getSessionUserMock,
    rememberMock,
    forgetSourceMock,
  };
});

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

vi.mock("./../modules/ai-memory/bootstrap.js", () => ({
  getAiMemory: () => ({
    remember: rememberMock,
    recall: vi.fn().mockResolvedValue([]),
    forgetUser: vi.fn().mockResolvedValue(0),
    forgetSource: forgetSourceMock,
    health: vi.fn().mockResolvedValue({ ok: true, provider: "pgvector" }),
  }),
}));

import { createApp } from "./../app.js";

const SAVED_ENABLED = process.env["AI_MEMORY_ENABLED"];

const STORED_PROFILE = {
  heightCm: 170,
  memoryBank: {
    entries: [
      {
        id: "fact-1",
        fact: "алергія на горіхи",
        category: "allergy",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

/** `upsertUserProfile`'s INSERT ... RETURNING → `profileMirror`'s SELECT existing rows. */
function scriptQueries(
  existingRows: Array<{ source_ref: string | null; content: string }> = [],
) {
  queryMock.mockImplementation((sql: string) => {
    if (typeof sql === "string" && sql.includes("INSERT INTO user_profile")) {
      return Promise.resolve({
        rows: [
          {
            payload: STORED_PROFILE,
            updated_at: new Date("2026-08-09T10:00:00.000Z"),
          },
        ],
      });
    }
    if (typeof sql === "string" && sql.includes("FROM ai_memories")) {
      return Promise.resolve({ rows: existingRows });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  queryMock.mockReset();
  scriptQueries();
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue({ id: "u1" });
  rememberMock.mockReset();
  rememberMock.mockResolvedValue(undefined);
  forgetSourceMock.mockReset();
  forgetSourceMock.mockResolvedValue(undefined);
  process.env["AI_MEMORY_ENABLED"] = "true";
});

afterAll(() => {
  if (SAVED_ENABLED === undefined) delete process.env["AI_MEMORY_ENABLED"];
  else process.env["AI_MEMORY_ENABLED"] = SAVED_ENABLED;
});

describe("PUT /api/me/profile — happy path", () => {
  it("зберігає профіль, дзеркалить новий факт у ai_memories, повертає 200", async () => {
    const app = createApp();
    const res = await request(app)
      .put("/api/me/profile")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ profile: STORED_PROFILE });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual(STORED_PROFILE);
    expect(rememberMock).toHaveBeenCalledTimes(1);
    const writes = rememberMock.mock.calls[0]?.[0];
    expect(writes).toEqual([
      expect.objectContaining({
        source: "profile",
        sourceRef: "fact-1",
        content: "алергія на горіхи",
      }),
    ]);
  });
});

describe("PUT /api/me/profile — ПАСТКА 4: ai-memory service падає, PUT все одно 200", () => {
  it("service.remember() кидає (Voyage circuit open) → профіль усе одно збережено і 200", async () => {
    rememberMock.mockRejectedValueOnce(new Error("circuit_open: voyage"));
    const app = createApp();
    const res = await request(app)
      .put("/api/me/profile")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ profile: STORED_PROFILE });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual(STORED_PROFILE);
  });
});

describe("PUT /api/me/profile — вимкнений консент не ламає збереження профілю", () => {
  it("service.remember() no-op-ить (як реальний service.ts при consent=false) → профіль усе одно збережено", async () => {
    // Дзеркалить справжню поведінку `service.ts::remember()` коли
    // `isConsentEnabled(userId)` === false для всіх inputs:
    // consentedInputs порожній → ранній return, жодного запису, без throw.
    rememberMock.mockImplementationOnce(async () => {});
    const app = createApp();
    const res = await request(app)
      .put("/api/me/profile")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ profile: STORED_PROFILE });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual(STORED_PROFILE);
    expect(rememberMock).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /api/me/profile — auth guard", () => {
  it("→ 401 без сесії, mirror не викликається", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app)
      .put("/api/me/profile")
      .set("X-Requested-With", "XMLHttpRequest")
      .send({ profile: STORED_PROFILE });

    expect(res.status).toBe(401);
    expect(rememberMock).not.toHaveBeenCalled();
  });
});
