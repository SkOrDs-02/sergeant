// @vitest-environment jsdom
/**
 * RoutineFilterChips — покриття для стелі чипів (атрактор №7 §3.2).
 *
 * `tagChips` тепер приходить обмежений видимим періодом
 * (`useRoutineDerivedData.ts`), тож ці тести фіксують крайовий випадок:
 * активний `tagFilter`, якого немає серед `tagChips` (бо в новому періоді
 * тег без подій), лишається видимим і знімним, а не мовчки зникає.
 */
import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RoutineFilterChips } from "./RoutineFilterChips";

afterEach(cleanup);

function renderChips(
  over: Partial<ComponentProps<typeof RoutineFilterChips>> = {},
) {
  const setTagFilter = vi.fn();
  const onClearFilter = vi.fn();
  render(
    <RoutineFilterChips
      tagFilter={null}
      setTagFilter={setTagFilter}
      onClearFilter={onClearFilter}
      tagChips={[]}
      showFizruk={false}
      showFinykSubs={false}
      {...over}
    />,
  );
  return { setTagFilter, onClearFilter };
}

describe("RoutineFilterChips — стеля чипів", () => {
  it("рендерить рівно по одному чипу на видимий тег", () => {
    renderChips({ tagChips: ["Ранок", "Спорт"] });
    expect(screen.getByRole("button", { name: "Ранок" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Спорт" })).toBeInTheDocument();
  });

  it("не рендерить чип для тега, якого немає в tagChips видимого періоду", () => {
    renderChips({ tagChips: ["Ранок"] });
    expect(screen.queryByRole("button", { name: "Вечір" })).toBeNull();
  });

  it("активний tagFilter поза tagChips лишається видимим знімним чипом", () => {
    renderChips({ tagFilter: "Вечір", tagChips: ["Ранок"] });
    expect(screen.getByRole("button", { name: /Вечір/ })).toBeInTheDocument();
  });

  it("знімний чип пояснює дію, а не лише називає тег", () => {
    renderChips({ tagFilter: "Вечір", tagChips: ["Ранок"] });
    expect(
      screen.getByRole("button", { name: /Прибрати фільтр за тегом/ }),
    ).toBeInTheDocument();
  });

  it("клік по знімному чипу скидає фільтр", () => {
    const { onClearFilter } = renderChips({
      tagFilter: "Вечір",
      tagChips: ["Ранок"],
    });
    fireEvent.click(screen.getByRole("button", { name: /Вечір/ }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it("не рендерить знімний чип, коли активний фільтр вже є серед tagChips", () => {
    renderChips({ tagFilter: "Ранок", tagChips: ["Ранок"] });
    // Рівно один елемент "Ранок" — сам звичайний чип, без дубля-хвоста.
    expect(screen.getAllByRole("button", { name: /Ранок/ })).toHaveLength(1);
  });

  it("не рендерить знімний чип для спеціальних фільтрів (__fizruk/__finyk_sub)", () => {
    renderChips({ tagFilter: "__fizruk", tagChips: [], showFizruk: true });
    // Лише «Усі» + власний чип категорії «Фізрук» — жодного третього,
    // знімного чипа з сирим значенням '__fizruk' у назві.
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByText("__fizruk")).toBeNull();
  });
});
