import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../obs/logger.js";
import {
  deleteResendContact,
  deleteSentryUser,
  deleteStripeCustomer,
  type VendorDeleteResult,
} from "./externalDelete.js";

interface VendorCase {
  name: string;
  url: string;
  run: (
    fetchImpl: typeof fetch,
    timeoutMs?: number,
  ) => Promise<VendorDeleteResult>;
}

const vendors: VendorCase[] = [
  {
    name: "stripe",
    url: "https://api.stripe.com/v1/customers/customer%2Fwith%20space%3F",
    run: (fetchImpl, timeoutMs) =>
      deleteStripeCustomer("customer/with space?", {
        secretKey: "test-stripe-key",
        fetchImpl,
        timeoutMs,
      }),
  },
  {
    name: "sentry",
    url: "https://sentry.example/api/0/projects/org%2Fname/project%20name/users/user%2Fid%3F/",
    run: (fetchImpl, timeoutMs) =>
      deleteSentryUser("user/id?", {
        authToken: "test-sentry-key",
        orgSlug: "org/name",
        projectSlug: "project name",
        host: "https://sentry.example///",
        fetchImpl,
        timeoutMs,
      }),
  },
  {
    name: "resend",
    url: "https://resend.example/contacts/person%2Btag%40example.com",
    run: (fetchImpl, timeoutMs) =>
      deleteResendContact("person+tag@example.com", {
        apiKey: "test-resend-key",
        host: "https://resend.example///",
        fetchImpl,
        timeoutMs,
      }),
  },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(vendors)("$name deletion failures", ({ name, url, run }) => {
  it("classifies 429 without consuming the response body or leaking a timer", async () => {
    const response = new Response("private vendor details", { status: 429 });
    const text = vi.spyOn(response, "text");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const result = await run(fetchImpl);
    expect(result).toMatchObject({
      outcome: "rate_limited",
      status: 429,
      ms: expect.any(Number),
    });
    expect(text).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a server failure using status and length, without copying vendor PII", async () => {
    const privateBody = "person@example.com customer_secret_private";
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(privateBody, { status: 503 }));
    const result = await run(fetchImpl);
    expect(result).toMatchObject({
      outcome: "error",
      status: 503,
      error: `${name} returned 503`,
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith({
      msg: `${name}_gdpr_delete_failed`,
      status: 503,
      bodyLength: privateBody.length,
    });
    expect(JSON.stringify({ result, logs: warn.mock.calls })).not.toContain(
      privateBody,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the HTTP failure when reading its error body also fails", async () => {
    const response = new Response(null, { status: 500 });
    vi.spyOn(response, "text").mockRejectedValue(
      new Error("body stream closed"),
    );
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const result = await run(vi.fn<typeof fetch>().mockResolvedValue(response));
    expect(result).toMatchObject({
      outcome: "error",
      status: 500,
      error: `${name} returned 500`,
    });
    expect(warn).toHaveBeenCalledWith({
      msg: `${name}_gdpr_delete_failed`,
      status: 500,
      bodyLength: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([new TypeError("connection reset"), "connection reset"])(
    "returns a tagged error when fetch rejects with %s",
    async (error) => {
      const result = await run(vi.fn<typeof fetch>().mockRejectedValue(error));
      expect(result).toMatchObject({
        outcome: "error",
        error: "connection reset",
        ms: expect.any(Number),
      });
      expect(result.status).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["AbortError", "TimeoutError"])(
    "classifies %s as a timeout",
    async (errorName) => {
      const result = await run(
        vi
          .fn<typeof fetch>()
          .mockRejectedValue(new DOMException("request aborted", errorName)),
      );
      expect(result).toMatchObject({
        outcome: "timeout",
        error: "request aborted",
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("aborts an outstanding request at the supplied deadline", async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("request aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const result = run(fetchImpl, 25);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(24);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await expect(result).resolves.toMatchObject({ outcome: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the default 10-second deadline after a successful response", async () => {
    let signal: AbortSignal | undefined;
    const result = run(
      vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        signal = init?.signal ?? undefined;
        return new Response(null, { status: 204 });
      }),
    );
    await expect(result).resolves.toMatchObject({ outcome: "ok", status: 204 });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signal?.aborted).toBe(false);
  });

  it("encodes each identifier as a path segment and strips host trailing slashes", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await run(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      url,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ Accept: "application/json" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

describe("Sentry deletion configuration and idempotency", () => {
  it.each(["authToken", "orgSlug", "projectSlug", "userId"])(
    "does not call the vendor when %s is empty",
    async (missing) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const values = {
        authToken: "test-token",
        orgSlug: "org",
        projectSlug: "project",
        userId: "user",
      };
      values[missing as keyof typeof values] = "";
      const result = await deleteSentryUser(values.userId, {
        ...values,
        fetchImpl,
      });
      expect(result).toEqual({ outcome: "skipped" });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("treats a missing Sentry user as successful idempotent cleanup", async () => {
    const response = new Response(null, { status: 404 });
    const result = await vendors[1]!.run(
      vi.fn<typeof fetch>().mockResolvedValue(response),
    );
    expect(result).toMatchObject({ outcome: "not_found", status: 404 });
  });
});

it("uses the global fetch transport and aborts at the default 10-second deadline", async () => {
  let signal: AbortSignal | undefined;
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("deadline elapsed", "AbortError")),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetchImpl);
  const result = deleteStripeCustomer("customer", {
    secretKey: "test-stripe-key",
  });
  await vi.advanceTimersByTimeAsync(9_999);
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toMatchObject({
    outcome: "timeout",
    error: "deadline elapsed",
  });
  expect(signal?.aborted).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
