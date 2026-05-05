import { afterEach, describe, expect, it, vi } from "vitest";

import { queueAuthTransactionalEmail } from "./authTransactionalMail.js";

describe("queueAuthTransactionalEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["RESEND_API_KEY"];
    delete process.env["NODE_ENV"];
    delete process.env["RAILWAY_ENVIRONMENT"];
  });

  it("викликає Resend коли задано RESEND_API_KEY", async () => {
    process.env["RESEND_API_KEY"] = "re_test_key";
    process.env["NODE_ENV"] = "test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("{}"),
    });
    vi.stubGlobal("fetch", fetchMock);

    queueAuthTransactionalEmail({
      kind: "password_reset",
      to: "u@example.com",
      subject: "Test",
      text: "Hello",
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
