// @vitest-environment jsdom
/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Іконка групи списку покупок - гліф категорії комори (одна таксономія
 * Харчування, рішення власника 2026-10-01), а не мапа з власних 11 назв.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FOOD_CATEGORIES } from "@sergeant/nutrition-domain";

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

/** Розмітка гліфа в шапці групи з назвою `groupName`. */
function groupGlyph(groupName: string): string {
  const header = screen.getByText(groupName).parentElement;
  return header?.querySelector("svg")?.innerHTML ?? "";
}

beforeEach(() => {
  localStorage.clear();
});

describe("ShoppingListCard - іконки груп", () => {
  it("кожна категорія комори малює власний гліф, не одну іконку на всіх", () => {
    const labels = FOOD_CATEGORIES.map((c) => c.label);
    renderCard(labels);
    const glyphs = labels.map(groupGlyph);
    for (const [i, glyph] of glyphs.entries()) {
      expect(glyph, labels[i]).not.toBe("");
    }
    // Гліфи категорій різняться між собою (кошик-фолбек був би одним на всіх).
    expect(new Set(glyphs).size).toBe(labels.length);
  });

  it("гліф групи збігається з гліфом тієї ж категорії в коморі за назвою з апострофом будь-якого виду", () => {
    renderCard(["Мʼясо та птиця"]);
    const canonical = groupGlyph("Мʼясо та птиця");
    expect(canonical).not.toBe("");

    document.body.innerHTML = "";
    renderCard(["М'ясо та птиця"]);
    expect(groupGlyph("М'ясо та птиця")).toBe(canonical);
  });

  it("група, якої комора не знає, лишається з нейтральним кошиком", () => {
    renderCard(["Щось своє", "Інше"]);
    // «Інше» - категорія комори (власний гліф), невідома назва - фолбек.
    expect(groupGlyph("Щось своє")).not.toBe(groupGlyph("Інше"));
  });
});
