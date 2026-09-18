import { fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";

import { RecipeFormPage } from "../RecipeForm";

const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
};
let mockParams: { id?: string; presetId?: string } = {};

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const mockGetRecipeById = jest.fn();
const mockUpsertSavedRecipe = jest.fn();
jest.mock("../../lib/recipeBookStore", () => ({
  getRecipeById: (...args: unknown[]) => mockGetRecipeById(...args),
  upsertSavedRecipe: (...args: unknown[]) => mockUpsertSavedRecipe(...args),
}));

describe("RecipeFormPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockGetRecipeById.mockReturnValue(undefined);
    mockUpsertSavedRecipe.mockReturnValue({ id: "rcp_saved" });
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
  });

  it("alerts when saving without a title", () => {
    const { getByTestId } = render(<RecipeFormPage testID="recipe-form" />);

    fireEvent.press(getByTestId("recipe-form-save"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Потрібна назва",
      "Введи назву рецепта",
    );
    expect(mockUpsertSavedRecipe).not.toHaveBeenCalled();
  });

  it("saves a new recipe with manual id, multiline fields, and macros", () => {
    const { getByTestId, getByPlaceholderText } = render(
      <RecipeFormPage testID="recipe-form" />,
    );

    fireEvent.changeText(getByTestId("recipe-form-title"), " Борщ ");
    fireEvent.changeText(getByTestId("recipe-form-id"), "borsch");
    fireEvent.changeText(getByPlaceholderText("45"), "60");
    fireEvent.changeText(getByPlaceholderText("2"), "4");
    fireEvent.changeText(getByPlaceholderText("ккал"), "450");
    fireEvent.changeText(getByPlaceholderText("білки"), "18");
    fireEvent.changeText(getByPlaceholderText("жири"), "12");
    fireEvent.changeText(getByPlaceholderText("вуглев."), "64");
    fireEvent.changeText(getByTestId("recipe-form-ing"), "буряк\n\nкартопля\n");
    fireEvent.changeText(getByTestId("recipe-form-steps"), "Нарізати\nВарити");
    fireEvent.press(getByTestId("recipe-form-save"));

    expect(mockUpsertSavedRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "borsch",
        title: "Борщ",
        timeMinutes: 60,
        servings: 4,
        ingredients: ["буряк", "картопля"],
        steps: ["Нарізати", "Варити"],
        macros: {
          kcal: 450,
          protein_g: 18,
          fat_g: 12,
          carbs_g: 64,
        },
      }),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/(tabs)/nutrition/recipe/[id]",
      params: { id: "rcp_saved" },
    });
  });

  it("seeds preset id for a missing recipe opened from RecipeDetail", () => {
    const { getByTestId, rerender } = render(
      <RecipeFormPage testID="recipe-form" />,
    );

    mockParams = { presetId: "rcp_missing" };
    rerender(<RecipeFormPage testID="recipe-form" />);

    expect(getByTestId("recipe-form-id").props.value).toBe("rcp_missing");

    fireEvent.changeText(getByTestId("recipe-form-title"), "Каша");
    fireEvent.press(getByTestId("recipe-form-save"));

    expect(mockUpsertSavedRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rcp_missing", title: "Каша" }),
    );
  });
});
