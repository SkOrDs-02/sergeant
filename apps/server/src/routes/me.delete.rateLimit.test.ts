import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * sec-10: `DELETE /api/me` звіряє пароль (scrypt ~130 мс) без app-ліміту, тобто
 * власник вкраденої сесії міг підбирати пароль без стелі, а будь-який
 * користувач забивав libuv threadpool. Тепер перед звіркою стоять два бакети:
 * per-IP (5/15хв) і per-user (20/15хв), див. `http/passwordCheckRateLimit.ts`.
 *
 * Окремий файл від `me.delete.route.test.ts` навмисно: in-memory/мок-бакети
 * живуть на рівні модуля, і додаткові запити там з'їли б бюджет тих тестів.
 *
 * Пул замоканий так, що `rate_limit_buckets` поводиться як справжній
 * лічильник по `(rl_key, subject)`; решта запитів (статус вікна видалення)
 * віддає порожній результат.
 */

const {
  mockPool,
  queryMock,
  buckets,
  getSessionUserMock,
  verifyPasswordMock,
  requestDeletionMock,
} = vi.hoisted(() => {
  const buckets = new Map<string, number>();
  const queryMock = vi.fn();
  const mockClient = { query: queryMock, release: vi.fn() };
  const mockPool = {
    query: queryMock,
    connect: vi.fn().mockResolvedValue(mockClient),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  return {
    mockPool,
    queryMock,
    buckets,
    getSessionUserMock: vi.fn(),
    verifyPasswordMock: vi.fn(),
    requestDeletionMock: vi.fn(),
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
  getFreshSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

vi.mock("./../modules/me/verifyAccountPassword.js", () => ({
  verifyAccountPassword: verifyPasswordMock,
}));

vi.mock("./../modules/me/dataRights.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./../modules/me/dataRights.js")>()),
  requestAccountDeletion: requestDeletionMock,
}));

import { createApp } from "./../app.js";

beforeEach(() => {
  buckets.clear();
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (
      typeof sql === "string" &&
      sql.includes("INSERT INTO rate_limit_buckets")
    ) {
      const [key, subject] = params as [string, string];
      const k = `${key}|${subject}`;
      const count = (buckets.get(k) ?? 0) + 1;
      buckets.set(k, count);
      return { rows: [{ count, elapsed_ms: "0" }] };
    }
    return { rows: [] };
  });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue({ id: "u1" });
  verifyPasswordMock.mockReset();
  verifyPasswordMock.mockResolvedValue({ ok: false });
  requestDeletionMock.mockReset();
  requestDeletionMock.mockResolvedValue({
    ok: true,
    deletedAt: "2026-09-23T10:00:00.000Z",
    scheduledPurgeAt: "2026-10-23T10:00:00.000Z",
  });
});

// `trust proxy` = 1 у `createApp`, тож `X-Forwarded-For` задає `req.ip`.
function del(app: ReturnType<typeof createApp>, ip: string, password: string) {
  return request(app)
    .delete("/api/me")
    .set("X-Requested-With", "XMLHttpRequest")
    .set("X-Forwarded-For", ip)
    .send({ password });
}

describe("DELETE /api/me — app-ліміт на звірку пароля (sec-10)", () => {
  it("6-та невірна спроба з однієї адреси → 429, scrypt не запускається", async () => {
    const app = createApp();

    for (let i = 0; i < 5; i += 1) {
      const res = await del(app, "203.0.113.1", "wrong");
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_PASSWORD");
    }
    const blocked = await del(app, "203.0.113.1", "wrong");

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMIT_IP");
    expect(blocked.headers["retry-after"]).toBeDefined();
    // Головне для DoS-вектора: звірка пароля (scrypt) відбулась рівно 5 разів.
    expect(verifyPasswordMock).toHaveBeenCalledTimes(5);
    expect(requestDeletionMock).not.toHaveBeenCalled();
  });

  it("правильний пароль зі своєї адреси не блокується підбором з чужої", async () => {
    const app = createApp();

    // Атакер зі вкраденою сесією вибиває СВІЙ IP-бакет.
    for (let i = 0; i < 6; i += 1) await del(app, "198.51.100.7", "guess");
    expect((await del(app, "198.51.100.7", "guess")).status).toBe(429);

    verifyPasswordMock.mockResolvedValue({ ok: true });
    const owner = await del(app, "203.0.113.50", "correct-horse");

    expect(owner.status).toBe(200);
    expect(owner.body.ok).toBe(true);
    expect(requestDeletionMock).toHaveBeenCalledTimes(1);
  });

  it("запит, відсічений IP-бакетом, не з'їдає per-user бюджет власника", async () => {
    const app = createApp();

    // 10 спроб з однієї адреси: 5 пройшли, 5 відсічені IP-бакетом.
    for (let i = 0; i < 10; i += 1) await del(app, "198.51.100.7", "guess");
    // Ще 15 з трьох інших адрес. Якби відсічені запити рахувалися й у
    // per-user бакеті, він був би вичерпаний уже на 5-й з них (10 + 5 + ...).
    for (const ip of ["192.0.2.1", "192.0.2.2", "192.0.2.3"]) {
      for (let i = 0; i < 5; i += 1) {
        const res = await del(app, ip, "guess");
        expect(res.status).toBe(400);
      }
    }
    // Рівно 5 + 15 = 20 дозволених; 21-ша, навіть зі свіжої адреси, → 429.
    const over = await del(app, "192.0.2.4", "guess");
    expect(over.status).toBe(429);
    expect(over.body.code).toBe("RATE_LIMIT_USER");
  });

  it("per-user стеля обмежує розподілений підбір по одній сесії", async () => {
    const app = createApp();

    let allowed = 0;
    for (let ip = 1; ip <= 8; ip += 1) {
      for (let i = 0; i < 5; i += 1) {
        const res = await del(app, `192.0.2.${ip}`, "guess");
        if (res.status === 400) allowed += 1;
      }
    }

    // 8 адрес × 5 = 40 спроб, але scrypt виконано не більше 20.
    expect(allowed).toBe(20);
    expect(verifyPasswordMock).toHaveBeenCalledTimes(20);
  });

  it("без сесії 401 і лічильники не рухаються", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const app = createApp();

    for (let i = 0; i < 8; i += 1) {
      const res = await del(app, "203.0.113.1", "x");
      expect(res.status).toBe(401);
    }
    expect(buckets.size).toBe(0);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });
});
