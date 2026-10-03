// @vitest-environment jsdom
/**
 * Регресія: поля «вага» і «сон» приймають кому.
 *
 * Обидва мають `inputMode="decimal"`, тобто на українській розкладці
 * користувач отримує саме кому. До 2026-08-16 вони стояли під
 * `type="number"` і валідувались через голий `Number(v)`, тож «82,5»
 * доїжджало у форму порожнім рядком — вага мовчки не зберігалась. Це той
 * самий клас бага, який бета-тестер зловив 2026-08-10 у КБЖВ.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BodyEntryForm } from "./BodyEntryForm";

function fieldById(container: HTMLElement, id: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`Поля #${id} немає у формі`);
  return el;
}

describe("BodyEntryForm — десятковий роздільник", () => {
  it("зберігає вагу і сон, введені через кому", async () => {
    const onSubmitEntry = vi.fn();
    const { container } = render(
      <BodyEntryForm onSubmitEntry={onSubmitEntry} />,
    );

    fireEvent.change(fieldById(container, "body-weight"), {
      target: { value: "82,5" },
    });
    fireEvent.change(fieldById(container, "body-sleep"), {
      target: { value: "7,5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));

    await waitFor(() => expect(onSubmitEntry).toHaveBeenCalledTimes(1));
    expect(onSubmitEntry.mock.calls[0]![0]).toMatchObject({
      weightKg: 82.5,
      sleepHours: 7.5,
    });
  });

  it("крапка працює так само — обидва роздільники рівноправні", async () => {
    const onSubmitEntry = vi.fn();
    const { container } = render(
      <BodyEntryForm onSubmitEntry={onSubmitEntry} />,
    );

    fireEvent.change(fieldById(container, "body-weight"), {
      target: { value: "82.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));

    await waitFor(() => expect(onSubmitEntry).toHaveBeenCalledTimes(1));
    expect(onSubmitEntry.mock.calls[0]![0]).toMatchObject({ weightKg: 82.5 });
  });

  it("вага поза діапазоном лишається помилкою, а не тихим null", async () => {
    const onSubmitEntry = vi.fn();
    const { container } = render(
      <BodyEntryForm onSubmitEntry={onSubmitEntry} />,
    );

    fireEvent.change(fieldById(container, "body-weight"), {
      target: { value: "999,9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSubmitEntry).not.toHaveBeenCalled();
  });
});
