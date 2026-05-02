import { render } from "@testing-library/react-native";

import { InlineSkeleton, PageSkeleton } from "./PageSkeleton";

describe("PageSkeleton", () => {
  it("exposes a screen-level progressbar label", () => {
    const { getByTestId } = render(<PageSkeleton />);
    const skeleton = getByTestId("page-skeleton");

    expect(skeleton.props.accessibilityRole).toBe("progressbar");
    expect(skeleton.props.accessibilityLabel).toBe("Завантаження сторінки");
  });

  it("allows callers to name a specific loading state", () => {
    const { getByTestId } = render(
      <PageSkeleton
        testID="transactions-loading"
        accessibilityLabel="Завантаження транзакцій"
      />,
    );

    expect(getByTestId("transactions-loading").props.accessibilityLabel).toBe(
      "Завантаження транзакцій",
    );
  });
});

describe("InlineSkeleton", () => {
  it("exposes an inline progressbar label", () => {
    const { getByTestId } = render(<InlineSkeleton />);
    const skeleton = getByTestId("inline-skeleton");

    expect(skeleton.props.accessibilityRole).toBe("progressbar");
    expect(skeleton.props.accessibilityLabel).toBe("Завантаження секції");
  });
});
