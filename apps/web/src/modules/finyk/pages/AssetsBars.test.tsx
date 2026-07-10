// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AssetsLiabilitiesBar,
  QuickActionButton,
  SectionBar,
} from "./AssetsBars";

describe("AssetsBars exports", () => {
  describe("AssetsLiabilitiesBar", () => {
    it("returns null when total is zero", () => {
      const { container } = render(
        <AssetsLiabilitiesBar assets={0} liabilities={0} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders split bar with aria summary", () => {
      render(<AssetsLiabilitiesBar assets={7000} liabilities={3000} />);
      expect(
        screen.getByRole("img", { name: /Активи 70% · Пасиви 30%/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("Активи 70%")).toBeInTheDocument();
    });
  });

  describe("QuickActionButton", () => {
    it("invokes onClick when tapped", () => {
      const onClick = vi.fn();
      render(
        <QuickActionButton
          iconName="plus"
          label="Актив"
          onClick={onClick}
          tone="success"
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /\+ Актив/ }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("SectionBar", () => {
    it("shows collapse label when open and toggles on click", () => {
      const onToggle = vi.fn();
      render(
        <SectionBar
          title="Підписки"
          iconName="bell"
          iconTone="finyk"
          summary="3 активні"
          open
          onToggle={onToggle}
        />,
      );
      expect(screen.getByText("Згорнути")).toBeInTheDocument();
      expect(screen.getByText("3 активні")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { expanded: true }));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("shows expand label when collapsed", () => {
      render(
        <SectionBar
          title="Борги"
          iconName="credit-card"
          open={false}
          onToggle={vi.fn()}
        />,
      );
      expect(screen.getByText("Розкласти")).toBeInTheDocument();
    });
  });
});
