// @vitest-environment jsdom
/**
 * Branch coverage for AssetsBars — stacked bar, quick actions, section headers.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  AssetsLiabilitiesBar,
  QuickActionButton,
  SectionBar,
} from "./AssetsBars";

afterEach(() => cleanup());

describe("AssetsBars (branches)", () => {
  describe("AssetsLiabilitiesBar", () => {
    it("returns null when total is zero", () => {
      const { container } = render(
        <AssetsLiabilitiesBar assets={0} liabilities={0} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders percentage bar when assets and liabilities are positive", () => {
      render(<AssetsLiabilitiesBar assets={7000} liabilities={3000} />);
      expect(screen.getByText(/Активи 70%/)).toBeInTheDocument();
      expect(screen.getByText(/Пасиви 30%/)).toBeInTheDocument();
    });

    it("exposes accessible summary for screen readers", () => {
      render(<AssetsLiabilitiesBar assets={1000} liabilities={500} />);
      expect(
        screen.getByText(/Співвідношення активів і пасивів/),
      ).toBeInTheDocument();
    });
  });

  describe("QuickActionButton", () => {
    it("invokes onClick when pressed", () => {
      const onClick = vi.fn();
      render(
        <QuickActionButton
          iconName="plus"
          label="Борг"
          onClick={onClick}
          tone="danger"
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /\+ Борг/ }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("defaults to finyk tone styling", () => {
      const { container } = render(
        <QuickActionButton iconName="wallet" label="Актив" onClick={vi.fn()} />,
      );
      expect(container.querySelector(".text-finyk-strong")).not.toBeNull();
    });
  });

  describe("SectionBar", () => {
    it("shows 'Розкласти' when section is closed", () => {
      render(
        <SectionBar
          title="Підписки"
          iconName="repeat"
          open={false}
          onToggle={vi.fn()}
        />,
      );
      expect(screen.getByText("Розкласти")).toBeInTheDocument();
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("shows 'Згорнути' when section is open", () => {
      render(
        <SectionBar title="Активи" iconName="wallet" open onToggle={vi.fn()} />,
      );
      expect(screen.getByText("Згорнути")).toBeInTheDocument();
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });

    it("renders summary line when provided", () => {
      render(
        <SectionBar
          title="Пасиви"
          iconName="credit-card"
          summary="3 позиції"
          open={false}
          onToggle={vi.fn()}
        />,
      );
      expect(screen.getByText("3 позиції")).toBeInTheDocument();
    });

    it("calls onToggle when header is clicked", () => {
      const onToggle = vi.fn();
      render(
        <SectionBar
          title="Підписки"
          iconName="repeat"
          open={false}
          onToggle={onToggle}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });
});
