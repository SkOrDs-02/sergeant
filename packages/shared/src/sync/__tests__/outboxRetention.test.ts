import { describe, it, expect, vi } from "vitest";

import {
  sweepStaleTerminalOutbox,
  type OutboxRetentionBreadcrumb,
} from "../outboxRetention";

describe("sweepStaleTerminalOutbox", () => {
  it("breadcrumbs and returns the count when rows were purged", async () => {
    const breadcrumbs: OutboxRetentionBreadcrumb[] = [];
    const purged = await sweepStaleTerminalOutbox({
      purge: () => Promise.resolve({ purged: 4 }),
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });

    expect(purged).toBe(4);
    expect(breadcrumbs).toEqual([
      {
        category: "sync",
        level: "info",
        message: "sync_op_outbox.retention purged=4",
      },
    ]);
  });

  it("does not breadcrumb on a no-op (purged=0)", async () => {
    const addBreadcrumb = vi.fn();
    const purged = await sweepStaleTerminalOutbox({
      purge: () => Promise.resolve({ purged: 0 }),
      addBreadcrumb,
    });

    expect(purged).toBe(0);
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it("swallows a purge error, captures it, and returns 0", async () => {
    const addBreadcrumb = vi.fn();
    const captureException = vi.fn();
    const boom = new Error("sqlite locked");

    const purged = await sweepStaleTerminalOutbox({
      purge: () => Promise.reject(boom),
      addBreadcrumb,
      captureException,
    });

    expect(purged).toBe(0);
    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(boom, {
      scope: "sync-outbox-retention",
    });
  });

  it("does not throw when purge fails and no captureException is provided", async () => {
    await expect(
      sweepStaleTerminalOutbox({
        purge: () => Promise.reject(new Error("nope")),
        addBreadcrumb: vi.fn(),
      }),
    ).resolves.toBe(0);
  });
});
