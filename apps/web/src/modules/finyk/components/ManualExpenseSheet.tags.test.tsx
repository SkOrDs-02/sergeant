/** @vitest-environment jsdom */
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

describe("ManualExpenseSheet: теги при створенні (Р6.1)", () => {
  it("тег, набраний у формі нової витрати, їде в onSave", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        knownTags={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "120" },
    });
    const input = screen.getByRole("combobox", { name: "Новий тег" });
    fireEvent.change(input, { target: { value: "відпустка" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].tags).toEqual(["відпустка"]);
  });
});
