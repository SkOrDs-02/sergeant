// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NoBankBanner } from "./NoBankBanner";

describe("NoBankBanner", () => {
  // The repo's vitest setup (`src/test/setup.ts`) does not auto-cleanup
  // RTL renders, so each test mounts into the same JSDOM document.
  // Without an explicit cleanup the second `render()` finds duplicate
  // buttons by role+name. Call `cleanup` between tests in this file.
  afterEach(cleanup);

  it("renders the headline and explainer copy", () => {
    render(<NoBankBanner onConnect={() => {}} onContinueManually={() => {}} />);
    expect(screen.getByText("Без банку?")).toBeInTheDocument();
    // Explainer copy is split across whitespace; match with a fragment.
    expect(screen.getByText(/Записуй витрати вручну/i)).toBeInTheDocument();
  });

  it("invokes onConnect when «Підключити Monobank» is clicked", () => {
    const onConnect = vi.fn();
    render(
      <NoBankBanner onConnect={onConnect} onContinueManually={() => {}} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Підключити Monobank" }),
    );
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("invokes onContinueManually when «Без банку — продовжити» is clicked", () => {
    const onContinueManually = vi.fn();
    render(
      <NoBankBanner
        onConnect={() => {}}
        onContinueManually={onContinueManually}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Без банку — продовжити" }),
    );
    expect(onContinueManually).toHaveBeenCalledTimes(1);
  });

  it("exposes the banner as an accessible region", () => {
    render(<NoBankBanner onConnect={() => {}} onContinueManually={() => {}} />);
    expect(
      screen.getByRole("region", { name: "Підключення Monobank" }),
    ).toBeInTheDocument();
  });
});
