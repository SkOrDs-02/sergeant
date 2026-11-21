import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SYNC_PROTOCOL_QUERY_PARAM,
  SYNC_PROTOCOL_VERSION,
} from "@sergeant/shared";
import { ApiError } from "../ApiError";
import { createHttpClient, type HttpClient } from "../httpClient";
import { createSyncV2Endpoints, SYNC_V2_REQUEST_TIMEOUT_MS } from "./syncV2";

describe("pushV2 · версія протоколу (data-48)", () => {
  it("шле версію query-параметром (не заголовком - CORS старого бекенду)", async () => {
    const post = vi.fn(async () => ({}));
    const api = createSyncV2Endpoints({ post } as unknown as HttpClient);

    await api.pushV2([]);
    await api.pushV2([], { originDeviceId: "dev-1" });

    const calls = post.mock.calls as unknown as Array<
      [string, unknown, { query: Record<string, unknown>; headers?: unknown }]
    >;
    expect(calls[0]![2].query).toEqual({
      [SYNC_PROTOCOL_QUERY_PARAM]: SYNC_PROTOCOL_VERSION,
    });
    expect(calls[0]![2].headers).toBeUndefined();
    expect(calls[1]![2].headers).toEqual({ "X-Origin-Device-Id": "dev-1" });
  });
});

describe("pushV2/pullV2 · таймаут запиту (rel-27)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** fetch, що ніколи не відповідає сам: завершується лише через abort. */
  function hangingFetch() {
    return vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    ) as unknown as typeof fetch;
  }

  type Api = ReturnType<typeof createSyncV2Endpoints>;

  it.each([
    ["pushV2", (api: Api) => api.pushV2([])],
    ["pullV2", (api: Api) => api.pullV2(0)],
  ])(
    "%s без відповіді сервера падає ApiError після стелі, а не висить",
    async (_name, call) => {
      vi.useFakeTimers();
      const api = createSyncV2Endpoints(
        createHttpClient({ fetchImpl: hangingFetch() }),
      );

      let settled = false;
      const caught = call(api)
        .catch((e: unknown) => e)
        .finally(() => {
          settled = true;
        });

      await vi.advanceTimersByTimeAsync(SYNC_V2_REQUEST_TIMEOUT_MS - 1);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const err = await caught;
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).kind).toBe("aborted");
    },
  );

  it("стелю можна перевизначити через opts.timeoutMs", async () => {
    const post = vi.fn(async () => ({}));
    const get = vi.fn(async () => ({}));
    const api = createSyncV2Endpoints({ post, get } as unknown as HttpClient);

    await api.pushV2([]);
    await api.pushV2([], { timeoutMs: 5_000 });
    await api.pullV2(0, { timeoutMs: 7_000 });

    const posts = post.mock.calls as unknown as Array<
      [string, unknown, { timeoutMs?: number }]
    >;
    const gets = get.mock.calls as unknown as Array<
      [string, { timeoutMs?: number }]
    >;
    expect(posts[0]![2].timeoutMs).toBe(SYNC_V2_REQUEST_TIMEOUT_MS);
    expect(posts[1]![2].timeoutMs).toBe(5_000);
    expect(gets[0]![1].timeoutMs).toBe(7_000);
  });
});
