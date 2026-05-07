/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import type { Budget } from "@sergeant/finyk-domain/domain/types";
import { AddBudgetForm, type NewBudgetDraft } from "./AddBudgetForm";

const categories = [
  { id: "food", label: "🍞 Їжа" },
  { id: "transport", label: "🚗 Транспорт" },
  { id: "income", label: "💰 Дохід" },
] as const;

function setup(existing: readonly Budget[] = []) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <AddBudgetForm
      existingBudgets={existing}
      expenseCategoryList={categories}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel };
}

describe("AddBudgetForm — useApiForm + zod (Item #8 round-13)", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits a valid limit budget with normalized number value", async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "food" },
    });
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "1500" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Новий ліміт бюджету" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        type: "limit",
        categoryId: "food",
        limit: 1500,
      } satisfies NewBudgetDraft);
    });
  });

  it("blocks submit when limit category is empty (zod required)", async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "300" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Новий ліміт бюджету" }));

    await waitFor(() => {
      expect(screen.getByText("Обери категорію")).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("flags non-positive limit amount via aria-invalid + zod refine", async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "food" },
    });
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "0" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Новий ліміт бюджету" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Ліміт")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });
    expect(screen.getByText("Введи ліміт більше 0")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects duplicate limit category via superRefine on existingBudgets", async () => {
    const existing: Budget[] = [
      { id: "b1", type: "limit", categoryId: "food", limit: 1000 },
    ];
    const { onSubmit } = setup(existing);
    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "food" },
    });
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "500" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Новий ліміт бюджету" }));

    await waitFor(() => {
      expect(
        screen.getByText("Ліміт для цієї категорії вже існує"),
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid goal budget with trimmed name and number conversion", async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));

    fireEvent.change(screen.getByLabelText("Назва цілі"), {
      target: { value: "  Нова авто  " },
    });
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "20000" },
    });
    fireEvent.change(screen.getByLabelText("Вже відкладено"), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByLabelText("Дедлайн"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Нова ціль бюджету" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        type: "goal",
        name: "Нова авто",
        emoji: "🎯",
        targetAmount: 20000,
        savedAmount: 5000,
        targetDate: "2026-12-31",
      } satisfies NewBudgetDraft);
    });
  });

  it("blocks goal submit when name is whitespace-only via .trim().min(1)", async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));
    fireEvent.change(screen.getByLabelText("Назва цілі"), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "1000" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Нова ціль бюджету" }));

    await waitFor(() => {
      expect(screen.getByText("Введи назву цілі")).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects negative savedAmount on goal", async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));
    fireEvent.change(screen.getByLabelText("Назва цілі"), {
      target: { value: "Кубокубок" },
    });
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("Вже відкладено"), {
      target: { value: "-50" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Нова ціль бюджету" }));

    await waitFor(() => {
      expect(
        screen.getByText("Відкладена сума не може бути від'ємною"),
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("goal emoji selection via aria-pressed reflects in submit payload", async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));

    fireEvent.click(screen.getByRole("button", { name: /Емодзі 🏠/ }));

    fireEvent.change(screen.getByLabelText("Назва цілі"), {
      target: { value: "Хата" },
    });
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "100000" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Нова ціль бюджету" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "goal",
          emoji: "🏠",
          name: "Хата",
        }),
      );
    });
  });
});
