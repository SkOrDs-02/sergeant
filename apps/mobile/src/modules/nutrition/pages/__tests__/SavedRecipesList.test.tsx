import { fireEvent, render } from "@testing-library/react-native";

import { SavedRecipesListPage } from "../SavedRecipesList";

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => mockRouter,
}));

jest.mock("../../hooks/useSavedRecipesList", () => ({
  useSavedRecipesList: jest.fn(),
}));

const mockImportRecipesFromJson = jest.fn();
jest.mock("../../lib/recipeBookStore", () => ({
  importRecipesFromJson: (...args: unknown[]) =>
    mockImportRecipesFromJson(...args),
}));

import { useSavedRecipesList } from "../../hooks/useSavedRecipesList";
import type { SavedRecipe } from "../../lib/recipeBookStore";

const mockedRecipes = useSavedRecipesList as jest.MockedFunction<
  typeof useSavedRecipesList
>;

const RECIPE: SavedRecipe = {
  id: "rcp_soup",
  title: "Гарбузовий суп",
  timeMinutes: 35,
  servings: 2,
  ingredients: ["гарбуз"],
  steps: ["Запекти", "Збити"],
  tips: [],
  macros: { kcal: 260, protein_g: 7, fat_g: 10, carbs_g: 36 },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedRecipes.mockReturnValue({ recipes: [] });
  mockImportRecipesFromJson.mockReturnValue({ ok: true, count: 1 });
});

describe("SavedRecipesListPage", () => {
  it("renders empty state and navigates to the new-recipe form", () => {
    const { getByText, getByTestId } = render(
      <SavedRecipesListPage testID="saved-recipes" />,
    );

    expect(getByText(/Порожньо/i)).toBeTruthy();
    fireEvent.press(getByTestId("saved-recipes-new"));
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/(tabs)/nutrition/recipe/form",
    );
  });

  it("renders saved recipes and opens recipe details", () => {
    mockedRecipes.mockReturnValue({ recipes: [RECIPE] });
    const { getByTestId, getByText } = render(
      <SavedRecipesListPage testID="saved-recipes" />,
    );

    expect(getByText("Гарбузовий суп")).toBeTruthy();
    expect(getByText("35 хв")).toBeTruthy();

    fireEvent.press(getByTestId("saved-recipe-row-rcp_soup"));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/(tabs)/nutrition/recipe/[id]",
      params: { id: "rcp_soup" },
    });
  });

  it("shows import errors and keeps the modal open", () => {
    mockImportRecipesFromJson.mockReturnValue({
      ok: false,
      error: "Невалідний JSON",
    });
    const { getByTestId, getByText } = render(
      <SavedRecipesListPage testID="saved-recipes" />,
    );

    fireEvent.press(getByTestId("saved-recipes-import"));
    fireEvent.changeText(getByTestId("saved-recipes-import-input"), "{");
    fireEvent.press(getByTestId("saved-recipes-import-apply"));

    expect(mockImportRecipesFromJson).toHaveBeenCalledWith("{");
    expect(getByText("Невалідний JSON")).toBeTruthy();
  });

  it("closes import modal after a successful import", () => {
    const { getByTestId, queryByTestId } = render(
      <SavedRecipesListPage testID="saved-recipes" />,
    );

    fireEvent.press(getByTestId("saved-recipes-import"));
    fireEvent.changeText(
      getByTestId("saved-recipes-import-input"),
      '[{"id":"r1","title":"Суп"}]',
    );
    fireEvent.press(getByTestId("saved-recipes-import-apply"));

    expect(mockImportRecipesFromJson).toHaveBeenCalledWith(
      '[{"id":"r1","title":"Суп"}]',
    );
    expect(queryByTestId("saved-recipes-import-input")).toBeNull();
  });
});
