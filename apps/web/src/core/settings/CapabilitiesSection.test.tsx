/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

import { CapabilitiesSection } from "./CapabilitiesSection";

function renderOpen() {
  render(<CapabilitiesSection />);
  // `SettingsGroup` renders collapsed; expand it so the two options mount.
  fireEvent.click(screen.getByRole("button", { name: /Можливості/ }));
}

describe("CapabilitiesSection", () => {
  afterEach(() => {
    cleanup();
    navigateMock.mockReset();
  });

  it("offers exactly the two capability catalogues", () => {
    renderOpen();

    expect(screen.getByTestId("open-app-capabilities")).toBeInTheDocument();
    expect(screen.getByTestId("open-assistant-catalogue")).toBeInTheDocument();
  });

  it("no longer offers the onboarding restart", () => {
    // Removed 2026-08-03: «Почати знайомство з початку» reset FTUX flags and
    // hard-redirected to /welcome from inside an otherwise read-only block.
    renderOpen();

    expect(screen.queryByText(/Почати знайомство/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/з початку/i)).not.toBeInTheDocument();
  });

  it("routes each option to its own catalogue", () => {
    renderOpen();

    fireEvent.click(screen.getByTestId("open-app-capabilities"));
    expect(navigateMock).toHaveBeenCalledWith("/capabilities");

    fireEvent.click(screen.getByTestId("open-assistant-catalogue"));
    expect(navigateMock).toHaveBeenCalledWith("/assistant");
  });
});
