import { fireEvent, render } from "@testing-library/react-native";
import { Share } from "react-native";

import { ToastProvider } from "@/components/ui/Toast";

import { RecipeDetailPage } from "../RecipeDetail";

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => mockRouter,
}));

jest.mock("../../hooks/useSavedRecipeById", () => ({
  useSavedRecipeById: jest.fn(),
}));

const mockRemoveSavedRecipe = jest.fn();
const mockUpsertSavedRecipe = jest.fn();
jest.mock("../../lib/recipeBookStore", () => ({
  removeSavedRecipe: (...args: unknown[]) => mockRemoveSavedRecipe(...args),
  upsertSavedRecipe: (...args: unknown[]) => mockUpsertSavedRecipe(...args),
}));

const mockShowUndoToast = jest.fn();
jest.mock("@/lib/showUndoToast", () => ({
  showUndoToast: (...args: unknown[]) => mockShowUndoToast(...args),
}));

import { useSavedRecipeById } from "../../hooks/useSavedRecipeById";
import type { SavedRecipe } from "../../lib/recipeBookStore";

const mockedRecipeById = useSavedRecipeById as jest.MockedFunction<
  typeof useSavedRecipeById
>;

const RECIPE: SavedRecipe = {
  id: "rcp_omelet",
  title: "Омлет з овочами",
  timeMinutes: 15,
  servings: 2,
  ingredients: ["3 яйця", "перець"],
  steps: ["Збити яйця", "Посмажити"],
  tips: ["Подавай теплим"],
  macros: { kcal: 320, protein_g: 22, fat_g: 20, carbs_g: 6 },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

function renderPage(id: string | string[] | undefined) {
  return render(
    <ToastProvider>
      <RecipeDetailPage id={id} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
});

describe("RecipeDetailPage", () => {
  it("shows an invalid-id state when no recipe id is supplied", () => {
    mockedRecipeById.mockReturnValue({ recipe: undefined, recipeId: "" });

    const { getByText } = renderPage(undefined);

    expect(getByText("Некоректний ID рецепта.")).toBeTruthy();
  });

  it("shows missing-recipe actions for a valid id absent on the device", () => {
    mockedRecipeById.mockReturnValue({
      recipe: undefined,
      recipeId: "rcp_missing",
    });

    const { getByText, getByTestId } = renderPage("rcp_missing");

    expect(getByTestId("recipe-rcp_missing-missing")).toBeTruthy();
    fireEvent.press(getByText("Створити з цим ID"));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/(tabs)/nutrition/recipe/form",
      params: { presetId: "rcp_missing" },
    });

    fireEvent.press(getByText("Усі збережені"));
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/(tabs)/nutrition/saved-recipes",
    );
  });

  it("renders recipe details and supports share/edit/delete with undo", () => {
    mockedRecipeById.mockReturnValue({
      recipe: RECIPE,
      recipeId: RECIPE.id,
    });

    const { getByText, getByTestId } = renderPage(RECIPE.id);

    expect(getByTestId("recipe-rcp_omelet-root")).toBeTruthy();
    expect(getByText("⏱ 15 хв")).toBeTruthy();
    expect(getByText("Порції: 2")).toBeTruthy();
    expect(getByTestId("recipe-rcp_omelet-macros").props.children).toContain(
      "Ккал: 320",
    );
    expect(getByText("• 3 яйця")).toBeTruthy();
    expect(getByText("1. Збити яйця")).toBeTruthy();
    expect(getByText("Подавай теплим")).toBeTruthy();

    fireEvent.press(getByText("JSON"));
    expect(Share.share).toHaveBeenCalledWith({
      title: RECIPE.title,
      message: JSON.stringify(RECIPE, null, 2),
    });

    fireEvent.press(getByTestId("recipe-rcp_omelet-edit"));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/(tabs)/nutrition/recipe/form",
      params: { id: RECIPE.id },
    });

    fireEvent.press(getByTestId("recipe-rcp_omelet-delete"));
    expect(mockRemoveSavedRecipe).toHaveBeenCalledWith(RECIPE.id);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockShowUndoToast).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        msg: "Рецепт «Омлет з овочами» видалено",
        onUndo: expect.any(Function),
      }),
    );

    const undo = mockShowUndoToast.mock.calls[0]![1] as { onUndo: () => void };
    undo.onUndo();
    expect(mockUpsertSavedRecipe).toHaveBeenCalledWith(RECIPE);
  });

  it("renders an explicit empty-macros message", () => {
    mockedRecipeById.mockReturnValue({
      recipe: {
        ...RECIPE,
        id: "rcp_plain",
        macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
      },
      recipeId: "rcp_plain",
    });

    const { getByTestId } = renderPage("rcp_plain");

    expect(getByTestId("recipe-rcp_plain-empty-macros").props.children).toBe(
      "Макроси не зазначено",
    );
  });
});
