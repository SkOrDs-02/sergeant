import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpClient } from "../httpClient";
import type { RequestOptions } from "../types";
import {
  createSilpoEndpoints,
  silpoConnectUrl,
  type SilpoEndpoints,
} from "./silpo";

type Options = Pick<RequestOptions, "signal">;
interface Call {
  name: string;
  method: string;
  path: string;
  invoke: (api: SilpoEndpoints, options: Options) => Promise<unknown>;
}
// Each wrapper has its own request/response schema and cancellation boundary.
const calls: Call[] = [
  {
    name: "disconnect",
    method: "POST",
    path: "/disconnect",
    invoke: (api, opts) => api.disconnect(opts),
  },
  {
    name: "wipe",
    method: "POST",
    path: "/wipe",
    invoke: (api, opts) => api.wipe(opts),
  },
  {
    name: "unlink",
    method: "DELETE",
    path: "/receipts/link/transaction",
    invoke: (api, opts) => api.unlinkReceipt("transaction", opts),
  },
  {
    name: "relink",
    method: "POST",
    path: "/receipts/link/transaction",
    invoke: (api, opts) => api.relinkReceipt("transaction", "receipt", opts),
  },
  {
    name: "sync state",
    method: "GET",
    path: "/sync-state",
    invoke: (api, opts) => api.syncState(opts),
  },
  {
    name: "settings",
    method: "PUT",
    path: "/settings",
    invoke: (api, opts) => api.updateSettings({ pantryAutoImport: true }, opts),
  },
  {
    name: "pantry claim",
    method: "POST",
    path: "/receipts/receipt/pantry-claim",
    invoke: (api, opts) =>
      api.pantryClaim("receipt", { itemIds: [1], mode: "manual" }, opts),
  },
  {
    name: "pantry release",
    method: "POST",
    path: "/receipts/receipt/pantry-release",
    invoke: (api, opts) =>
      api.pantryRelease("receipt", { itemIds: [1], decline: false }, opts),
  },
  {
    name: "sync",
    method: "POST",
    path: "/sync",
    invoke: (api, opts) => api.sync(opts),
  },
  {
    name: "receipts",
    method: "GET",
    path: "/receipts",
    invoke: (api, opts) => api.receipts(undefined, opts),
  },
  {
    name: "receipt detail",
    method: "GET",
    path: "/receipts/receipt",
    invoke: (api, opts) => api.receiptDetail("receipt", opts),
  },
  {
    name: "cart preview",
    method: "POST",
    path: "/cart/preview",
    invoke: (api, opts) =>
      api.cartPreview([{ name: "Молоко", quantity: 2 }], opts),
  },
  {
    name: "cart apply",
    method: "POST",
    path: "/cart/apply",
    invoke: (api, opts) =>
      api.cartApply([{ lagerId: "product", quantity: 2 }], opts),
  },
  {
    name: "cart clear",
    method: "POST",
    path: "/cart/clear",
    invoke: (api, opts) => api.cartClear(opts),
  },
  {
    name: "cart get",
    method: "GET",
    path: "/cart",
    invoke: (api, opts) => api.cartGet(opts),
  },
];
interface Received {
  method: string | undefined;
  url: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}
let server: Server;
let baseUrl: string;
let requests: Received[];
let responseBody: unknown;
let status: number;
let hold: boolean;
let arrived: Promise<Received>;
let notify: (value: Received) => void;

const api = (apiPrefix?: string) =>
  createSilpoEndpoints(
    createHttpClient({
      baseUrl,
      ...(apiPrefix !== undefined ? { apiPrefix } : {}),
    }),
  );

