import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_TEXT_CONTINUATIONS,
  refundQuotaOnUpstreamFailure,
} from "./chatShared.js";

describe("chatShared", () => {
  it("exposes a bounded continuation cap for streaming text responses", () => {
    expect(MAX_TEXT_CONTINUATIONS).toBeGreaterThanOrEqual(0);
    expect(MAX_TEXT_CONTINUATIONS).toBeLessThanOrEqual(10);
  });

  it("invokes the attached quota refund closure on upstream failure", async () => {
    const aiQuotaRefund = vi.fn().mockResolvedValue(undefined);
    const req = { aiQuotaRefund } as unknown as Request;

    await refundQuotaOnUpstreamFailure(req);

    expect(aiQuotaRefund).toHaveBeenCalledTimes(1);
  });

  it("keeps refunds best-effort when the closure is absent or rejects", async () => {
    await expect(
      refundQuotaOnUpstreamFailure({} as Request),
    ).resolves.toBeUndefined();

    await expect(
      refundQuotaOnUpstreamFailure({
        aiQuotaRefund: vi.fn().mockRejectedValue(new Error("db down")),
      } as unknown as Request),
    ).resolves.toBeUndefined();
  });
});
