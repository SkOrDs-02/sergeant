import { act, fireEvent, render } from "@testing-library/react-native";
import { createApiClient } from "@sergeant/api-client";
import { ApiClientProvider } from "@sergeant/api-client/react";

import { ToastProvider } from "@/components/ui/Toast";

import {
  EAST_OF_KYIV,
  installFakeDeviceZone,
  WEST_OF_KYIV,
} from "../../__tests__/fakeDeviceZone";
import { Log } from "../Log";

jest.mock("../../hooks/useNutritionLog", () => ({
  useNutritionLog: jest.fn(),
}));

const mockShowUndoToast = jest.fn();
jest.mock("@/lib/showUndoToast", () => ({
  showUndoToast: (...args: unknown[]) => mockShowUndoToast(...args),
}));

import { useNutritionLog } from "../../hooks/useNutritionLog";

const mockedLog = useNutritionLog as jest.MockedFunction<
  typeof useNutritionLog
>;

const actions = {
  setSelectedDate: jest.fn(),
  addMeal: jest.fn(),
  removeMeal: jest.fn(),
  updateMeal: jest.fn(),
  refresh: jest.fn(),
};

const selectedDate = "2026-05-13";

function mockLogWithMeals() {
  mockedLog.mockReturnValue({
    selectedDate,
    nutritionLog: {
      [selectedDate]: {
        meals: [
          {
            id: "snack_late",
            name: "Йогурт",
            mealType: "snack",
            label: "Перекус",
            time: "16:00",
            macros: { kcal: 120, protein_g: 5, fat_g: 3, carbs_g: 18 },
            source: "manual",
            macroSource: "manual",
            amount_g: null,
            foodId: null,
          },
          {
            id: "breakfast_early",
            name: "Омлет",
            mealType: "breakfast",
            label: "Сніданок",
            time: "08:00",
            macros: { kcal: 330, protein_g: 22, fat_g: 20, carbs_g: 5 },
            source: "manual",
            macroSource: "manual",
            amount_g: null,
            foodId: null,
          },
        ],
      },
    },
    ...actions,
  });
}

function renderLog(onMealAdded = jest.fn()) {
  const client = createApiClient({
    baseUrl: "http://127.0.0.1",
    fetchImpl: jest.fn() as unknown as typeof fetch,
  });
  return render(
    <ApiClientProvider client={client}>
      <ToastProvider>
        <Log testID="nutrition-log" onMealAdded={onMealAdded} />
      </ToastProvider>
    </ApiClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLogWithMeals();
});

describe("Log", () => {
  it("renders sorted meals, macro summary, and date navigation", () => {
    const { getByTestId, getByText } = renderLog();

    expect(getByTestId("nutrition-log-meal-breakfast_early")).toBeTruthy();
    expect(getByTestId("nutrition-log-meal-snack_late")).toBeTruthy();
    expect(getByText("450")).toBeTruthy();
    expect(getByText("27 г")).toBeTruthy();

    fireEvent.press(getByTestId("nutrition-log-prev-day"));
    expect(actions.setSelectedDate).toHaveBeenCalledWith("2026-05-12");
    fireEvent.press(getByTestId("nutrition-log-next-day"));
    expect(actions.setSelectedDate).toHaveBeenCalledWith("2026-05-14");
    fireEvent.press(getByTestId("nutrition-log-today"));
    expect(actions.setSelectedDate).toHaveBeenCalledWith(expect.any(String));
  });

  it("deletes a meal with undo support", () => {
    const { getByLabelText } = renderLog();

    fireEvent.press(getByLabelText("Видалити Омлет"));

    expect(actions.removeMeal).toHaveBeenCalledWith(
      selectedDate,
      "breakfast_early",
    );
    expect(mockShowUndoToast).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        msg: "Видалено «Омлет»",
        onUndo: expect.any(Function),
      }),
    );

    const undo = mockShowUndoToast.mock.calls[0]![1] as { onUndo: () => void };
    undo.onUndo();
    expect(actions.addMeal).toHaveBeenCalledWith(
      selectedDate,
      expect.objectContaining({ id: "breakfast_early", name: "Омлет" }),
    );
  });

  it("opens the add sheet and saves a new meal", async () => {
    const onMealAdded = jest.fn();
    const { getByTestId, getByLabelText } = renderLog(onMealAdded);

    fireEvent.press(getByTestId("nutrition-log-add-meal-btn"));
    fireEvent.press(getByTestId("add-meal-source-manual"));
    fireEvent.changeText(getByTestId("add-meal-name"), "Салат");
    fireEvent.changeText(getByLabelText("Ккал"), "210");
    await act(async () => {
      fireEvent.press(getByTestId("add-meal-save"));
    });

    expect(actions.addMeal).toHaveBeenCalledWith(
      selectedDate,
      expect.objectContaining({
        name: "Салат",
        macros: expect.objectContaining({ kcal: 210 }),
      }),
    );
    expect(onMealAdded).toHaveBeenCalled();
  });

  it("long-presses an existing row to edit and updates the meal", async () => {
    const { getByLabelText, getByTestId } = renderLog();

    fireEvent(getByLabelText("Редагувати Омлет"), "longPress");
    fireEvent.changeText(getByTestId("add-meal-name"), "Омлет з сиром");
    await act(async () => {
      fireEvent.press(getByTestId("add-meal-save"));
    });

    expect(actions.updateMeal).toHaveBeenCalledWith(
      selectedDate,
      expect.objectContaining({
        id: "breakfast_early",
        name: "Омлет з сиром",
      }),
    );
  });

  it("renders the empty state when no meals exist", () => {
    mockedLog.mockReturnValue({
      selectedDate,
      nutritionLog: {},
      ...actions,
    });

    const { getByText } = renderLog();

    expect(getByText("Немає записів за цей день")).toBeTruthy();
    expect(
      getByText("Натисни «+ Додати прийом», щоб записати їжу."),
    ).toBeTruthy();
  });
});

describe("Log — «сьогодні» за годинником пристрою (ADR-0078)", () => {
  // `kyivDayLabel`: київський день відносно пристрою — завтра на заході
  // (пристрій ще в попередньому дні), вчора на сході.
  const zones = [
    ["на захід від Києва (UTC-5)", WEST_OF_KYIV, "Завтра"],
    ["на схід від Києва (UTC+10)", EAST_OF_KYIV, "Вчора"],
  ] as const;
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it.each(zones)(
    "день пристрою — «Сьогодні», кнопка повертає на нього: %s",
    (_name, zone) => {
      restore = installFakeDeviceZone(zone);
      mockedLog.mockReturnValue({
        selectedDate: zone.deviceDay,
        nutritionLog: {},
        ...actions,
      });

      const { getByTestId, getByText, queryByText } = renderLog();

      expect(getByText("Сьогодні")).toBeTruthy();
      // На «сьогодні» під підписом немає дати-підказки.
      expect(queryByText(zone.deviceDay)).toBeNull();

      fireEvent.press(getByTestId("nutrition-log-today"));
      expect(actions.setSelectedDate).toHaveBeenCalledWith(zone.deviceDay);
    },
  );

  it.each(zones)(
    "київський день рахується відносно пристрою, а не «сьогодні»: %s",
    (_name, zone, kyivDayLabel) => {
      restore = installFakeDeviceZone(zone);
      mockedLog.mockReturnValue({
        selectedDate: zone.kyivDay,
        nutritionLog: {},
        ...actions,
      });

      const { getByText, queryByText } = renderLog();

      expect(getByText(kyivDayLabel)).toBeTruthy();
      expect(queryByText("Сьогодні")).toBeNull();
    },
  );
});
