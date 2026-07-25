import { describe, expect, it } from "vitest";

import {
  buildCompletionEventId,
  createCompletionEvent,
} from "./completionEvents.js";
import { foldCompletionEvents } from "./foldCompletionEvents.js";
import type { CompletionEvent } from "./types.js";

/**
 * W1-ROUTINE-APPEND стадія 1 — правило згортки журналу.
 *
 * Тести навмисно написані ДО появи читачів: у стадії 1 `foldCompletionEvents`
 * не викликається ніде в проді. Саме тому контракт треба зафіксувати зараз —
 * у стадії 3 на нього почнуть спиратись `sqliteReader` і parity-чекер.
 */

function ev(
  habitId: string,
  dateKey: string,
  state: "done" | "undone",
  occurredAt: string,
  deviceId: string | null = "dev-a",
): CompletionEvent {
  return createCompletionEvent(habitId, dateKey, state, {
    occurredAt,
    tzOffsetMin: 180,
    dayAnchor: "device-local",
    source: "ui",
    deviceId,
  });
}

describe("buildCompletionEventId", () => {
  it("детермінований — той самий toggle дає той самий id (ідемпотентність ретраю)", () => {
    const input = {
      habitId: "hab_1",
      dateKey: "2026-07-20",
      state: "done" as const,
      occurredAt: "2026-07-20T09:00:00.000+03:00",
      deviceId: "dev-a",
    };
    expect(buildCompletionEventId(input)).toBe(buildCompletionEventId(input));
  });

  it("різні пристрої в ту саму мілісекунду дають РІЗНІ id — журнал чесний", () => {
    const base = {
      habitId: "hab_1",
      dateKey: "2026-07-20",
      state: "done" as const,
      occurredAt: "2026-07-20T09:00:00.000+03:00",
    };
    expect(buildCompletionEventId({ ...base, deviceId: "dev-a" })).not.toBe(
      buildCompletionEventId({ ...base, deviceId: "dev-b" }),
    );
  });

  it("не використовує `:` як роздільник — не плутається з PK routine_entries", () => {
    const id = buildCompletionEventId({
      habitId: "hab_1",
      dateKey: "2026-07-20",
      state: "done",
      occurredAt: "2026-07-20T09:00:00.000+03:00",
      deviceId: null,
    });
    expect(id.split("|")).toHaveLength(5);
    expect(id.startsWith("hab_1|2026-07-20|")).toBe(true);
  });
});

describe("foldCompletionEvents", () => {
  it("порожній журнал → порожня згортка", () => {
    expect(foldCompletionEvents([])).toEqual({});
  });

  it("одна подія `done` → відмітка зʼявляється", () => {
    expect(
      foldCompletionEvents([
        ev("hab_1", "2026-07-20", "done", "2026-07-20T09:00:00.000+03:00"),
      ]),
    ).toEqual({ hab_1: ["2026-07-20"] });
  });

  it("toggle → untoggle → toggle згортається у «відмічено», нічого не втрачено", () => {
    const journal = [
      ev("hab_1", "2026-07-20", "done", "2026-07-20T09:00:00.000+03:00"),
      ev("hab_1", "2026-07-20", "undone", "2026-07-20T09:05:00.000+03:00"),
      ev("hab_1", "2026-07-20", "done", "2026-07-20T09:10:00.000+03:00"),
    ];
    expect(journal).toHaveLength(3);
    expect(foldCompletionEvents(journal)).toEqual({ hab_1: ["2026-07-20"] });
  });

  it("toggle → untoggle згортається у «не відмічено» (ключ звички зникає)", () => {
    expect(
      foldCompletionEvents([
        ev("hab_1", "2026-07-20", "done", "2026-07-20T09:00:00.000+03:00"),
        ev("hab_1", "2026-07-20", "undone", "2026-07-20T09:05:00.000+03:00"),
      ]),
    ).toEqual({});
  });

  it("порядок подій на вході не впливає на результат", () => {
    const a = ev(
      "hab_1",
      "2026-07-20",
      "done",
      "2026-07-20T09:00:00.000+03:00",
    );
    const b = ev(
      "hab_1",
      "2026-07-20",
      "undone",
      "2026-07-20T09:05:00.000+03:00",
    );
    expect(foldCompletionEvents([a, b])).toEqual(foldCompletionEvents([b, a]));
  });

  it("два пристрої: виграє пізніший `occurredAt`, а не пізніша доставка", () => {
    // dev-b зняв відмітку пізніше, але його подія прийшла ПЕРШОЮ.
    const later = ev(
      "hab_1",
      "2026-07-20",
      "undone",
      "2026-07-20T12:00:00.000+03:00",
      "dev-b",
    );
    const earlier = ev(
      "hab_1",
      "2026-07-20",
      "done",
      "2026-07-20T08:00:00.000+03:00",
      "dev-a",
    );
    expect(foldCompletionEvents([later, earlier])).toEqual({});
  });

  it("два пристрої в ту саму мілісекунду: tie-break за id — результат детермінований", () => {
    const a = ev(
      "hab_1",
      "2026-07-20",
      "done",
      "2026-07-20T09:00:00.000+03:00",
      "dev-a",
    );
    const b = ev(
      "hab_1",
      "2026-07-20",
      "undone",
      "2026-07-20T09:00:00.000+03:00",
      "dev-b",
    );
    // Більший id виграє; порядок на вході значення не має.
    const expected = a.id > b.id ? { hab_1: ["2026-07-20"] } : {};
    expect(foldCompletionEvents([a, b])).toEqual(expected);
    expect(foldCompletionEvents([b, a])).toEqual(expected);
  });

  it("розводить різні звички і різні дні, dateKey відсортовані", () => {
    expect(
      foldCompletionEvents([
        ev("hab_2", "2026-07-21", "done", "2026-07-21T09:00:00.000+03:00"),
        ev("hab_1", "2026-07-22", "done", "2026-07-22T09:00:00.000+03:00"),
        ev("hab_1", "2026-07-20", "done", "2026-07-20T09:00:00.000+03:00"),
      ]),
    ).toEqual({
      hab_1: ["2026-07-20", "2026-07-22"],
      hab_2: ["2026-07-21"],
    });
  });

  it("ігнорує биті події без habitId / dateKey", () => {
    const broken = {
      ...ev("hab_1", "2026-07-20", "done", "2026-07-20T09:00:00.000+03:00"),
      habitId: "",
    };
    expect(foldCompletionEvents([broken])).toEqual({});
  });
});
