import { beforeEach, describe, expect, it } from "vitest";
import {
  SHOPPING_LIST_KEY,
  getCheckedItems,
  getTotalCount,
  loadShoppingList,
  normalizeShoppingList,
  persistShoppingList,
  removeCheckedItems,
  toggleShoppingItem,
} from "./shoppingListStorage";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string): string | null =>
      store.has(String(k)) ? (store.get(String(k)) ?? null) : null,
    setItem: (k: string, v: string): void =>
      void store.set(String(k), String(v)),
    removeItem: (k: string): void => void store.delete(String(k)),
    clear: (): void => void store.clear(),
    _dump: (): Record<string, string> => Object.fromEntries(store.entries()),
  };
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock() as unknown as Storage;
});

describe("normalizeShoppingList", () => {
  it("returns empty list for null / non-object / array input", () => {
    expect(normalizeShoppingList(null)).toEqual({ categories: [] });
    expect(normalizeShoppingList(undefined)).toEqual({ categories: [] });
    expect(normalizeShoppingList("oops")).toEqual({ categories: [] });
    expect(normalizeShoppingList([1, 2, 3])).toEqual({ categories: [] });
  });

  it("drops categories without valid items", () => {
    const out = normalizeShoppingList({
      categories: [
        { name: "Овочі", items: [] },
        { name: "Інше", items: [{}] },
        null,
        { name: "Only text", items: [{ name: "" }] },
      ],
    });
    expect(out.categories).toEqual([]);
  });

  it("dedupes items by normalized name within the same category", () => {
    const out = normalizeShoppingList({
      categories: [
        {
          name: "Овочі",
          items: [
            { id: "a", name: "Огірок", quantity: "2", checked: false },
            { id: "b", name: " огірок ", quantity: "", checked: true },
            { id: "c", name: "ОГІРОК", checked: false },
            { id: "d", name: "Помідор" },
          ],
        },
      ],
    });
    const cat = out.categories[0];
    expect(cat!.items.map((i) => i.name.toLowerCase())!).toEqual([
      "огірок",
      "помідор",
    ]);
    // merged: quantity kept from first, checked OR-ed true from duplicate
    const cucumber = cat!.items[0]!;
    expect(cucumber.quantity!).toBe("2");
    expect(cucumber.checked!).toBe(true);
  });

  it("merges categories that share the same name", () => {
    const out = normalizeShoppingList({
      categories: [
        { name: "Молочне", items: [{ name: "Молоко" }] },
        { name: "Молочне", items: [{ name: "Сир" }] },
        { name: "Молочне", items: [{ name: "Молоко", checked: true }] },
      ],
    });
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0]!.items.map((i) => i.name)).toEqual([
      "Молоко",
      "Сир",
    ]);
    expect(out!.categories[0]!.items[0]!.checked).toBe(true);
  });

  it("assigns a fresh id to items missing an id or colliding with an earlier one", () => {
    const out = normalizeShoppingList({
      categories: [
        { name: "A", items: [{ id: "dup", name: "Х" }] },
        { name: "B", items: [{ id: "dup", name: "Y" }, { name: "Z" }] },
      ],
    });
    const ids = out.categories.flatMap((c) => c.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id && typeof id === "string")).toBe(true);
  });

  it("coerces non-string quantity / note fields to strings", () => {
    const out = normalizeShoppingList({
      categories: [
        {
          name: "Інше",
          items: [{ name: "Хліб", quantity: 2, note: 42, checked: "yes" }],
        },
      ],
    });
    const item = out.categories[0]!.items[0];
    expect(item!.quantity!).toBe("2");
    expect(item!.note!).toBe("42");
    expect(item!.checked!).toBe(true);
  });
});

describe("loadShoppingList", () => {
  it("returns empty list when nothing stored", () => {
    expect(loadShoppingList()).toEqual({ categories: [] });
  });

  it("returns empty list for corrupted JSON (does not crash UI)", () => {
    globalThis.localStorage.setItem(SHOPPING_LIST_KEY, "{not json");
    expect(loadShoppingList()).toEqual({ categories: [] });
  });

  it("returns empty list when stored value is non-object", () => {
    globalThis.localStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify("hello"));
    expect(loadShoppingList()).toEqual({ categories: [] });
  });

  it("normalizes on read and removes duplicates that were persisted", () => {
    globalThis.localStorage.setItem(
      SHOPPING_LIST_KEY,
      JSON.stringify({
        categories: [
          {
            name: "A",
            items: [
              { id: "1", name: "X" },
              { id: "2", name: "x" },
            ],
          },
        ],
      }),
    );
    const loaded = loadShoppingList();
    expect(loaded.categories).toHaveLength(1);
    expect(loaded.categories[0]!.items).toHaveLength(1);
  });
});

describe("persistShoppingList", () => {
  it("persists a normalized copy (no duplicates on disk)", () => {
    persistShoppingList({
      categories: [
        {
          name: "Інше",
          items: [
            { id: "1", name: "Хліб" },
            { id: "2", name: "хліб" },
          ],
        },
      ],
    });
    const stored = JSON.parse(
      globalThis.localStorage.getItem(SHOPPING_LIST_KEY)!,
    );
    expect(stored.categories[0].items).toHaveLength(1);
  });

  it("persists empty list on nullish input", () => {
    persistShoppingList(null);
    const stored = JSON.parse(
      globalThis.localStorage.getItem(SHOPPING_LIST_KEY)!,
    );
    expect(stored).toEqual({ categories: [] });
  });
});

describe("toggleShoppingItem", () => {
  it("toggles a single item by id within a category", () => {
    const list = {
      categories: [
        {
          name: "A",
          items: [
            { id: "1", name: "X", checked: false },
            { id: "2", name: "Y", checked: false },
          ],
        },
      ],
    };
    const next = toggleShoppingItem(list, "A", "1");
    expect(next!.categories[0]!.items[0]!.checked).toBe(true);
    expect(next!.categories[0]!.items[1]!.checked).toBe(false);
  });
});

describe("getTotalCount / getCheckedItems / removeCheckedItems", () => {
  const list = {
    categories: [
      {
        name: "A",
        items: [
          { id: "1", name: "X", checked: true },
          { id: "2", name: "Y", checked: false },
        ],
      },
      {
        name: "B",
        items: [{ id: "3", name: "Z", checked: true }],
      },
    ],
  };

  it("returns totals", () => {
    expect(getTotalCount(list)).toEqual({ total: 3, checked: 2 });
  });

  it("returns all checked items", () => {
    expect(getCheckedItems(list).map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("removes only checked items and drops empty categories", () => {
    const out = removeCheckedItems(list);
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0]!.name).toBe("A");
    expect(out.categories[0]!.items.map((i) => i.id)).toEqual(["2"]);
  });
});
