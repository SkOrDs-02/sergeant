import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { Banner } from "./Banner";

describe("Banner", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <Banner>
        <Text>Sync paused — will retry shortly.</Text>
      </Banner>,
    );
    expect(getByText("Sync paused — will retry shortly.")).toBeTruthy();
  });

  it("defaults to the `info` variant", () => {
    const { UNSAFE_getAllByType } = render(
      <Banner>
        <Text>info</Text>
      </Banner>,
    );
    const wrapper = UNSAFE_getAllByType(View)[0];
    expect(wrapper.props.className).toContain("bg-cream-100");
    expect(wrapper.props.className).toContain("border-cream-300");
  });

  it("applies per-variant classes for success / warning / danger", () => {
    const variants = [
      {
        variant: "success" as const,
        bg: "bg-emerald-50",
        border: "border-emerald-300",
      },
      {
        variant: "warning" as const,
        bg: "bg-amber-50",
        border: "border-amber-300",
      },
      { variant: "danger" as const, bg: "bg-red-50", border: "border-red-300" },
    ];

    for (const { variant, bg, border } of variants) {
      const { UNSAFE_getAllByType } = render(
        <Banner variant={variant}>
          <Text>{variant}</Text>
        </Banner>,
      );
      const wrapper = UNSAFE_getAllByType(View)[0];
      expect(wrapper.props.className).toContain(bg);
      expect(wrapper.props.className).toContain(border);
    }
  });

  it("sets the `alert` accessibility role", () => {
    const { UNSAFE_getAllByType } = render(
      <Banner>
        <Text>a11y</Text>
      </Banner>,
    );
    const wrapper = UNSAFE_getAllByType(View)[0];
    expect(wrapper.props.accessibilityRole).toBe("alert");
  });

  it("merges a caller-supplied className last so it can override", () => {
    const { UNSAFE_getAllByType } = render(
      <Banner className="mt-4 custom-banner">
        <Text>extra</Text>
      </Banner>,
    );
    const wrapper = UNSAFE_getAllByType(View)[0];
    expect(wrapper.props.className).toContain("mt-4");
    expect(wrapper.props.className).toContain("custom-banner");
  });
});
