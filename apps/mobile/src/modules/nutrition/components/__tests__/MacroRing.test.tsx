import { render } from "@testing-library/react-native";

import { MacroRing } from "../MacroRing";

describe("MacroRing", () => {
  it("renders value, label, and target suffix when target is positive", () => {
    const { getByText } = render(
      <MacroRing value={75} target={100} label="Білки" unit="г" />,
    );

    expect(getByText("75")).toBeTruthy();
    expect(getByText("Білки")).toBeTruthy();
    expect(getByText("/ 100г")).toBeTruthy();
  });

  it("omits the target suffix when target is zero", () => {
    const { getByText, queryByText } = render(
      <MacroRing value={12.4} target={0} label="Ккал" />,
    );

    expect(getByText("12")).toBeTruthy();
    expect(getByText("Ккал")).toBeTruthy();
    expect(queryByText("/ 0")).toBeNull();
  });
});
