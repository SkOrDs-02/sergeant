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
import type { MonoJarDto } from "@shared/api";
import { AddBudgetForm, type NewBudgetDraft } from "./AddBudgetForm";

const categories = [
  { id: "food", label: "🍞 Їжа" },
  { id: "transport", label: "🚗 Транспорт" },
  { id: "income", label: "💰 Дохід" },
] as const;

function setup(
  existing: readonly Budget[] = [],
  jars: readonly MonoJarDto[] = [],
) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <AddBudgetForm
      existingBudgets={existing}
      expenseCategoryList={categories}
      jars={jars}
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

  it("disables an incomplete limit and explains the required fields", () => {
    setup();

    const submit = screen.getByRole("button", { name: "Додати" });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText("Обери категорію та вкажи позитивну суму ліміту."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "food" },
    });
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "1500" },
    });
    expect(submit).toBeEnabled();
  });

  it("disables an incomplete goal and explains the required fields", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));

    const submit = screen.getByRole("button", { name: "Додати" });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText("Заповни назву та вкажи позитивну суму цілі."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Назва цілі"), {
      target: { value: "Подорож" },
    });
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "20000" },
    });
    expect(submit).toBeEnabled();
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
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "limit",
          categoryId: "food",
          limit: 1500,
          period: "month",
          createdAt: expect.any(String),
        }),
      );
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

  it("rejects a decimal limit amount", async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "food" },
    });
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "1500.5" },
    });

    expect(screen.getByRole("button", { name: "Додати" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Новий ліміт бюджету" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Ліміт")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });
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

  it("builds a multi-category limit: chips, optional name, combo payload", async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "food" },
    });
    // Після першого вибору селект скидається в плейсхолдер «додай ще».
    const addMore = screen.getByDisplayValue("Додай ще категорію");
    expect(screen.queryByLabelText("Назва (необовʼязково)")).toBeNull();
    fireEvent.change(addMore, { target: { value: "transport" } });

    // Обидві категорії — у списку чипів, поле назви зʼявилось.
    expect(
      screen.getByRole("button", { name: "Прибрати категорію Їжа" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Прибрати категорію Транспорт" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Назва (необовʼязково)"), {
      target: { value: "Все на життя" },
    });
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "20000" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Новий ліміт бюджету" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "limit",
          categoryId: "food",
          categoryIds: ["food", "transport"],
          label: "Все на життя",
          limit: 20000,
        }),
      );
    });
  });

  it("removing a chip drops the category from the draft", async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "food" },
    });
    fireEvent.change(screen.getByDisplayValue("Додай ще категорію"), {
      target: { value: "transport" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Прибрати категорію Їжа" }),
    );
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "500" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Новий ліміт бюджету" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: "transport",
          categoryIds: ["transport"],
        }),
      );
    });
  });

  it("rejects a duplicate category SET but allows partial overlap with a hint", async () => {
    const existing: Budget[] = [
      {
        id: "b1",
        type: "limit",
        categoryId: "food",
        categoryIds: ["food", "transport"],
        limit: 1000,
      } as Budget,
    ];
    const { onSubmit } = setup(existing);
    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "transport" },
    });
    // Частковий перетин: transport уже в комбо-ліміті — форма показує
    // попередження, але не блокує.
    expect(
      screen.getByText(/вже є в ліміті/, { exact: false }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Додай ще категорію"), {
      target: { value: "food" },
    });
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "500" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Новий ліміт бюджету" }));
    await waitFor(() => {
      expect(
        screen.getByText("Ліміт для цього набору категорій вже існує"),
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid goal budget with trimmed name and number conversion (no more editable saved-amount field)", async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));

    expect(screen.queryByLabelText("Вже відкладено")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Назва цілі"), {
      target: { value: "  Нова авто  " },
    });
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "20000" },
    });
    fireEvent.change(screen.getByLabelText("Дата завершення"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Нова ціль бюджету" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        type: "goal",
        name: "Нова авто",
        emoji: "target",
        targetAmount: 20000,
        targetDate: "2026-12-31",
        linkedJarId: undefined,
      } satisfies NewBudgetDraft);
    });
  });

  it("does not render the jar dropdown when the user has no Monobank jars", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));
    expect(screen.queryByLabelText("Банка Monobank")).not.toBeInTheDocument();
  });

  it("selecting a jar sets linkedJarId in the submit payload", async () => {
    const jars: MonoJarDto[] = [
      {
        userId: "u1",
        monoJarId: "jar-1",
        sendId: null,
        title: "На відпустку",
        description: null,
        currencyCode: 980,
        balance: 30000,
        goal: null,
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const { onSubmit } = setup([], jars);
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));

    fireEvent.change(screen.getByLabelText("Назва цілі"), {
      target: { value: "Відпустка" },
    });
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "50000" },
    });
    fireEvent.change(screen.getByLabelText("Банка Monobank"), {
      target: { value: "jar-1" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Нова ціль бюджету" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ linkedJarId: "jar-1" }),
      );
    });
  });

  it("prefills the target amount from the jar's own goal when the field is still empty", () => {
    const jars: MonoJarDto[] = [
      {
        userId: "u1",
        monoJarId: "jar-1",
        sendId: null,
        title: "На відпустку",
        description: null,
        currencyCode: 980,
        balance: 30000,
        goal: 200000, // 2000 ₴ в копійках
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    setup([], jars);
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));
    fireEvent.change(screen.getByLabelText("Банка Monobank"), {
      target: { value: "jar-1" },
    });
    // Поле грошове, тож значення — рядок із роздільником розрядів, а не
    // число: `type="number"` тут більше не стоїть (див. `MoneyInput`).
    expect(screen.getByLabelText("Сума цілі")).toHaveValue("2\u00a0000");
  });

  it("does not overwrite a target amount the user already typed", () => {
    const jars: MonoJarDto[] = [
      {
        userId: "u1",
        monoJarId: "jar-1",
        sendId: null,
        title: "На відпустку",
        description: null,
        currencyCode: 980,
        balance: 30000,
        goal: 200000,
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    setup([], jars);
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "9999" },
    });
    fireEvent.change(screen.getByLabelText("Банка Monobank"), {
      target: { value: "jar-1" },
    });
    expect(screen.getByLabelText("Сума цілі")).toHaveValue("9\u00a0999");
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

  it("caps the goal name at NAME_MAX_LEN (client maxLength, beta-input-boundaries)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));

    const nameInput = screen.getByLabelText("Назва цілі");
    expect(nameInput).toHaveAttribute("maxLength", "200");
  });

  it("rejects a decimal goal target amount", async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));
    fireEvent.change(screen.getByLabelText("Назва цілі"), {
      target: { value: "Подорож" },
    });
    fireEvent.change(screen.getByLabelText("Сума цілі"), {
      target: { value: "20000.5" },
    });

    expect(screen.getByRole("button", { name: "Додати" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Нова ціль бюджету" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Сума цілі")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("goal icon selection reflects in submit payload", async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Ціль/ }));

    fireEvent.change(screen.getByLabelText("Іконка цілі"), {
      target: { value: "home" },
    });

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
          emoji: "home",
          name: "Хата",
        }),
      );
    });
  });
});
