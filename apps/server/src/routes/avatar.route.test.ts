import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AVATAR_MAX_BYTES, AvatarPutResponseSchema } from "@sergeant/shared";

/**
 * Route-level тест `/api/avatar` (ux-14, migration 161).
 *
 * Пул замоканий невеликим in-memory «Postgres» для `user_avatars` і
 * `"user".image`: тест перевіряє не SQL-рядки, а поведінку роуту -
 * авторизацію, ліміти, magic bytes, upsert, заголовки GET. Живий SQL
 * (bytea, FK-каскад) закриває `migrations/__tests__/161-user-avatars.test.ts`.
 */

const { mockPool, queryMock, getSessionUserMock, store } = vi.hoisted(() => {
  const store = {
    avatars: new Map<
      string,
      { content_type: string; data: Buffer; updated_at: Date }
    >(),
    images: new Map<string, string | null>(),
    clock: 1_790_000_000_000,
  };
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
    getSessionUserMock: vi.fn().mockResolvedValue(null),
    store,
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

import { createApp } from "./../app.js";

// Мінімальні валідні заголовки: достатньо для magic bytes, не для декодера.
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0x1a, 0, 0, 0]),
  Buffer.from("WEBPVP8 ", "latin1"),
  Buffer.alloc(32, 1),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 2),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32, 3),
]);

beforeEach(() => {
  store.avatars.clear();
  store.images.clear();
  store.clock = 1_790_000_000_000;
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO user_avatars")) {
      const [userId, contentType, data] = params as [string, string, Buffer];
      store.clock += 1000;
      const updated_at = new Date(store.clock);
      store.avatars.set(userId, {
        content_type: contentType,
        data,
        updated_at,
      });
      return { rows: [{ updated_at }] };
    }
    if (sql.includes('UPDATE "user" SET image = $1')) {
      const [image, userId] = params as [string, string];
      store.images.set(userId, image);
      return { rows: [] };
    }
    if (sql.startsWith("SELECT") && sql.includes("FROM user_avatars")) {
      const row = store.avatars.get(params[0] as string);
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("DELETE FROM user_avatars")) {
      store.avatars.delete(params[0] as string);
      return { rows: [] };
    }
    if (sql.includes('UPDATE "user" SET image = NULL')) {
      store.images.set(params[0] as string, null);
      return { rows: [] };
    }
    return { rows: [] };
  });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue({ id: "u1" });
});

function put(body: Buffer | string, contentType: string) {
  return request(createApp())
    .put("/api/avatar")
    .set("X-Requested-With", "XMLHttpRequest")
    .set("Content-Type", contentType)
    .send(body);
}

