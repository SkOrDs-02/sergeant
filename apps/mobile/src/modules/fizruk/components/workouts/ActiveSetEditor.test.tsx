/**
 * Підхід «вага > 0, повторень 0» не зараховується доменом (`isSetCompleted`),
 * тож редактор не має його зберігати: інакше рядок виглядає введеним, а в
 * лічильник сесії, підсумок і стрік не потрапляє.
 */
import { AccessibilityInfo } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ActiveSetEditor } from "./ActiveSetEditor";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const ID = "ase";

function setup(props: { durationSec?: number } = {}) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  render(
    <ActiveSetEditor
      open
      onClose={onClose}
      exerciseName="Жим"
      onSubmit={onSubmit}
      testID={ID}
      {...props}
    />,
  );
  return { onSubmit, onClose };
}

describe("ActiveSetEditor: незарахований підхід", () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
  });

  it("60 кг × 0 повторень не зберігається, показує помилку біля повторень", () => {
    const { onSubmit, onClose } = setup();
    fireEvent.changeText(screen.getByTestId(`${ID}-weight-input`), "60");
    fireEvent.press(screen.getByTestId(`${ID}-save`));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId(`${ID}-reps-error`)).toBeTruthy();
  });

  it("60 кг × 8 зберігається", () => {
    const { onSubmit } = setup();
    fireEvent.changeText(screen.getByTestId(`${ID}-weight-input`), "60");
    fireEvent.changeText(screen.getByTestId(`${ID}-reps-input`), "8");
    fireEvent.press(screen.getByTestId(`${ID}-save`));
    expect(onSubmit).toHaveBeenCalledWith({ weightKg: 60, reps: 8 });
  });

  it("вага × 0 зберігається, коли на вправі є час (утримання зі Strong)", () => {
    const { onSubmit } = setup({ durationSec: 45 });
    fireEvent.changeText(screen.getByTestId(`${ID}-weight-input`), "20");
    fireEvent.press(screen.getByTestId(`${ID}-save`));
    expect(onSubmit).toHaveBeenCalledWith({ weightKg: 20, reps: 0 });
  });
});
