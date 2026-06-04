/**
 * Юніт-тести для `uploadGzippedJsonl`.
 *
 * Контракт під тестом:
 *   1. Happy path: POST до правильного GCS URL, заголовки Authorization /
 *      Content-Type / Content-Encoding виставлені коректно — функція резолвиться.
 *   2. Non-2xx відповідь: функція рейзить Error з кодом статусу і prefix-текстом.
 *   3. Помилка токен-отримання: функція пробрасує помилку upstream, fetch
 *      не викликається.
 *   4. URL-encoding: `bucket` і `objectName` з спецсимволами кодуються
 *      через `encodeURIComponent`.
 */

import { describe, it, expect, vi } from "vitest";
import { uploadGzippedJsonl } from "./gcsUpload.js";

function makeSuccessResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => "",
  } as unknown as Response;
}

function makeFailureResponse(
  status: number,
  statusText: string,
  body = "server error",
): Response {
  return {
    ok: false,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response;
}

describe("uploadGzippedJsonl", () => {
  it("успішно завантажує об'єкт і виставляє правильні заголовки", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeSuccessResponse());
    const getAccessToken = vi.fn().mockResolvedValue("my-bearer-token");
    const gzippedBody = Buffer.from("fake-gzip-content");

    await expect(
      uploadGzippedJsonl(
        {
          bucket: "my-bucket",
          objectName: "path/to/object.jsonl.gz",
          gzippedBody,
        },
        { getAccessToken, fetchImpl },
      ),
    ).resolves.toBeUndefined();

    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("upload/storage/v1/b/my-bucket/o");
    expect(url).toContain("uploadType=media");
    expect(url).toContain("name=path%2Fto%2Fobject.jsonl.gz");

    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-bearer-token");
    expect(headers["Content-Encoding"]).toBe("gzip");
    expect(headers["Content-Type"]).toBe("application/x-ndjson");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(gzippedBody);
  });

  it("кидає Error при non-2xx відповіді і НЕ приховує статус-код", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        makeFailureResponse(503, "Service Unavailable", "quota exceeded"),
      );
    const getAccessToken = vi.fn().mockResolvedValue("tok");

    await expect(
      uploadGzippedJsonl(
        { bucket: "b", objectName: "obj", gzippedBody: Buffer.from("x") },
        { getAccessToken, fetchImpl },
      ),
    ).rejects.toThrow(/GCS upload failed: 503/);

    await expect(
      uploadGzippedJsonl(
        { bucket: "b", objectName: "obj", gzippedBody: Buffer.from("x") },
        { getAccessToken, fetchImpl },
      ),
    ).rejects.toThrow(/quota exceeded/);
  });

  it("пробрасує помилку якщо getAccessToken відмовив — fetch не викликається", async () => {
    const fetchImpl = vi.fn();
    const getAccessToken = vi
      .fn()
      .mockRejectedValue(new Error("credentials not found"));

    await expect(
      uploadGzippedJsonl(
        { bucket: "b", objectName: "obj", gzippedBody: Buffer.from("x") },
        { getAccessToken, fetchImpl },
      ),
    ).rejects.toThrow("credentials not found");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("URL-encodes bucket і objectName зі спецсимволами", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeSuccessResponse());
    const getAccessToken = vi.fn().mockResolvedValue("tok");

    await uploadGzippedJsonl(
      {
        bucket: "my bucket/with spaces",
        objectName: "archive/2026-05-15/table__1-2.jsonl.gz",
        gzippedBody: Buffer.from("data"),
      },
      { getAccessToken, fetchImpl },
    );

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain(encodeURIComponent("my bucket/with spaces"));
    expect(url).toContain(
      encodeURIComponent("archive/2026-05-15/table__1-2.jsonl.gz"),
    );
  });
});
