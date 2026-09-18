import { describe, expect, it } from "vitest";

import { classifyOutboxBootOutcome } from "./outboxBoot";

describe("classifyOutboxBootOutcome", () => {
  it("returns 'repaired' when the self-heal helper recovered the table", () => {
    // `repairPartialOutboxMigration` only returns `recovered: true`
    // on the post-002 corrupted shape (no live `sync_op_outbox`,
    // `sync_op_outbox_legacy` present). So `hadOutbox` is necessarily
    // `false` in this branch — but we encode the priority explicitly
    // in case the helper's contract ever loosens.
    expect(
      classifyOutboxBootOutcome({ hadOutbox: false, recovered: true }),
    ).toBe("repaired");
  });

  it("returns 'already_present' on a previously-converged DB", () => {
    expect(
      classifyOutboxBootOutcome({ hadOutbox: true, recovered: false }),
    ).toBe("already_present");
  });

  it("returns 'fresh' when the table did not exist and was created by the runner", () => {
    expect(
      classifyOutboxBootOutcome({ hadOutbox: false, recovered: false }),
    ).toBe("fresh");
  });

  it("prioritises 'repaired' over 'already_present' when both flags are set", () => {
    // Defence-in-depth: a future repair helper that leaves the
    // legacy table renamed back *and* somehow flags `hadOutbox`
    // (e.g. by snapshotting after repair) should still be tagged
    // as a recovery, not a healthy boot.
    expect(
      classifyOutboxBootOutcome({ hadOutbox: true, recovered: true }),
    ).toBe("repaired");
  });
});
