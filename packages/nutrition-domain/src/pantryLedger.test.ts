import { describe, it, expect } from "vitest";
import {
  buildPantryInitialCheckpointId,
  derivePantryQty,
  isPantryCheckpoint,
  isPantryEventKind,
  sortPantryEvents,
  type PantryEvent,
  type PantryEventKind,
} from "./pantryLedger.js";

/**
 * Тести згортки append-only журналу комори (W1-PANTRY-APPEND, стадія 1).
 *
 * Найважливіший кейс — `qty IS NULL` → `null`, а НЕ `0`: інакше після
 * cutover-у (стадія 4) «сіль» без кількості стане «сіль 0» і зникне з UI.
 */

let seq = 0;

function ev(
  over: Partial<PantryEvent> & { kind: PantryEventKind },
): PantryEvent {
  seq += 1;
  const defaults = {
    id: `evt_${String(seq).padStart(4, "0")}`,
    pantryId: "home",
    itemId: "home::0::молоко",
    itemKey: "молоко",
    deltaQty: null,
    absQty: null,
    unit: "г",
    source: "manual",
    mealId: null,
    occurredAt: "2026-07-01T10:00:00.000Z",
    deletedAt: null,
  } satisfies Omit<PantryEvent, "kind">;
  return { ...defaults, ...over };
}

describe("isPantryEventKind / isPantryCheckpoint", () => {
  it("приймає лише чотири канонічні види", () => {
    for (const kind of ["consume", "replenish", "adjust", "initial"]) {
      expect(isPantryEventKind(kind)).toBe(true);
    }
    expect(isPantryEventKind("cook")).toBe(false);
    expect(isPantryEventKind("")).toBe(false);
    expect(isPantryEventKind(null)).toBe(false);
    expect(isPantryEventKind(42)).toBe(false);
  });

  it("чекпойнтами вважає лише adjust/initial", () => {
    expect(isPantryCheckpoint("initial")).toBe(true);
    expect(isPantryCheckpoint("adjust")).toBe(true);
    expect(isPantryCheckpoint("consume")).toBe(false);
    expect(isPantryCheckpoint("replenish")).toBe(false);
  });
});

