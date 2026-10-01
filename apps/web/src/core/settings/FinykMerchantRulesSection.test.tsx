// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";
import {
  removeMerchantRule,
  restoreMerchantRules,
} from "@sergeant/finyk-domain/lib/merchantRules";

const toastShow = vi.fn(() => 1);
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    show: toastShow,
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }),
}));

import { FinykMerchantRulesSection } from "./FinykMerchantRulesSection";

afterEach(() => {
  cleanup();
  toastShow.mockClear();
});

function rule(over: Partial<MerchantRule> & Pick<MerchantRule, "id">) {
  return {
    kind: "expense",
    merchantKey: "сільпо",
    categoryId: "food",
    label: "Сільпо",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...over,
  } satisfies MerchantRule;
}

/** Стейтфул-обгортка: ті самі чисті функції, що в `useFinykMerchantRules`. */
function Harness({
  initial,
  customCategories = [],
}: {
  initial: MerchantRule[];
  customCategories?: unknown[];
}) {
  const [rules, setRules] = useState(initial);
  return (
    <FinykMerchantRulesSection
      rules={rules}
      customCategories={customCategories}
      deleteMerchantRule={(id) => {
        const { list, removed } = removeMerchantRule(rules, id);
        setRules(list);
        return removed;
      }}
      restoreMerchantRules={(removed) =>
        setRules((prev) => restoreMerchantRules(prev, removed))
      }
    />
  );
}

describe("Налаштування → Фінік → Правила категорій", () => {
  it("порожній список показує порожній стан із підказкою, як створити правило", () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText("Правила категорій")).toBeInTheDocument();
    expect(screen.getByText("Правил поки немає")).toBeInTheDocument();
    expect(screen.queryByTestId("merchant-rules-list")).toBeNull();
  });

  it("показує мерчанта, бік і категорію; сортує за назвою", () => {
    render(
      <Harness
        initial={[
          rule({
            id: "mr_b",
            merchantKey: "уклон",
            label: "Уклон",
            categoryId: "transport",
          }),
          rule({ id: "mr_a", label: "Атб", merchantKey: "атб" }),
          rule({
            id: "mr_c",
            kind: "income",
            merchantKey: "іван",
            label: "Іван",
            categoryId: "freelance",
          }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Атб"),
      expect.stringContaining("Іван"),
      expect.stringContaining("Уклон"),
    ]);
    expect(screen.getByText("Витрата · Транспорт")).toBeInTheDocument();
    expect(screen.getByText("Надходження · Фріланс")).toBeInTheDocument();
  });

  it("правило з видаленою категорією підписане як таке, що не діє", () => {
    render(
      <Harness
        initial={[rule({ id: "mr_x", categoryId: "custom-gone" })]}
        customCategories={[]}
      />,
    );
    expect(
      screen.getByText(/категорію видалено, правило не діє/),
    ).toBeInTheDocument();
  });

  it("кнопка «Прибрати» має доступну назву з мерчантом і висоту 44 px", () => {
    render(<Harness initial={[rule({ id: "mr_1" })]} />);
    const button = screen.getByRole("button", {
      name: "Прибрати правило для «Сільпо»",
    });
    expect(button.className).toMatch(/\bh-11\b/);
  });

  it("видалення прибирає рядок і дає тост «Повернути»; повернення відновлює", () => {
    render(<Harness initial={[rule({ id: "mr_1" })]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Прибрати правило для «Сільпо»" }),
    );
    expect(screen.queryByTestId("merchant-rules-list")).toBeNull();
    expect(screen.getByText("Правил поки немає")).toBeInTheDocument();

    const call = toastShow.mock.calls.at(-1) as unknown as [
      string,
      string,
      number,
      { label: string; kind?: string; onClick: () => void },
    ];
    expect(call[0]).toBe("Правило для «Сільпо» прибрано");
    expect(call[3].label).toBe("Повернути");
    expect(call[3].kind).toBe("undo");

    // Дія тосту викликається напряму: контейнера тостів у цьому рендері нема.
    act(() => call[3].onClick());
    expect(screen.getByTestId("merchant-rules-list")).toBeInTheDocument();
    expect(screen.getByText("Витрата · Продукти")).toBeInTheDocument();
  });

  it("дубль правила за мерчантом від другого пристрою не множить рядки й видаляється разом", () => {
    render(
      <Harness
        initial={[
          rule({ id: "mr_1" }),
          rule({ id: "mr_2", updatedAt: "2026-10-01T11:00:00.000Z" }),
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Прибрати правило/ }));
    expect(screen.queryByTestId("merchant-rules-list")).toBeNull();
  });
});
