import { describe, expect, it } from "vitest";

import { outboxCheckpoint, trackOutboxWrite } from "./outboxCheckpoint";

describe("outboxCheckpoint", () => {
  it("waits for writes queued before the check and reports success", async () => {
    const settled = outboxCheckpoint();
    let release!: () => void;
    trackOutboxWrite(new Promise<void>((r) => (release = r)));

    let done = false;
    const result = settled().then((ok) => {
      done = true;
      return ok;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    release();
    expect(await result).toBe(true);
  });

  it("reports a write that failed after the mark", async () => {
    const settled = outboxCheckpoint();
    trackOutboxWrite(Promise.reject(new Error("disk I/O error")));
    expect(await settled()).toBe(false);
  });

  it("ignores failures that happened before the mark", async () => {
    trackOutboxWrite(Promise.reject(new Error("old")));
    await outboxCheckpoint()();
    const settled = outboxCheckpoint();
    trackOutboxWrite(Promise.resolve());
    expect(await settled()).toBe(true);
  });
});
