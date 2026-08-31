// @vitest-environment jsdom
/**
 * Status: Active
 * Unit tests for the meal-sheet `FromReceiptRow`.
 *
 * Позиції — з реального чека тестерки (2026-08-21): фасовані котлети
 * «1 × 330г» і ваговий салат «0.212 кг».
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FromReceiptRow } from "./FromReceiptRow";

const syncState = vi.hoisted(() => ({ status: "connected" as string }));
const receiptDetail = vi.hoisted(() => ({
  data: null as { items: unknown[] } | null,
}));

vi.mock("@finyk/hooks/useSilpoSyncState", () => ({
  useSilpoSyncState: () => syncState,
}));
vi.mock("@finyk/hooks/useSilpoReceipts", () => ({
  useSilpoReceipts: () => ({ receipts: [{ receiptId: "r1" }] }),
  useSilpoReceiptDetails: () =>
    receiptDetail.data ? [receiptDetail.data] : [],
}));

const items = [
  { id: 1, name: "Котлети курячі з кускусом", qty: 1, unit: "330г" },
  { id: 2, name: "Асорті із свіжих овочів", qty: 0.212, unit: "кг" },
  { id: 3, name: "Яблука", qty: 1, unit: "кг" },
];

function setup() {
  const setForm = vi.fn();
  const setFoodQuery = vi.fn();
  const setPickedGrams = vi.fn();
  const onPicked = vi.fn();
  const result = render(
    <FromReceiptRow
      enabled
      setForm={setForm}
      setFoodQuery={setFoodQuery}
      setPickedGrams={setPickedGrams}
      onPicked={onPicked}
    />,
  );
  return { ...result, setForm, setFoodQuery, setPickedGrams, onPicked };
}

describe("FromReceiptRow", () => {
  beforeEach(() => {
    syncState.status = "connected";
    receiptDetail.data = { items };
  });

  it("renders nothing without a connected Silpo integration", () => {
    syncState.status = "disconnected";
    expect(setup().container.firstChild).toBeNull();
  });

  it("renders nothing when the last receipt has no edible items", () => {
    receiptDetail.data = { items: [] };
    expect(setup().container.firstChild).toBeNull();
  });

  it("shows the weight only when it reads as a single portion", () => {
    setup();
    expect(screen.getByText("330 г")).toBeTruthy();
    expect(screen.getByText("212 г")).toBeTruthy();
    // 1 кг яблук — це закупівля, не порція: назва є, ваги немає.
    expect(screen.getByText("Яблука")).toBeTruthy();
    expect(screen.queryByText("1000 г")).toBeNull();
  });

  it("seeds name, search query and portion weight on tap", () => {
    const { setForm, setFoodQuery, setPickedGrams } = setup();
    fireEvent.click(screen.getByText("Котлети курячі з кускусом"));
    expect(setFoodQuery).toHaveBeenCalledWith("Котлети курячі з кускусом");
    expect(setPickedGrams).toHaveBeenCalledWith("330");
    expect(setForm).toHaveBeenCalled();
  });

  // Людина вже назвала цей продукт на касі: тап по позиції чека має
  // повідомити аркуш, що запит НЕ ручний, і той сам розгорне перший
  // результат карткою з КБЖУ замість списку.
  it("signals the sheet to auto-open the first hit, with the cleaned query", () => {
    const { onPicked } = setup();
    fireEvent.click(screen.getByText("Котлети курячі з кускусом"));
    expect(onPicked).toHaveBeenCalledWith("Котлети курячі з кускусом");
  });

  it("leaves the weight field untouched when the receipt can't tell it", () => {
    const { setPickedGrams } = setup();
    fireEvent.click(screen.getByText("Яблука"));
    expect(setPickedGrams).not.toHaveBeenCalled();
  });
});
