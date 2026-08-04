import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  deleteResendContact,
  deleteSentryUser,
  deleteStripeCustomer,
} from "./externalDelete.js";

beforeEach(() => {
  delete process.env["STRIPE_SECRET_KEY"];
  delete process.env["SENTRY_AUTH_TOKEN"];
  delete process.env["SENTRY_ORG_SLUG"];
  delete process.env["SENTRY_PROJECT_SLUG"];
  delete process.env["RESEND_API_KEY"];
  delete process.env["RESEND_AUDIENCE_ID"];
});

describe("deleteStripeCustomer", () => {
  it("skips when STRIPE_SECRET_KEY is unset", async () => {
    const result = await deleteStripeCustomer("cus_1");
    expect(result).toEqual({ outcome: "skipped" });
  });

  it("skips when there is no stripe_customer_id, even with a configured key", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_123";
    const result = await deleteStripeCustomer(null);
    expect(result).toEqual({ outcome: "skipped" });
  });

  it("calls DELETE with Basic-auth(secretKey:) when both are present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await deleteStripeCustomer("cus_1", {
      secretKey: "sk_test_123",
      fetchImpl,
    });
    expect(result.outcome).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/customers/cus_1");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("sk_test_123:").toString("base64")}`,
    );
  });

  it("maps 404 to not_found (idempotent — already deleted)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const result = await deleteStripeCustomer("cus_1", {
      secretKey: "sk_test_123",
      fetchImpl,
    });
    expect(result.outcome).toBe("not_found");
  });
});

describe("deleteSentryUser", () => {
  it("skips when auth token / org / project are unset", async () => {
    const result = await deleteSentryUser("user-1");
    expect(result).toEqual({ outcome: "skipped" });
  });

  it("calls DELETE against the org/project users endpoint when configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const result = await deleteSentryUser("user-1", {
      authToken: "tok",
      orgSlug: "sergeant",
      projectSlug: "api",
      fetchImpl,
    });
    expect(result.outcome).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://sentry.io/api/0/projects/sergeant/api/users/user-1/",
    );
    expect(init.headers.Authorization).toBe("Bearer tok");
  });
});

describe("deleteResendContact", () => {
  it("skips when API key / audience id are unset", async () => {
    const result = await deleteResendContact("u@example.com");
    expect(result).toEqual({ outcome: "skipped" });
  });

  it("calls DELETE against the audience contacts endpoint when configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await deleteResendContact("u@example.com", {
      apiKey: "re_123",
      audienceId: "aud_1",
      fetchImpl,
    });
    expect(result.outcome).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://api.resend.com/audiences/aud_1/contacts/u%40example.com",
    );
    expect(init.headers.Authorization).toBe("Bearer re_123");
  });
});
