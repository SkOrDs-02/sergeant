// @vitest-environment jsdom
/**
 * Межі recovery-поради (аудит E-2/E-3/E-7).
 *
 * Тести пінять саме зізнання, а не верстку: якщо копія колись почне
 * обіцяти повноту даних або медичну норму, вони впадуть.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WellbeingSignal } from "@sergeant/fizruk-domain";
import type { ReplicaFreshness } from "../../../core/syncEngine/replicaFreshness";
import { RecoveryHonestyNotes } from "./RecoveryHonestyNotes";

const COMPLETE: ReplicaFreshness = {
  lastPullAt: "2026-08-02T11:00:00.000Z",
  ageHours: 1,
  pendingOps: 0,
  stale: false,
  complete: true,
  windowHours: 6,
};

const FRESH_WELLBEING: WellbeingSignal = {
  multiplier: 1,
  sleepAgeHours: 5,
  energyAgeHours: 5,
  usedSleep: true,
  usedEnergy: true,
  stale: false,
  windowHours: 72,
};

afterEach(cleanup);

describe("RecoveryHonestyNotes", () => {
  it("на повних даних показує лише n=1-застереження", () => {
    render(
      <RecoveryHonestyNotes
        freshness={COMPLETE}
        wellbeing={FRESH_WELLBEING}
        syncEnabled
      />,
    );
    expect(screen.getByText(/на одному тілі/)).toBeTruthy();
    expect(screen.queryByText(/Порада з неповних даних/)).toBeNull();
    expect(screen.queryByText(/Журнал самопочуття застарів/)).toBeNull();
  });

  it("несвіжий синк — прямо каже, що тренування з телефону могло не дійти", () => {
    render(
      <RecoveryHonestyNotes
        freshness={{ ...COMPLETE, ageHours: 10, stale: true, complete: false }}
        wellbeing={FRESH_WELLBEING}
        syncEnabled
      />,
    );
    expect(screen.getByText(/Порада з неповних даних/)).toBeTruthy();
    expect(screen.getByText(/з телефону/)).toBeTruthy();
    expect(screen.getByText(/10 год тому/)).toBeTruthy();
  });

  it("черга на відправку — інший бік тієї самої дірки", () => {
    render(
      <RecoveryHonestyNotes
        freshness={{ ...COMPLETE, pendingOps: 2, complete: false }}
        wellbeing={FRESH_WELLBEING}
        syncEnabled
      />,
    );
    expect(screen.getByText(/ще не пішли на сервер/)).toBeTruthy();
  });

  it("синку не було — окреме формулювання, не «давно»", () => {
    render(
      <RecoveryHonestyNotes
        freshness={{
          lastPullAt: null,
          ageHours: null,
          pendingOps: 0,
          stale: true,
          complete: false,
          windowHours: 6,
        }}
        wellbeing={FRESH_WELLBEING}
        syncEnabled
      />,
    );
    expect(screen.getByText(/Синхронізації ще не було/)).toBeTruthy();
  });

  it("застарілий журнал самопочуття визнається окремо", () => {
    render(
      <RecoveryHonestyNotes
        freshness={COMPLETE}
        wellbeing={{
          ...FRESH_WELLBEING,
          usedSleep: false,
          usedEnergy: false,
          stale: true,
          sleepAgeHours: 720,
        }}
        syncEnabled
      />,
    );
    expect(screen.getByText(/Журнал самопочуття застарів/)).toBeTruthy();
    expect(screen.getByText(/більше не враховується/)).toBeTruthy();
  });

  it("згорнуто в один рядок жанру, повний текст відкривається тапом", () => {
    const { container } = render(
      <RecoveryHonestyNotes
        freshness={COMPLETE}
        wellbeing={FRESH_WELLBEING}
        syncEnabled
      />,
    );
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    const summary = screen.getByText("Спостереження, не медична порада");
    expect(details.querySelector("summary")!.contains(summary)).toBe(true);
    expect(details.querySelector("summary")!.textContent).not.toMatch(
      /на одному тілі|до лікаря/,
    );
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(screen.getByText(/до лікаря/)).toBeTruthy();
  });

  it("без увімкненого синку не скаржиться на відсутню синхронізацію", () => {
    render(
      <RecoveryHonestyNotes
        freshness={{
          lastPullAt: null,
          ageHours: null,
          pendingOps: 0,
          stale: true,
          complete: false,
          windowHours: 6,
        }}
        wellbeing={FRESH_WELLBEING}
        syncEnabled={false}
      />,
    );
    expect(screen.queryByText(/Порада з неповних даних/)).toBeNull();
    expect(screen.queryByText(/Синхронізації ще не було/)).toBeNull();
    expect(screen.getByText(/на одному тілі/)).toBeTruthy();
  });
});
