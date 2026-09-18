import { render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { Skeleton, SkeletonText } from "./Skeleton";

describe("Skeleton", () => {
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

  it("renders with the base block classes", () => {
    const { toJSON } = render(<Skeleton />);
    const tree = toJSON() as { props: { className: string } } | null;
    expect(tree).not.toBeNull();
    expect(tree!.props.className).toContain("bg-cream-200");
    expect(tree!.props.className).toContain("rounded-2xl");
  });

  it("appends a caller-supplied className", () => {
    const { toJSON } = render(<Skeleton className="h-8 w-40" />);
    const tree = toJSON() as { props: { className: string } } | null;
    expect(tree!.props.className).toContain("h-8");
    expect(tree!.props.className).toContain("w-40");
  });

  it("hides itself from assistive tech", () => {
    const { toJSON } = render(<Skeleton />);
    const tree = toJSON() as {
      props: {
        accessibilityElementsHidden: boolean;
        importantForAccessibility: string;
      };
    } | null;
    expect(tree!.props.accessibilityElementsHidden).toBe(true);
    expect(tree!.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});

describe("SkeletonText", () => {
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

  it("uses the compact text-line classes by default", () => {
    const { toJSON } = render(<SkeletonText />);
    const tree = toJSON() as { props: { className: string } } | null;
    expect(tree!.props.className).toContain("rounded-lg");
    expect(tree!.props.className).toContain("h-3");
  });

  it("forwards className", () => {
    const { toJSON } = render(<SkeletonText className="w-24" />);
    const tree = toJSON() as { props: { className: string } } | null;
    expect(tree!.props.className).toContain("w-24");
  });
});
