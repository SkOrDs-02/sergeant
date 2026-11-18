/** @vitest-environment jsdom */
/**
 * Ф-1 (а), OD-26 (рішення власника 2026-11-18): у формі ручного запису сума й
 * категорія стоять нагорі, далі назва й дата; теги й рахунок живуть під
 * розкривачем «Більше: теги, рахунок». Розкривач не ховає дані мовчки:
 * збережені теги чи готівка розкривають його або видні в підписі.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ManualExpenseSheet } from "./ManualExpenseSheet";

beforeAll(() => {
  Object.defineProperty(window.navigator, "vibrate", {
    value: vi.fn(),
    configurable: true,
  });
});
afterEach(cleanup);

function precedes(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function moreDisclosure(): HTMLDetailsElement {
  // Без поля рахунку (аркуш без `onCreateCashOnHand`) підпис «Більше: теги».
  const summary = screen.getByText(/^Більше: теги/);
  const details = summary.closest("details");
  if (!details) throw new Error("«Більше» має бути <details>");
  return details;
}

const cashProps = {
  cashOnHandExists: true,
  onCreateCashOnHand: vi.fn(),
};

describe("ManualExpenseSheet: порядок полів (Ф-1 а)", () => {
  it("тип, сума, категорія, назва, дата, а теги й рахунок під «Більше»", () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        knownTags={[]}
        {...cashProps}
      />,
    );
    const kind = screen.getByRole("radio", { name: "Витрата" });
    const amount = screen.getByLabelText("Сума ₴");
    const category = screen.getByLabelText("Категорія");
    const name = screen.getByRole("textbox", { name: /Назва/ });
    const date = screen.getByRole("radiogroup", { name: "Дата запису" });
    const more = moreDisclosure();
    expect(screen.getByText("Більше: теги, рахунок")).toBeInTheDocument();

    expect(precedes(kind, amount)).toBe(true);
    expect(precedes(amount, category)).toBe(true);
    expect(precedes(category, name)).toBe(true);
    expect(precedes(name, date)).toBe(true);
    expect(precedes(date, more)).toBe(true);

    const tags = screen.getByRole("combobox", { name: "Новий тег" });
    const account = screen.getByRole("radio", { name: "Готівка на руках" });
    expect(more.contains(tags)).toBe(true);
    expect(more.contains(account)).toBe(true);
    // Новий запис без тегів і без готівки: розкривач згорнутий.
    expect(more.open).toBe(false);
  });

  it("редагування запису з тегами розкриває «Більше»", async () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        initialExpense={{
          id: "m1",
          description: "Кава",
          amount: 80,
          category: "restaurant",
          date: "2026-11-10T10:00:00.000Z",
        }}
        tags={["відпустка"]}
        knownTags={[]}
        onTagsChange={() => {}}
      />,
    );
    await waitFor(() => expect(moreDisclosure().open).toBe(true));
  });

  it("редагування готівкового запису розкриває «Більше»", async () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        initialExpense={{
          id: "m2",
          description: "Ринок",
          amount: 150,
          category: "food",
          date: "2026-11-10T10:00:00.000Z",
          account: "cash",
        }}
        knownTags={[]}
        onTagsChange={() => {}}
        {...cashProps}
      />,
    );
    await waitFor(() => expect(moreDisclosure().open).toBe(true));
  });

  it("типова готівка нового запису не розкриває, але видна в підписі", async () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        knownTags={[]}
        defaultAccount="cash"
        {...cashProps}
      />,
    );
    const more = moreDisclosure();
    await waitFor(() =>
      expect(more.querySelector("summary")?.textContent).toContain(
        "Готівка на руках",
      ),
    );
    expect(more.open).toBe(false);
  });

  it("надходження: сума й категорія лишаються нагорі, запис зберігається", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        knownTags={[]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Надходження" }));
    const amount = screen.getByLabelText("Сума ₴");
    const category = screen.getByLabelText("Категорія");
    expect(precedes(amount, category)).toBe(true);
    expect(precedes(category, moreDisclosure())).toBe(true);

    fireEvent.change(amount, { target: { value: "1000" } });
    fireEvent.click(category);
    fireEvent.click(screen.getByRole("button", { name: "Зарплата" }));
    fireEvent.click(screen.getByRole("button", { name: "Додати надходження" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].kind).toBe("income");
  });
});
