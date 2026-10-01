// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `ShoppingListCard`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openHubModule = vi.fn();
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModule: (...a: unknown[]) => openHubModule(...a),
}));

// `SilpoCartEntry` (embedded in the header row) gates on
// `useSilpoSyncState` — mocked at the `@finyk/hooks` boundary here so these
// unrelated ShoppingListCard tests don't need a real QueryClientProvider.
// Default "disconnected" makes `SilpoCartEntry` a no-op render (returns
// `null` before it ever mounts `SilpoCartSheet`, which is the component
// that actually touches React Query) — end-to-end "У кошик Сільпо" flow is
// covered by `SilpoCartEntry.test.tsx`.
const syncStateMock = vi.fn(() => ({ status: "disconnected" }));
vi.mock("@finyk/hooks/useSilpoSyncState", () => ({
  useSilpoSyncState: () => syncStateMock(),
}));

import { ShoppingListCard } from "./ShoppingListCard";

const listWithItems = {
  categories: [
    {
      name: "Молочні продукти",
      items: [
        { id: "i1", name: "Молоко", checked: false },
        { id: "i2", name: "Сир", checked: true },
      ],
    },
  ],
} as never;

const listForPantryMath = {
  categories: [
    {
      name: "Молочні продукти",
      items: [
        {
          id: "i1",
          name: "Молоко",
          quantity: "700 г",
          note: "",
          checked: false,
        },
      ],
    },
  ],
} as never;

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    recipes: [],
    weekPlan: null,
    pantryItems: [],
    shoppingList: { categories: [] } as never,
    shoppingBusy: false,
    onGenerate: vi.fn(),
    onToggleItem: vi.fn(),
    onClearChecked: vi.fn(),
    onClearAll: vi.fn(),
    onAddCheckedToPantry: vi.fn(),
    onAddItem: vi.fn(),
    checkedItems: [],
    ...overrides,
  };
}

beforeEach(() => {
  syncStateMock.mockReturnValue({ status: "disconnected" });
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe("ShoppingListCard", () => {
  it("renders the empty state and disabled generate when no source data", () => {
    render(<ShoppingListCard {...baseProps()} />);
    expect(screen.getByText(/Список покупок порожній/)).toBeInTheDocument();
    // Порожньо і в збережених, і в згенерованих: підказка називає обидва шляхи.
    expect(
      screen.getByText(/Збережи рецепти або згенеруй/),
    ).toBeInTheDocument();
    expect(screen.getByText("Згенерувати список покупок")).toBeDisabled();
  });

  it("enables generation once a recipe is picked and passes it to onGenerate", () => {
    const onGenerate = vi.fn();
    const borsch = { title: "Борщ", ingredients: ["буряк"] };
    render(
      <ShoppingListCard {...baseProps({ recipes: [borsch], onGenerate })} />,
    );
    // Поки нічого не позначено, генерувати нема з чого.
    expect(screen.getByText("Згенерувати список покупок")).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Борщ/ }));
    fireEvent.click(screen.getByText("Згенерувати список покупок"));
    expect(onGenerate).toHaveBeenCalledWith("recipes", [borsch]);
  });

  it("switches the source to the week plan", () => {
    const onGenerate = vi.fn();
    render(
      <ShoppingListCard
        {...baseProps({
          weekPlan: { days: [{}, {}] },
          onGenerate,
        })}
      />,
    );
    fireEvent.click(screen.getByText("Тижневий план"));
    fireEvent.click(screen.getByText("Згенерувати список покупок"));
    // Тижневий план вибору рецептів не має: другого аргумента немає.
    expect(onGenerate).toHaveBeenCalledWith("weekplan");
    expect(onGenerate.mock.calls[0]).toHaveLength(1);
  });

  it("renders the item list and toggles an item", () => {
    const onToggleItem = vi.fn();
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listWithItems,
          checkedItems: [{ id: "i2", name: "Сир", checked: true }],
          onToggleItem,
        })}
      />,
    );
    expect(screen.getByText("Молочні продукти")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Молоко"));
    expect(onToggleItem).toHaveBeenCalledWith("Молочні продукти", "i1");
  });

  it("exposes clear + add-to-pantry actions when items are checked", () => {
    const onClearAll = vi.fn();
    const onClearChecked = vi.fn();
    const onAddCheckedToPantry = vi.fn();
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listWithItems,
          checkedItems: [{ id: "i2", name: "Сир", checked: true }],
          onClearAll,
          onClearChecked,
          onAddCheckedToPantry,
        })}
      />,
    );
    fireEvent.click(screen.getByText("+ До комори"));
    expect(onAddCheckedToPantry).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Видалити позначені"));
    expect(onClearChecked).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Очистити"));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("navigates to Finyk analytics from the spend link", () => {
    render(<ShoppingListCard {...baseProps()} />);
    fireEvent.click(screen.getByText(/Скільки витратив/));
    expect(openHubModule).toHaveBeenCalledWith("finyk", "/analytics");
  });
});

