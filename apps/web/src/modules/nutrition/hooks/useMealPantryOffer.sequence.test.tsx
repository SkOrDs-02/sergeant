// @vitest-environment jsdom
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PantryItem } from "@sergeant/nutrition-domain";
import { ToastProvider, useToast } from "@shared/hooks/useToast";
import {
  offerPantryDeduction,
  type PantryOfferPort,
} from "./useMealPantryOffer";

// Пропозиція списання йде ПІСЛЯ тосту запису, а не стосом поруч із ним:
// П-6 (А) «два тости поспіль» (розбір 2026-11-17 § 11.9), одна думка за раз.
// Справжній провайдер, бо порядок появи — це його черга, а не мок.

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

const rice: PantryItem = { name: "Рис", qty: 500, unit: "г", notes: null };

function port(): PantryOfferPort {
  return {
    items: [rice],
    consume: vi.fn(() => ({ receipt: null, cancelled: false })),
    revert: vi.fn(() => true),
  };
}

const OFFER = "Списати 150 г із комори?";
const msgs = (list: { msg: unknown; leaving?: boolean }[]) =>
  list.filter((t) => !t.leaving).map((t) => t.msg);

describe("пропозиція списання після тосту запису", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("зʼявляється лише коли тост запису зник сам", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      const recordId = result.current.success("Страву додано.", undefined, {
        label: "Скасувати",
        onClick: () => {},
      });
      offerPantryDeduction(
        result.current,
        port,
        [{ name: "Рис", amount_g: 150 }],
        { after: recordId },
      );
    });
    expect(msgs(result.current.toasts)).toEqual(["Страву додано."]);

    act(() => {
      vi.advanceTimersByTime(3500 + 200);
    });
    expect(msgs(result.current.toasts)).toEqual([OFFER]);
  });

  it("закритий хрестиком тост запису теж відкриває пропозицію", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });
    let recordId = 0;
    act(() => {
      recordId = result.current.success("Страву додано.", undefined, {
        label: "Скасувати",
        onClick: () => {},
      });
      offerPantryDeduction(
        result.current,
        port,
        [{ name: "Рис", amount_g: 150 }],
        { after: recordId },
      );
    });
    act(() => {
      result.current.dismiss(recordId);
      vi.advanceTimersByTime(200);
    });
    expect(msgs(result.current.toasts)).toEqual([OFFER]);
  });

  it("«Скасувати» тосту запису — пропозиції немає взагалі", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      const link = { undo: () => {} };
      const recordId = result.current.success("Страву додано.", undefined, {
        label: "Скасувати",
        onClick: () => link.undo(),
      });
      link.undo = offerPantryDeduction(
        result.current,
        port,
        [{ name: "Рис", amount_g: 150 }],
        { after: recordId },
      ).undo;
      // Так закриває тост `ToastRow`: спершу дія, потім `dismiss`.
      link.undo();
      result.current.dismiss(recordId);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(msgs(result.current.toasts)).toEqual([]);
  });
});
