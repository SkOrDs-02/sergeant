import { describe, it, expect } from "vitest";

import { diffInjuriesOps, type FizrukInjurySnapshot } from "./injuries";

function snap(
  over: Partial<FizrukInjurySnapshot> & { id: string },
): FizrukInjurySnapshot {
  return {
    site: "knee",
    startedAt: "2026-08-01T10:00:00.000Z",
    clearedAt: null,
    note: "",
    ...over,
  };
}

describe("diffInjuriesOps", () => {
  it("emits nothing for identical state", () => {
    const a = [snap({ id: "inj_1" })];
    expect(diffInjuriesOps(a, [...a])).toEqual([]);
  });

  it("emits an upsert for a new mark", () => {
    const ops = diffInjuriesOps([], [snap({ id: "inj_1", site: "elbow" })]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "injury-upsert",
      injury: { id: "inj_1", site: "elbow", clearedAt: null },
    });
  });

  it("emits an upsert when a mark is CLEARED, not a delete", () => {
    // Clearing keeps the row — it is history, not a mistake. If this ever
    // became a delete, the server would lose the "what hurt and when" record.
    const prev = [snap({ id: "inj_1" })];
    const next = [snap({ id: "inj_1", clearedAt: "2026-08-05T09:00:00.000Z" })];
    const ops = diffInjuriesOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "injury-upsert",
      injury: { clearedAt: "2026-08-05T09:00:00.000Z" },
    });
  });

  it("emits a delete when a mark is removed outright", () => {
    const ops = diffInjuriesOps([snap({ id: "inj_1" })], []);
    expect(ops).toEqual([{ kind: "injury-delete", injuryId: "inj_1" }]);
  });

  it("notices a note edit", () => {
    const ops = diffInjuriesOps(
      [snap({ id: "inj_1" })],
      [snap({ id: "inj_1", note: "болить після присіду" })],
    );
    expect(ops).toHaveLength(1);
  });

  it("notices a site correction", () => {
    const ops = diffInjuriesOps(
      [snap({ id: "inj_1", site: "knee" })],
      [snap({ id: "inj_1", site: "hip" })],
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ injury: { site: "hip" } });
  });
});