describe("ShoppingListCard — manual add", () => {
  it("is disabled with an empty input and does not call onAddItem", () => {
    const onAddItem = vi.fn();
    render(<ShoppingListCard {...baseProps({ onAddItem })} />);
    const addButton = screen.getByText("Додати");
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton);
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("calls onAddItem with the trimmed name and clears the input", () => {
    const onAddItem = vi.fn();
    render(<ShoppingListCard {...baseProps({ onAddItem })} />);
    const input = screen.getByPlaceholderText("напр. хліб");
    fireEvent.change(input, { target: { value: "  Хліб  " } });
    fireEvent.click(screen.getByText("Додати"));
    expect(onAddItem).toHaveBeenCalledWith({ name: "  Хліб  " });
    expect(input).toHaveValue("");
  });

  it("adds a manual item on Enter", () => {
    const onAddItem = vi.fn();
    render(<ShoppingListCard {...baseProps({ onAddItem })} />);
    const input = screen.getByPlaceholderText("напр. хліб");
    fireEvent.change(input, { target: { value: "Молоко" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddItem).toHaveBeenCalledWith({ name: "Молоко" });
  });

  it("does not call onAddItem for a whitespace-only value", () => {
    const onAddItem = vi.fn();
    render(<ShoppingListCard {...baseProps({ onAddItem })} />);
    const input = screen.getByPlaceholderText("напр. хліб");
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByText("Додати")).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddItem).not.toHaveBeenCalled();
  });
});

describe("ShoppingListCard — pantry math (рівень 1)", () => {
  it("reduces a partially-covered item's quantity and shows the calcNote", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listForPantryMath,
          pantryItems: [{ name: "молоко", qty: 400, unit: "г", notes: null }],
        })}
      />,
    );
    expect(screen.getByText("300 г")).toBeInTheDocument();
    expect(screen.getByText("700 г − 400 г у коморі")).toBeInTheDocument();
  });

  it("moves a fully-covered item into the collapsed «Вже вдома» section", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listForPantryMath,
          pantryItems: [{ name: "молоко", qty: 900, unit: "г", notes: null }],
        })}
      />,
    );
    // Не видно в активному списку — воно в «Вже вдома», згорнутому за замовчуванням.
    expect(screen.queryByText("700 г")).not.toBeInTheDocument();
    const athomeToggle = screen.getByText("Вже вдома");
    fireEvent.click(athomeToggle);
    expect(screen.getByText("700 г")).toBeInTheDocument();
    expect(screen.getAllByText("Молоко").length).toBeGreaterThan(0);
  });

  it("merges a low-stock pantry item not already in the list, with the badge", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: { categories: [] } as never,
          pantryItems: [{ name: "сіль", qty: 50, unit: "г", notes: null }],
        })}
      />,
    );
    expect(screen.getByText("сіль")).toBeInTheDocument();
    expect(screen.getByText("Закінчується")).toBeInTheDocument();
  });

  it("toggle off shows the raw list without pantry adjustments", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listForPantryMath,
          pantryItems: [{ name: "молоко", qty: 400, unit: "г", notes: null }],
        })}
      />,
    );
    // Тумблер за замовчуванням увімкнено — кількість вже скоригована.
    expect(screen.getByText("300 г")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Враховувати комору/ }));
    // Вимкнено — сирий список, без розрахунку.
    expect(screen.queryByText("300 г")).not.toBeInTheDocument();
    expect(screen.getByText("700 г")).toBeInTheDocument();
    expect(
      screen.queryByText("700 г − 400 г у коморі"),
    ).not.toBeInTheDocument();
  });

  it("тумблер лишається на екрані й вмикається назад, коли сирий список порожній", () => {
    // Регресія: тумблер жив усередині `hasItems`, а `hasItems` залежить від
    // самого тумблера. Порожній сирий список + «Закінчується» з комори:
    // вимкнув → довлиті позиції зникли → `hasItems` став `false` → зник і
    // тумблер, а вимкнений стан лишився в LS, тож повернути його було
    // нічим.
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: { categories: [] } as never,
          pantryItems: [{ name: "сіль", qty: 50, unit: "г", notes: null }],
        })}
      />,
    );
    expect(screen.getByText("сіль")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Враховувати комору/ }));
    // Вимкнено: довлитого «сіль» немає, а тумблер на місці у стані «вимкнено».
    expect(screen.queryByText("сіль")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Враховувати комору/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(screen.getByText("сіль")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Враховувати комору/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("вимкнений стан із LS не ховає тумблер на порожньому списку", () => {
    // Той самий корінь через персист: користувач уже вимкнув тумблер раніше,
    // відкриває картку з порожнім списком — тумблер має бути видимим.
    localStorage.setItem("nutrition_shopping_pantry_math_v1", "false");
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: { categories: [] } as never,
          pantryItems: [{ name: "сіль", qty: 50, unit: "г", notes: null }],
        })}
      />,
    );
    const toggle = screen.getByRole("button", { name: /Враховувати комору/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByText("сіль")).toBeInTheDocument();
  });

  it("порожній список і комора без «Закінчується»: тумблера немає, його нема чого перемикати", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: { categories: [] } as never,
          pantryItems: [{ name: "рис", qty: 5, unit: "кг", notes: null }],
        })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Враховувати комору/ }),
    ).not.toBeInTheDocument();
  });

  it("озвучує стан «куплено» через aria-pressed, а не лише візуально", () => {
    // Регресія WF-17 (аудит 2026-09-16): коло-індикатор має `aria-hidden`,
    // а `opacity-50`/`line-through` скрінрідер не читає — куплений і
    // некуплений пункт звучали ідентично.
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listWithItems,
          checkedItems: [{ id: "i2", name: "Сир", checked: true }],
        })}
      />,
    );
    const row = screen.getByText("Молоко").closest("button")!;
    expect(row).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ShoppingListCard — вибір рецептів (збережені + згенеровані)", () => {
  // Рішення власника 2026-10-01: джерело «Рецепти» показує і «Мої рецепти»,
  // і згенеровані, з мультивибором; список складається з усіх позначених.
  const saved = (id: string, title: string, ingredients: string[] = ["сіль"]) =>
    ({
      id,
      title,
      timeMinutes: 20,
      servings: 2,
      ingredients,
      steps: [],
      tips: [],
      macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 40 },
      createdAt: 1,
      updatedAt: 1,
    }) as never;
  const generated = (id: string, title: string) => ({
    id,
    title,
    ingredients: ["яйця", "молоко"],
  });

  it("показує збережені й згенеровані двома підписаними групами, а не «немає рецептів»", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          savedRecipes: [saved("s1", "Борщ"), saved("s2", "Плов")],
          recipes: [generated("g1", "Омлет")],
        })}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Мої рецепти" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Згенеровані" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("Обрано 0 з 3")).toBeInTheDocument();
    // Підпис на кнопці джерела рахує обидві групи, з правильною формою слова.
    expect(screen.getByText("3 рецепти")).toBeInTheDocument();
    expect(screen.queryByText("немає рецептів")).not.toBeInTheDocument();
  });

  it("лише збережені рецепти (нічого не згенеровано) теж дають вибір, без підказки «порожньо»", () => {
    render(
      <ShoppingListCard
        {...baseProps({ savedRecipes: [saved("s1", "Борщ")] })}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /Борщ/ })).toBeInTheDocument();
    expect(
      screen.queryByText(/Збережи рецепти або згенеруй/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 рецепт")).toBeInTheDocument();
  });

  it("поки рецептів не позначено, генерація вимкнена і підказує що робити", () => {
    render(
      <ShoppingListCard
        {...baseProps({ savedRecipes: [saved("s1", "Борщ")] })}
      />,
    );
    expect(screen.getByText("Згенерувати список покупок")).toBeDisabled();
    expect(
      screen.getByText("Познач рецепти, з яких скласти список."),
    ).toBeInTheDocument();
  });

  it("мультивибір: список складається з усіх позначених, у порядку переліку", () => {
    const onGenerate = vi.fn();
    const s1 = saved("s1", "Борщ");
    const s2 = saved("s2", "Плов");
    const g1 = generated("g1", "Омлет");
    render(
      <ShoppingListCard
        {...baseProps({ savedRecipes: [s1, s2], recipes: [g1], onGenerate })}
      />,
    );
    // Позначаємо не по порядку: згенерований першим, збережений другим.
    fireEvent.click(screen.getByRole("checkbox", { name: /Омлет/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Борщ/ }));
    expect(screen.getByText("Обрано 2 з 3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Згенерувати список покупок"));
    expect(onGenerate).toHaveBeenCalledWith("recipes", [s1, g1]);
  });

  it("повторний тап знімає позначку", () => {
    const onGenerate = vi.fn();
    render(
      <ShoppingListCard
        {...baseProps({ savedRecipes: [saved("s1", "Борщ")], onGenerate })}
      />,
    );
    const box = screen.getByRole("checkbox", { name: /Борщ/ });
    fireEvent.click(box);
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(screen.getByText("Згенерувати список покупок")).toBeDisabled();
  });

  it("згенерований рецепт, який уже збережено під тією самою назвою, не дублюється", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          savedRecipes: [saved("s1", "Омлет з сиром")],
          recipes: [
            generated("g1", "  омлет  З сиром "),
            generated("g2", "Плов"),
          ],
        })}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getAllByRole("checkbox", { name: /Омлет/i })).toHaveLength(1);
  });

  it("«Обрати всі» і «Зняти вибір»", () => {
    const onGenerate = vi.fn();
    const s1 = saved("s1", "Борщ");
    const g1 = generated("g1", "Омлет");
    render(
      <ShoppingListCard
        {...baseProps({ savedRecipes: [s1], recipes: [g1], onGenerate })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Обрати всі" }));
    expect(screen.getByText("Обрано 2 з 2")).toBeInTheDocument();
    // Усе позначено: «Обрати всі» зникає, лишається «Зняти вибір».
    expect(
      screen.queryByRole("button", { name: "Обрати всі" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Згенерувати список покупок"));
    expect(onGenerate).toHaveBeenCalledWith("recipes", [s1, g1]);

    fireEvent.click(screen.getByRole("button", { name: "Зняти вибір" }));
    expect(screen.getByText("Обрано 0 з 2")).toBeInTheDocument();
  });

  it("стеля запиту 20 рецептів: зайві не вибираються, підказка видима", () => {
    const onGenerate = vi.fn();
    const many = Array.from({ length: 22 }, (_, i) =>
      saved(`s${i}`, `Рецепт ${i}`),
    );
    render(
      <ShoppingListCard {...baseProps({ savedRecipes: many, onGenerate })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Обрати всі" }));
    expect(screen.getByText("Обрано 20 з 22")).toBeInTheDocument();
    expect(
      screen.getByText("Максимум 20 рецептів за раз."),
    ).toBeInTheDocument();
    // Два рядки поза стелею заблоковані, позначені - ні.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[21]).toBeDisabled();
    expect(boxes[0]).toBeEnabled();
    fireEvent.click(screen.getByText("Згенерувати список покупок"));
    expect(onGenerate.mock.calls[0]![1]).toHaveLength(20);
  });

  it("поки збережені читаються з книги, каже про це, а не «порожньо»", () => {
    render(<ShoppingListCard {...baseProps({ savedRecipesBusy: true })} />);
    expect(
      screen.getByText("Завантажую збережені рецепти…"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Збережи рецепти або згенеруй/),
    ).not.toBeInTheDocument();
  });

  it("рядок вибору - нативний чекбокс у label з touch-target (≥44px)", () => {
    render(
      <ShoppingListCard
        {...baseProps({ savedRecipes: [saved("s1", "Борщ")] })}
      />,
    );
    const label = screen
      .getByRole("checkbox", { name: /Борщ/ })
      .closest("label");
    expect(label).toHaveClass("touch-target");
  });

  it("на вкладці «Тижневий план» вибору рецептів немає", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          savedRecipes: [saved("s1", "Борщ")],
          weekPlan: { days: [{}] },
        })}
      />,
    );
    fireEvent.click(screen.getByText("Тижневий план"));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
