// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonBudgetBar,
  SkeletonCardBlock,
  SkeletonHabitRow,
  SkeletonMealCard,
  SkeletonText,
  SkeletonTransactionRow,
  SkeletonWorkoutSet,
} from "./Skeleton";

describe("Skeleton", () => {
  it.each([
    ["rect", "rounded-2xl"],
    ["text", "rounded-xl h-3"],
    ["avatar", "rounded-full aspect-square"],
    ["card", "rounded-3xl min-h-32"],
  ] as const)("renders the %s variant", (variant, expectedClass) => {
    const { container } = render(
      <Skeleton variant={variant} className="custom-size" />,
    );

    const skeleton = container.firstElementChild as HTMLElement;
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton.className).toContain(expectedClass);
    expect(skeleton.className).toContain("custom-size");
    expect(skeleton.className).toContain("motion-safe:animate-pulse");
  });

  it("renders shimmer overlays and forwards styles", () => {
    const { container } = render(
      <Skeleton shimmer style={{ animationDelay: "120ms" }} />,
    );

    const skeleton = container.firstElementChild as HTMLElement;
    expect(skeleton.className).toContain("relative overflow-hidden");
    expect(skeleton.style.animationDelay).toBe("120ms");
    expect(skeleton.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(skeleton.firstElementChild?.className).toContain(
      "motion-safe:animate-shimmer",
    );
  });

  it("renders avatar, card and multi-line text helpers", () => {
    const { container } = render(
      <>
        <SkeletonAvatar shimmer className="avatar-extra" />
        <SkeletonCardBlock shimmer className="card-extra" />
        <SkeletonText lines={3} gap="gap-3" className="copy-lines" />
      </>,
    );

    expect(container.querySelector(".avatar-extra")).toBeInTheDocument();
    expect(container.querySelector(".card-extra")).toBeInTheDocument();
    const multiLine = container.querySelector(".copy-lines") as HTMLElement;
    expect(multiLine.className).toContain("gap-3");
    expect(multiLine.children).toHaveLength(3);
    expect(multiLine.lastElementChild?.className).toContain("w-8/12");
  });

  it("renders shape-aware module placeholders", () => {
    render(
      <div>
        <SkeletonTransactionRow module="finyk" shimmer className="tx-row" />
        <SkeletonBudgetBar module="nutrition" shimmer className="budget" />
        <SkeletonHabitRow module="routine" className="habit" />
        <SkeletonWorkoutSet module="fizruk" className="set" />
        <SkeletonMealCard module="nutrition" className="meal" />
      </div>,
    );

    for (const className of ["tx-row", "budget", "habit", "set", "meal"]) {
      expect(document.querySelector(`.${className}`)).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
    expect(
      document.querySelector(".tx-row .bg-finyk\\/10"),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".budget .bg-nutrition\\/10"),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".habit .bg-routine\\/10"),
    ).toBeInTheDocument();
    expect(document.querySelector(".set .bg-fizruk\\/10")).toBeInTheDocument();
  });
});