describe("derivePantryQty — базова згортка", () => {
  it("порожній журнал → null (а не 0)", () => {
    expect(derivePantryQty([])).toBeNull();
  });

  it("один 'initial'-чекпойнт → його abs_qty", () => {
    const events = [ev({ kind: "initial", absQty: 1000 })];
    expect(derivePantryQty(events)).toBe(1000);
  });

  it("чекпойнт + споживання + поповнення = сума", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 1000,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -250,
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
      ev({
        kind: "replenish",
        deltaQty: 500,
        occurredAt: "2026-07-01T10:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(1250);
  });

  it("порядок у масиві не впливає — сортує за occurred_at", () => {
    const shuffled = [
      ev({
        kind: "consume",
        deltaQty: -250,
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
      ev({
        kind: "initial",
        absQty: 1000,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(shuffled)).toBe(750);
  });

  it("пізніший 'adjust' скидає всю попередню історію", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 1000,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -900,
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
      // Інвентаризація: користувач перерахував і сказав «насправді 400».
      ev({
        kind: "adjust",
        absQty: 400,
        occurredAt: "2026-07-02T08:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -100,
        occurredAt: "2026-07-02T09:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(300);
  });

  it("'adjust' з нулем — це нуль, а не 'невідомо'", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 500,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "adjust",
        absQty: 0,
        occurredAt: "2026-07-02T08:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(0);
  });

  it("не мутує вхідний масив", () => {
    const events = [
      ev({
        kind: "consume",
        deltaQty: -1,
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
      ev({
        kind: "initial",
        absQty: 10,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
    ];
    const snapshot = events.map((e) => e.id);
    derivePantryQty(events);
    expect(events.map((e) => e.id)).toEqual(snapshot);
  });
});

describe("derivePantryQty — 'не знаю' лишається 'не знаю'", () => {
  // Це САМЕ той кейс, заради якого функція повертає `number | null`.
  it("позиція без чекпойнта (qty IS NULL при backfill) → null, а НЕ 0", () => {
    // «Сіль» без кількості: backfill не створює для неї 'initial', тож у
    // журналі є лише дельти (або взагалі нічого).
    const events = [
      ev({
        itemKey: "сіль",
        kind: "consume",
        deltaQty: -5,
        unit: null,
      }),
    ];
    expect(derivePantryQty(events)).toBeNull();
    expect(derivePantryQty(events)).not.toBe(0);
  });

  it("самі дельти без бази → null навіть коли сума додатна", () => {
    const events = [
      ev({
        kind: "replenish",
        deltaQty: 900,
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -100,
        occurredAt: "2026-07-01T10:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBeNull();
  });

  it("чекпойнт без abs_qty не вважається базою", () => {
    const events = [ev({ kind: "initial", absQty: null })];
    expect(derivePantryQty(events)).toBeNull();
  });

  it("дельта без числа робить суму невизначеною → null", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 1000,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: null,
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBeNull();
  });

  it("несумісні одиниці після чекпойнта → null, а не вигадане число", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 2,
        unit: "кг",
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -1,
        unit: "шт",
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBeNull();
  });

  it("unit=null у дельті означає «та сама одиниця», не конфлікт", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 2,
        unit: "кг",
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -0.5,
        unit: null,
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(1.5);
  });
});

describe("derivePantryQty — відʼємний залишок видимий", () => {
  it("подвійне списання дає мінус, а не обрізаний нуль", () => {
    // Audit E-2: каструля борщу списується стільки разів, скільки логів
    // порцій. Ledger мусить це ПОКАЗАТИ, а не сховати за Math.max(0, …).
    const events = [
      ev({
        kind: "initial",
        absQty: 1000,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -600,
        occurredAt: "2026-07-01T13:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -600,
        occurredAt: "2026-07-01T19:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(-200);
  });
});

describe("derivePantryQty — ретракції і детермінізм", () => {
  it("tombstone-нута подія не враховується", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 1000,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -250,
        occurredAt: "2026-07-01T09:00:00.000Z",
        deletedAt: "2026-07-01T09:05:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(1000);
  });

  it("ретрагований чекпойнт відкочує базу на попередній", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 1000,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "adjust",
        absQty: 5,
        occurredAt: "2026-07-02T08:00:00.000Z",
        deletedAt: "2026-07-02T08:01:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(1000);
  });

  it("однакові occurred_at — детермінований тайбрейк за id", () => {
    const ts = "2026-07-01T08:00:00.000Z";
    const a: PantryEvent = ev({
      id: "evt_aaa",
      kind: "initial",
      absQty: 100,
      occurredAt: ts,
    });
    const b: PantryEvent = ev({
      id: "evt_bbb",
      kind: "consume",
      deltaQty: -40,
      occurredAt: ts,
    });
    expect(derivePantryQty([a, b])).toBe(60);
    expect(derivePantryQty([b, a])).toBe(60);
    expect(sortPantryEvents([b, a]).map((e) => e.id)).toEqual([
      "evt_aaa",
      "evt_bbb",
    ]);
  });

  it("float-шум згладжується (0.1 + 0.2 не тече в результат)", () => {
    const events = [
      ev({
        kind: "initial",
        absQty: 0.1,
        occurredAt: "2026-07-01T08:00:00.000Z",
      }),
      ev({
        kind: "replenish",
        deltaQty: 0.2,
        occurredAt: "2026-07-01T09:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(0.3);
  });
});

describe("sortPantryEvents", () => {
  it("викидає ретраговані і сортує хронологічно", () => {
    const events = [
      ev({ id: "c", kind: "consume", deltaQty: -1, occurredAt: "2026-07-03" }),
      ev({
        id: "b",
        kind: "consume",
        deltaQty: -1,
        occurredAt: "2026-07-02",
        deletedAt: "2026-07-02",
      }),
      ev({ id: "a", kind: "initial", absQty: 5, occurredAt: "2026-07-01" }),
    ];
    expect(sortPantryEvents(events).map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("buildPantryInitialCheckpointId — детермінований id (ADR-0077 §5)", () => {
  it("та сама позиція → той самий id (повторний backfill схлопується)", () => {
    expect(buildPantryInitialCheckpointId("home", "рис")).toBe(
      buildPantryInitialCheckpointId("home", "рис"),
    );
  });

  it("різні позиції → різні id", () => {
    expect(buildPantryInitialCheckpointId("home", "рис")).not.toBe(
      buildPantryInitialCheckpointId("home", "гречка"),
    );
    expect(buildPantryInitialCheckpointId("home", "рис")).not.toBe(
      buildPantryInitialCheckpointId("office", "рис"),
    );
  });

  it("НЕ залежить від qty/unit — те саме значення позиції на різні дні дає той самий id", () => {
    // Саме тому клієнтський і серверний backfill сходяться в ОДИН
    // чекпойнт, навіть якщо викликані в різний час зі старим/новим qty.
    const id = buildPantryInitialCheckpointId("home", "молоко");
    expect(id).toBe(buildPantryInitialCheckpointId("home", "молоко"));
    expect(id).toContain("home");
    expect(id).toContain("молоко");
  });
});

describe("W1-PANTRY-APPEND стадія 2 — чекпойнт + дельти збігаються з qty", () => {
  // Це і є доказ того, що стадія 3 (shadow-read parity) колись зійдеться:
  // derived-залишок, порахований з журналу, дорівнює тому, що зараз лежить
  // у мутованому лічильнику `nutrition_pantry_items.qty`.
  it("initial-чекпойнт сам по собі дорівнює поточному qty", () => {
    const currentQty = 500;
    const events = [
      ev({ kind: "initial", absQty: currentQty, occurredAt: "2026-08-01" }),
    ];
    expect(derivePantryQty(events)).toBe(currentQty);
  });

  it("initial + подальші consume/replenish дають те саме, що ручне обчислення qty", () => {
    // Симулюємо той самий сценарій, що й UI: backfill 500 г, юзер спожив
    // 120 (== старий шлях якраз так і робить: qty -= deduct), потім
    // поповнив на 300.
    const backfillQty = 500;
    const consumed = 120;
    const replenished = 300;
    const expectedQty = backfillQty - consumed + replenished;

    const events = [
      ev({
        kind: "initial",
        absQty: backfillQty,
        source: "backfill",
        occurredAt: "2026-08-01T00:00:00.000Z",
      }),
      ev({
        kind: "consume",
        deltaQty: -consumed,
        source: "meal_log",
        occurredAt: "2026-08-02T00:00:00.000Z",
      }),
      ev({
        kind: "replenish",
        deltaQty: replenished,
        source: "manual",
        occurredAt: "2026-08-03T00:00:00.000Z",
      }),
    ];
    expect(derivePantryQty(events)).toBe(expectedQty);
  });
});
