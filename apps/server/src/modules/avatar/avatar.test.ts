import { describe, expect, it, vi } from "vitest";
import {
  buildAvatarImageUrl,
  detectImageType,
  loadAvatar,
  removeAvatar,
  saveAvatar,
} from "./avatar.js";

describe("detectImageType", () => {
  it("PNG, JPEG, WebP за magic bytes", () => {
    expect(
      detectImageType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe("image/png");
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe(
      "image/jpeg",
    );
    expect(
      detectImageType(
        Buffer.concat([
          Buffer.from("RIFF", "latin1"),
          Buffer.alloc(4),
          Buffer.from("WEBP", "latin1"),
        ]),
      ),
    ).toBe("image/webp");
  });

  it("відхиляє GIF, SVG, RIFF-не-WebP (WAV), обрізані й порожні буфери", () => {
    expect(detectImageType(Buffer.from("GIF89a"))).toBeNull();
    expect(detectImageType(Buffer.from("<svg xmlns=''/>"))).toBeNull();
    expect(
      detectImageType(
        Buffer.concat([
          Buffer.from("RIFF", "latin1"),
          Buffer.alloc(4),
          Buffer.from("WAVE", "latin1"),
        ]),
      ),
    ).toBeNull();
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("buildAvatarImageUrl", () => {
  it("відносний шлях з epoch-мс, id кодується", () => {
    expect(buildAvatarImageUrl("abc", new Date(1790000000123))).toBe(
      "/api/avatar/abc?v=1790000000123",
    );
    expect(buildAvatarImageUrl("a/b c", new Date(1))).toBe(
      "/api/avatar/a%2Fb%20c?v=1",
    );
  });
});

describe("SQL-шар", () => {
  it("saveAvatar: upsert, потім user.image = URL з updated_at", async () => {
    const updatedAt = new Date(1790000000000);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ updated_at: updatedAt }] })
      .mockResolvedValueOnce({ rows: [] });
    const data = Buffer.from([1, 2, 3]);
    const out = await saveAvatar({ query } as never, "u1", "image/png", data);
    expect(out).toEqual({
      image: "/api/avatar/u1?v=1790000000000",
      updatedAt,
    });
    expect(query.mock.calls[0]?.[0]).toMatch(
      /ON CONFLICT \(user_id\) DO UPDATE/,
    );
    expect(query.mock.calls[0]?.[1]).toEqual(["u1", "image/png", data]);
    expect(query.mock.calls[1]?.[1]).toEqual([out.image, "u1"]);
  });

  it("loadAvatar: null без рядка, camelCase з рядка", async () => {
    const q = vi.fn().mockResolvedValueOnce({ rows: [] });
    expect(await loadAvatar({ query: q } as never, "u1")).toBeNull();
    const row = {
      content_type: "image/webp",
      data: Buffer.from([9]),
      updated_at: new Date(5),
    };
    q.mockResolvedValueOnce({ rows: [row] });
    expect(await loadAvatar({ query: q } as never, "u1")).toEqual({
      contentType: "image/webp",
      data: row.data,
      updatedAt: row.updated_at,
    });
  });

  it("removeAvatar: DELETE рядка і image = NULL", async () => {
    const q = vi.fn().mockResolvedValue({ rows: [] });
    await removeAvatar({ query: q } as never, "u1");
    expect(q.mock.calls[0]?.[0]).toMatch(/DELETE FROM user_avatars/);
    expect(q.mock.calls[1]?.[0]).toMatch(/image = NULL/);
  });
});
