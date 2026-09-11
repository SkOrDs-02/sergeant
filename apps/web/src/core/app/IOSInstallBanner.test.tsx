/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { IOSInstallBanner } from "./IOSInstallBanner";

describe("IOSInstallBanner — shell smoke", () => {
  afterEach(() => cleanup());

  it("renders the install instructions and both dismiss controls", () => {
    render(<IOSInstallBanner onDismissForever={vi.fn()} onSnooze={vi.fn()} />);
    expect(screen.getByText("Додай на головний екран")).toBeInTheDocument();
    expect(screen.getByText(/Поділитися/)).toBeInTheDocument();
    expect(screen.getByText(/На початковий екран/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Уже встановлено або не нагадувати" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Закрити, нагадати пізніше" }),
    ).toBeInTheDocument();
  });

  // Founder-ux-review round 2 (O2): the two dismiss affordances now do
  // different things — the text link opts out forever, the icon-only "×"
  // only snoozes. They must call distinct callbacks, not the same one.
  it("the text link calls onDismissForever, NOT onSnooze", async () => {
    const user = userEvent.setup();
    const onDismissForever = vi.fn();
    const onSnooze = vi.fn();
    render(
      <IOSInstallBanner
        onDismissForever={onDismissForever}
        onSnooze={onSnooze}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Уже встановлено або не нагадувати" }),
    );
    expect(onDismissForever).toHaveBeenCalledTimes(1);
    expect(onSnooze).not.toHaveBeenCalled();
  });

  it("the icon '×' calls onSnooze, NOT onDismissForever", async () => {
    const user = userEvent.setup();
    const onDismissForever = vi.fn();
    const onSnooze = vi.fn();
    render(
      <IOSInstallBanner
        onDismissForever={onDismissForever}
        onSnooze={onSnooze}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Закрити, нагадати пізніше" }),
    );
    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(onDismissForever).not.toHaveBeenCalled();
  });
});