beforeEach(async () => {
  requests = [];
  responseBody = {};
  status = 200;
  hold = false;
  arrived = new Promise<Received>((resolve) => {
    notify = resolve;
  });
  server = createServer((request, response) => {
    let text = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      text += chunk;
    });
    request.on("error", () => {
      /* deliberate client abort */
    });
    request.on("end", () => {
      const received: Received = {
        method: request.method,
        url: request.url ?? "",
        headers: request.headers,
        body: text ? (JSON.parse(text) as unknown) : undefined,
      };
      requests.push(received);
      notify(received);
      if (hold) return;
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(responseBody));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

describe("Silpo through real HTTP, HttpClient and runtime schemas", () => {
  it.each(calls)("rejects an HTTP-200 schema drift for $name", async (call) => {
    await expect(call.invoke(api(), {})).rejects.toMatchObject({
      name: "ZodError",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: call.method,
      url: `/api/v1/silpo${call.path}`,
    });
    expect(requests[0]?.headers["x-requested-with"]).toBe("XMLHttpRequest");
  });

  it.each(calls)(
    "cancels an in-flight $name request after it reaches the server",
    async (call) => {
      hold = true;
      const controller = new AbortController();
      const outcome = call
        .invoke(api(), { signal: controller.signal })
        .catch((error: unknown) => error);
      const received = await arrived;
      expect(received).toMatchObject({
        method: call.method,
        url: `/api/v1/silpo${call.path}`,
      });
      controller.abort();
      await expect(outcome).resolves.toMatchObject({
        name: "ApiError",
        kind: "aborted",
        status: 0,
      });
      expect(requests).toHaveLength(1);
    },
  );

  const invalid: {
    name: string;
    invoke: (client: SilpoEndpoints) => Promise<unknown>;
  }[] = [
    {
      name: "settings boolean",
      invoke: (client) =>
        client.updateSettings({ pantryAutoImport: "true" } as never),
    },
    {
      name: "claim mode",
      invoke: (client) =>
        client.pantryClaim("receipt", {
          itemIds: [1],
          mode: "unexpected",
        } as never),
    },
    {
      name: "claim item ids",
      invoke: (client) =>
        client.pantryClaim("receipt", {
          itemIds: ["1"],
          mode: "manual",
        } as never),
    },
    {
      name: "release positive ids",
      invoke: (client) =>
        client.pantryRelease("receipt", { itemIds: [0], decline: false }),
    },
    { name: "empty preview", invoke: (client) => client.cartPreview([]) },
    {
      name: "blank preview name",
      invoke: (client) => client.cartPreview([{ name: "   " }]),
    },
    {
      name: "nonpositive cart quantity",
      invoke: (client) =>
        client.cartApply([{ lagerId: "product", quantity: 0 }]),
    },
    {
      name: "empty product id",
      invoke: (client) => client.cartApply([{ lagerId: "", quantity: 1 }]),
    },
  ];
  it.each(invalid)(
    "rejects invalid $name before any HTTP request",
    async ({ invoke }) => {
      await expect(invoke(api())).rejects.toMatchObject({ name: "ZodError" });
      expect(requests).toEqual([]);
    },
  );

  it("encodes an opaque receipt id as one path segment", async () => {
    const id = "receipt/ ?#%+✓";
    responseBody = {
      receiptId: id,
      purchasedAt: "2026-10-21T00:00:00.000Z",
      storeId: null,
      channel: "online",
      paymentHint: null,
      totalKop: 0,
      transactionId: null,
      items: [],
    };
    const result = await api().receiptDetail(id);
    expect(result.receiptId).toBe(id);
    expect(requests[0]?.url).toBe(
      `/api/v1/silpo/receipts/${encodeURIComponent(id)}`,
    );
  });

  it("unlinks an opaque transaction id with DELETE and no request body", async () => {
    const id = "txn/ ?#%+✓";
    responseBody = { ok: true, receiptId: "receipt" };
    await expect(api().unlinkReceipt(id)).resolves.toEqual(responseBody);
    expect(requests[0]).toMatchObject({
      method: "DELETE",
      url: `/api/v1/silpo/receipts/link/${encodeURIComponent(id)}`,
      body: undefined,
    });
  });

  it("relinks an encoded transaction without changing the receipt id in JSON", async () => {
    const transactionId = "txn/ ?#%+✓";
    const receiptId = "receipt/ ?#%+✓";
    responseBody = { ok: true };
    await api().relinkReceipt(transactionId, receiptId);
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: `/api/v1/silpo/receipts/link/${encodeURIComponent(transactionId)}`,
      body: { receiptId },
    });
  });

  it("round-trips pagination cursors and transaction filters without splitting query parameters", async () => {
    const params = {
      limit: 17,
      cursor: "2026-10-21T00:00:00Z:receipt /?&+",
      transactionId: "txn/+?&=#",
    };
    responseBody = { data: [], nextCursor: null };
    await api().receipts(params);
    const url = new URL(requests[0]!.url, baseUrl);
    expect(url.pathname).toBe("/api/v1/silpo/receipts");
    expect([...url.searchParams]).toEqual([
      ["limit", "17"],
      ["cursor", params.cursor],
      ["transactionId", params.transactionId],
    ]);
  });

  it("keeps cart-clear a bodyless POST when the client uses the legacy prefix", async () => {
    responseBody = { items: [], totalKop: 0, cartUrl: null };
    await expect(api("").cartClear()).resolves.toEqual(responseBody);
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: "/api/silpo/cart/clear",
      body: undefined,
    });
  });

  it("sends only validated pantry-claim fields and preserves the server's claimed subset", async () => {
    responseBody = { claimedItemIds: [20] };
    const result = await api().pantryClaim("receipt", {
      itemIds: [10, 20],
      mode: "manual",
      unexpected: "drop me",
    } as never);
    expect(result.claimedItemIds).toEqual([20]);
    expect(requests[0]?.body).toEqual({ itemIds: [10, 20], mode: "manual" });
  });

  it("preserves authentication failures on a destructive request instead of parsing them as successful data", async () => {
    status = 403;
    responseBody = { error: "session required", requestId: "local-request" };
    await expect(api().wipe()).rejects.toMatchObject({
      name: "ApiError",
      kind: "http",
      status: 403,
      isAuth: true,
      requestId: "local-request",
    });
    expect(requests).toHaveLength(1);
  });
});

describe("Silpo OAuth full-page navigation URL", () => {
  it("uses a relative versioned route by default", () => {
    expect(silpoConnectUrl()).toBe("/api/v1/silpo/connect");
  });
  it("joins an absolute base and a normalized custom API prefix", () => {
    expect(
      silpoConnectUrl({
        baseUrl: "https://local.example.test/",
        apiPrefix: "api/v9/",
      }),
    ).toBe("https://local.example.test/api/v9/silpo/connect");
  });
  it("supports a relative legacy-prefix deployment", () => {
    expect(silpoConnectUrl({ baseUrl: "", apiPrefix: "" })).toBe(
      "/api/silpo/connect",
    );
  });
});
