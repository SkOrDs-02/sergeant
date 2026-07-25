// @vitest-environment jsdom
/**
 * Телеметрія петель цінності (Хвиля 2) для категоризації транзакції.
 *
 * `finyk_tx_categorized` — ЄДИНА відсутня дія finyk (`expense_added` /
 * `income_added` / `budget_set` уже емітяться зі своїх write-шляхів і
 * переюзані як є, лише з дописаними полями атрибуції).
 *
 * У payload немає ані `categoryId`, ані назви категорії: id кастомної
 * категорії створює користувач — це і high-cardinality property у PostHog,
 * і potential PII (Hard Rule #21).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("../../../core/observability/analytics", () => ({
  trackEvent: mocks.trackEvent,
  ANALYTICS_EVENTS: { FINYK_TX_CATEGORIZED: "finyk_tx_categorized" },
}));

import {
  markSignalShown,
  resetSignalAttribution,
} from "../../../core/observability/valueSignalAttribution";
import { TxRowCategoryPicker } from "./TxRowCategoryPicker";

const CATEGORIES = [
  { id: "food", label: "🍎 Продукти" },
  { id: "custom_1755000000", label: "Мій репетитор" },
];

function categorizedCalls() {
  return mocks.trackEvent.mock.calls.filter(
    (c) => c[0] === "finyk_tx_categorized",
  );
}

/** Payload n-ної події. Кидає, якщо події не було — це і є асершен. */
function categorizedPayload(index = 0): Record<string, unknown> {
  const call = categorizedCalls()[index];
  if (!call) throw new Error(`finyk_tx_categorized #${index} не полетів`);
  return call[1] as Record<string, unknown>;
}

function renderPicker(
  props: Partial<{
    overrideCatId: string | null;
    note: string | undefined;
    onNoteChange: (id: string, note: string | null) => void;
  }> = {},
) {
  const onCatChange = vi.fn();
  const onClose = vi.fn();
  const onNoteChange = props.onNoteChange ?? vi.fn();
  render(
    <TxRowCategoryPicker
      categories={CATEGORIES}
      currentCatId="food"
      overrideCatId={props.overrideCatId ?? null}
      txId="tx-1"
      onCatChange={onCatChange}
      note={props.note}
      onNoteChange={onNoteChange}
      onClose={onClose}
    />,
  );
  return { onCatChange, onClose, onNoteChange };
}

describe("TxRowCategoryPicker — телеметрія категоризації", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSignalAttribution();
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it("вбудована категорія їде як category_kind=builtin", () => {
    const { onCatChange } = renderPicker();

    fireEvent.click(screen.getByText("Продукти"));

    expect(onCatChange).toHaveBeenCalledWith("tx-1", "food");
    expect(categorizedCalls()).toHaveLength(1);
    expect(categorizedPayload()).toEqual({
      action: "set",
      category_kind: "builtin",
      after_signal: false,
      ms_since_signal: null,
      signal: null,
    });
  });

  it("кастомна категорія їде як category_kind=custom, без id і без назви", () => {
    renderPicker();

    fireEvent.click(screen.getByText("Мій репетитор"));

    expect(categorizedPayload()).toMatchObject({
      action: "set",
      category_kind: "custom",
    });
    const payload = JSON.stringify(categorizedPayload());
    expect(payload).not.toContain("custom_1755000000");
    expect(payload).not.toContain("репетитор");
  });

  it("скидання override їде як action=cleared", () => {
    const { onCatChange } = renderPicker({ overrideCatId: "food" });

    fireEvent.click(screen.getByText("Скинути"));

    expect(onCatChange).toHaveBeenCalledWith("tx-1", null);
    expect(categorizedPayload()).toMatchObject({
      action: "cleared",
      category_kind: null,
    });
  });

  it("тап по вже активній категорії з override теж скидає її", () => {
    const { onCatChange } = renderPicker({ overrideCatId: "food" });

    fireEvent.click(screen.getByText("Продукти"));

    expect(onCatChange).toHaveBeenCalledWith("tx-1", null);
    expect(categorizedPayload()).toMatchObject({ action: "cleared" });
  });

  it("повторний тап по вже застосованому override НЕ емітить події", () => {
    // `currentCatId="food"`, override уже на «Мій репетитор» — тап по ньому ж
    // нічого не змінює. Подія тут роздула б чисельник петлі цінності
    // не-дією, і виправити це заднім числом було б неможливо.
    const { onCatChange, onClose } = renderPicker({
      overrideCatId: "custom_1755000000",
    });

    fireEvent.click(screen.getByText("Мій репетитор"));

    expect(categorizedCalls()).toHaveLength(0);
    expect(onCatChange).not.toHaveBeenCalled();
    // Шторка все одно закривається — для користувача це валідний вихід.
    expect(onClose).toHaveBeenCalled();
  });

  it("дописує атрибуцію показаного finyk-сигналу", () => {
    markSignalShown({ signal: "finyk-recurring-detected", module: "finyk" });
    renderPicker();

    fireEvent.click(screen.getByText("Продукти"));

    expect(categorizedPayload()).toMatchObject({
      after_signal: true,
      signal: "finyk-recurring-detected",
    });
  });
});

describe("TxRowCategoryPicker — нотатка транзакції", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSignalAttribution();
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it("зберігає нотатку на blur", () => {
    const { onNoteChange } = renderPicker();

    const input = screen.getByLabelText("Нотатка до транзакції");
    fireEvent.change(input, { target: { value: "Оплата за друга" } });
    fireEvent.blur(input);

    expect(onNoteChange).toHaveBeenCalledWith("tx-1", "Оплата за друга");
  });

  it("зберігає нотатку на Enter", () => {
    const { onNoteChange } = renderPicker();

    const input = screen.getByLabelText("Нотатка до транзакції");
    fireEvent.change(input, { target: { value: "Кава з колегою" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onNoteChange).toHaveBeenCalledWith("tx-1", "Кава з колегою");
  });

  it("не викликає onNoteChange, якщо текст не змінився", () => {
    const { onNoteChange } = renderPicker({ note: "Незмінна нотатка" });

    const input = screen.getByLabelText("Нотатка до транзакції");
    fireEvent.blur(input);

    expect(onNoteChange).not.toHaveBeenCalled();
  });

  it("порожня нотатка на blur = видалення (null value)", () => {
    const { onNoteChange } = renderPicker({ note: "Стара нотатка" });

    const input = screen.getByLabelText("Нотатка до транзакції");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onNoteChange).toHaveBeenCalledWith("tx-1", "");
  });
});
