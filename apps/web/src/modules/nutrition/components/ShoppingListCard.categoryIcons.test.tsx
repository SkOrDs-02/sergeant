// @vitest-environment jsdom
/**
 * Last validated: 2026-10-10
 * Status: Active
 *
 * Мова H (redesign v3): група списку покупок - заголовок із лічильником,
 * без іконки категорії.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/lib/modules/hubNav", () => ({ openHubModule: vi.fn() }));
vi.mock("@finyk/hooks/useSilpoSyncState", () => ({
  useSilpoSyncState: () => ({ status: "disconnected" }),
}));

import { ShoppingListCard } from "./ShoppingListCard";

function list(names: string[]) {
  return {
    categories: names.map((name, i) => ({
      name,
      items: [
        {
          id: `i${i}`,
          name: `Позиція ${i}`,
          quantity: "",
          note: "",
          checked: false,
        },
      ],
    })),
  } as never;
}

function renderCard(names: string[]) {
  return render(
    <ShoppingListCard
      recipes={[]}
      weekPlan={null}
      pantryItems={[]}
      shoppingList={list(names)}
      shoppingBusy={false}
      onGenerate={vi.fn()}
      onToggleItem={vi.fn()}
      onClearChecked={vi.fn()}
      onClearAll={vi.fn()}
      onAddCheckedToPantry={vi.fn()}
      onAddItem={vi.fn()}
      checkedItems={[]}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("ShoppingListCard - групи без іконок", () => {
  it("заголовок групи не містить іконки, навіть для відомих категорій комори", () => {
    renderCard(["Мʼясо та птиця", "Щось своє"]);
    for (const name of ["Мʼясо та птиця", "Щось своє"]) {
      const section = screen.getByText(name).closest("section");
      expect(section).not.toBeNull();
      expect(section?.querySelector("svg")).toBeNull();
    }
  });
});
