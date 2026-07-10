/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { IOSInstallBanner } from "./IOSInstallBanner";

describe("IOSInstallBanner — shell smoke", () => {
  afterEach(() => cleanup());

  it("renders the install instructions and a dismiss control", () => {
    render(<IOSInstallBanner onDismiss={vi.fn()} />);
    expect(screen.getByText("Додай на головний екран")).toBeInTheDocument();
    expect(screen.getByText(/Поділитися/)).toBeInTheDocument();
    expect(screen.getByText(/На початковий екран/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Закрити" })).toBeInTheDocument();
  });

  it("calls onDismiss when the close button is pressed", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<IOSInstallBanner onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Закрити" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
