/**
 * Sergeant Routine — RoutineTabPlaceholder render coverage.
 */

import { render } from "@testing-library/react-native";

import { RoutineTabPlaceholder } from "./RoutineTabPlaceholder";

describe("RoutineTabPlaceholder", () => {
  it("renders the supplied title, description, features, and footer copy", () => {
    const { getByText } = render(
      <RoutineTabPlaceholder
        title="Статистика"
        emoji="📊"
        description="Швидкий огляд прогресу звичок."
        plannedFeatures={["Серії за тиждень", "Найсильніші дні"]}
      />,
    );

    expect(getByText("📊")).toBeTruthy();
    expect(getByText("Статистика")).toBeTruthy();
    expect(getByText("Швидкий огляд прогресу звичок.")).toBeTruthy();
    expect(getByText("Заплановано до порту")).toBeTruthy();
    expect(getByText("Серії за тиждень")).toBeTruthy();
    expect(getByText("Найсильніші дні")).toBeTruthy();
    expect(
      getByText("Скоро — буде портовано у наступному PR Фази 5."),
    ).toBeTruthy();
  });
});
