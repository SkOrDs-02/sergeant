import { describe, expect, it, vi } from "vitest";
import {
  SYNC_PROTOCOL_QUERY_PARAM,
  SYNC_PROTOCOL_VERSION,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import { createSyncV2Endpoints } from "./syncV2";

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