describe("PUT /api/avatar", () => {
  it("без сесії - 401, нічого не пишеться", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const res = await put(WEBP, "image/webp");
    expect(res.status).toBe(401);
    expect(store.avatars.size).toBe(0);
  });

  it.each([
    ["image/webp", WEBP],
    ["image/png", PNG],
    ["image/jpeg", JPEG],
  ])(
    "%s: upsert, user.image = короткий URL, відповідь за схемою",
    async (mime, bytes) => {
      const res = await put(bytes, mime);
      expect(res.status).toBe(200);
      const body = AvatarPutResponseSchema.parse(res.body);
      expect(body.image).toBe("/api/avatar/u1?v=1790000001000");
      expect(body.image.length).toBeLessThan(2048);
      expect(store.images.get("u1")).toBe(body.image);
      expect(store.avatars.get("u1")?.content_type).toBe(mime);
      expect(Buffer.compare(store.avatars.get("u1")!.data, bytes)).toBe(0);
    },
  );

  it("повторний PUT замінює рядок і міняє ?v=", async () => {
    const first = await put(WEBP, "image/webp");
    const second = await put(PNG, "image/png");
    expect(second.status).toBe(200);
    expect(second.body.image).not.toBe(first.body.image);
    expect(store.avatars.size).toBe(1);
    expect(store.avatars.get("u1")?.content_type).toBe("image/png");
  });

  it("тіло більше ліміту - 413 і нічого не пишеться", async () => {
    const big = Buffer.concat([WEBP, Buffer.alloc(AVATAR_MAX_BYTES, 7)]);
    const res = await put(big, "image/webp");
    expect(res.status).toBe(413);
    expect(store.avatars.size).toBe(0);
  });

  it("рівно AVATAR_MAX_BYTES - проходить", async () => {
    const edge = Buffer.concat([
      WEBP,
      Buffer.alloc(AVATAR_MAX_BYTES - WEBP.length, 7),
    ]);
    expect(edge.length).toBe(AVATAR_MAX_BYTES);
    const res = await put(edge, "image/webp");
    expect(res.status).toBe(200);
  });

  it("чужий MIME (image/gif, application/json, text/plain) - 415", async () => {
    for (const mime of ["image/gif", "text/plain"]) {
      const res = await put(WEBP, mime);
      expect(res.status).toBe(415);
    }
    const json = await put(JSON.stringify({ a: 1 }), "application/json");
    expect(json.status).toBe(415);
    expect(store.avatars.size).toBe(0);
  });

  it("magic bytes не збігаються із заявленим типом - 415", async () => {
    const res = await put(PNG, "image/webp");
    expect(res.status).toBe(415);
    const text = await put(Buffer.from("<svg onload=alert(1)>"), "image/png");
    expect(text.status).toBe(415);
    expect(store.avatars.size).toBe(0);
  });

  it("порожнє тіло - 400", async () => {
    const res = await put(Buffer.alloc(0), "image/webp");
    expect(res.status).toBe(400);
  });

  it("без X-Requested-With - 403 (CSRF-гейт)", async () => {
    const res = await request(createApp())
      .put("/api/avatar")
      .set("Content-Type", "image/webp")
      .send(WEBP);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/avatar/:userId", () => {
  async function upload() {
    const res = await put(WEBP, "image/webp");
    expect(res.status).toBe(200);
    return res.body.image as string;
  }

  it("власник отримує байти з безпечними заголовками", async () => {
    const image = await upload();
    const res = await request(createApp())
      .get(image)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-site");
    expect(Buffer.compare(res.body as Buffer, WEBP)).toBe(0);
  });

  it("без ?v= - private, no-cache (не immutable)", async () => {
    await upload();
    const res = await request(createApp()).get("/api/avatar/u1");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-cache");
  });

  it("також доступний через /api/v1/avatar/:userId", async () => {
    await upload();
    const res = await request(createApp()).get("/api/v1/avatar/u1?v=1");
    expect(res.status).toBe(200);
  });

  it("немає аватара - 404", async () => {
    const res = await request(createApp()).get("/api/avatar/u1?v=1");
    expect(res.status).toBe(404);
  });

  it("чужий userId - 404 (як і відсутній, без oracle), байти не читаються", async () => {
    store.avatars.set("u2", {
      content_type: "image/png",
      data: PNG,
      updated_at: new Date(),
    });
    const res = await request(createApp()).get("/api/avatar/u2?v=1");
    expect(res.status).toBe(404);
    expect(
      queryMock.mock.calls.some((c) =>
        String(c[0]).includes("FROM user_avatars"),
      ),
    ).toBe(false);
  });

  it("без сесії - 401", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const res = await request(createApp()).get("/api/avatar/u1?v=1");
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/avatar", () => {
  it("прибирає рядок і обнуляє user.image; повторний виклик ідемпотентний", async () => {
    await put(WEBP, "image/webp");
    const app = createApp();
    const first = await request(app)
      .delete("/api/avatar")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true });
    expect(store.avatars.size).toBe(0);
    expect(store.images.get("u1")).toBeNull();
    const again = await request(app)
      .delete("/api/avatar")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(again.status).toBe(200);
  });

  it("без сесії - 401", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const res = await request(createApp())
      .delete("/api/avatar")
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(401);
  });
});
