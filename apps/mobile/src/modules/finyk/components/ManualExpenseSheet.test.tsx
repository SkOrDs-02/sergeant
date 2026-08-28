import { AccessibilityInfo } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  ManualExpenseSheet,
  MANUAL_EXPENSE_CATEGORIES,
  upgradeCategory,
} from "./ManualExpenseSheet";

describe("upgradeCategory — апостроф у збереженому значенні", () => {
  // Канон §1.10: підписи в коді канонічні (`ʼ`), але це ЗНАЧЕННЯ, яке
  // лежить у сховищі — його писали попередні версії застосунку й інша
  // платформа, через ASCII `'`. Без згортання на межі точний збіг
  // провалюється, legacy-мапа теж, і витрата мовчки стає «🏷 інше».
  const forms = ["'", "\u2019", "\u02BC"];

  it("розрізняє три форми як різні символи", () => {
    expect(new Set(forms).size).toBe(3);
  });

  it.each(forms)("Ера 2 «💊 здоров%sя» → канонічна категорія", (a) => {
    expect(upgradeCategory(`\u{1F48A} здоров${a}я`)).toBe("\u{1F48A} здоровʼя");
  });

  it.each(forms)("Ера 1 «здоров%sя» → канонічна категорія", (a) => {
    expect(upgradeCategory(`здоров${a}я`)).toBe("\u{1F48A} здоровʼя");
  });

  it("невідоме значення й далі падає в дефолт", () => {
    expect(upgradeCategory("щось геть інше")).toBe("🏷 інше");
    expect(upgradeCategory(undefined)).toBe("🏷 інше");
  });
});

describe("ManualExpenseSheet", () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation(() => ({ remove: () => {} }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not render when closed", () => {
    render(
      <ManualExpenseSheet
        open={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />,
    );
    expect(screen.queryByText("Додати витрату")).toBeNull();
  });

  it("renders the full category list and the primary action label", () => {
    render(<ManualExpenseSheet open onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByText("Додати витрату")).toBeTruthy();
    // Spot-check a couple of category labels.
    expect(screen.getByText(MANUAL_EXPENSE_CATEGORIES[0])).toBeTruthy();
    expect(screen.getByText("🏷 інше")).toBeTruthy();
  });

  it("blocks save when the amount is empty and surfaces an inline error", () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<ManualExpenseSheet open onClose={onClose} onSave={onSave} />);

    fireEvent.press(screen.getByText("Додати"));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Вкажіть суму більше 0")).toBeTruthy();
  });

  it("submits the normalised payload and closes the sheet on save", () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<ManualExpenseSheet open onClose={onClose} onSave={onSave} />);

    fireEvent.changeText(screen.getByLabelText("Сума витрати"), "123.45");
    fireEvent.press(screen.getByText("Додати"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.amount).toBeCloseTo(123.45);
    // Category defaults to the last entry ("🏷 інше"); the fallback
    // description strips the emoji.
    expect(payload.category).toBe("🏷 інше");
    expect(payload.description).toBe("інше");
    expect(typeof payload.date).toBe("string");
    expect(payload.date.endsWith("Z")).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the trimmed description when provided", () => {
    const onSave = jest.fn();
    render(<ManualExpenseSheet open onClose={jest.fn()} onSave={onSave} />);

    fireEvent.changeText(screen.getByLabelText("Сума витрати"), "50");
    fireEvent.press(screen.getByText("🍴 їжа"));
    fireEvent.changeText(
      screen.getByPlaceholderText("Напр.: обід, таксі, квитки"),
      "  Бізнес ланч  ",
    );
    fireEvent.press(screen.getByText("Додати"));

    const payload = onSave.mock.calls[0][0];
    expect(payload.description).toBe("Бізнес ланч");
    expect(payload.category).toBe("🍴 їжа");
    expect(payload.amount).toBe(50);
  });

  it("upgrades legacy categories when editing an existing expense", () => {
    const onSave = jest.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={jest.fn()}
        onSave={onSave}
        initialExpense={{
          id: "legacy-1",
          amount: 99,
          description: "Старий запис",
          category: "одяг",
          date: "2024-01-15T12:00:00.000Z",
        }}
      />,
    );

    fireEvent.press(screen.getByText("Зберегти"));

    const payload = onSave.mock.calls[0][0];
    expect(payload.id).toBe("legacy-1");
    expect(payload.category).toBe("🛍️ покупки");
    expect(payload.description).toBe("Старий запис");
  });
});
