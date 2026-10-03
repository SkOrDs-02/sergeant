/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WelcomeModulePicker } from "./WelcomeModulePicker";
import { messages } from "@shared/i18n/uk";
import { MODULE_LABELS } from "@shared/lib/modules/moduleLabels";

describe("WelcomeModulePicker — preset grid shell", () => {
  afterEach(() => cleanup());

  it("defaults to all modules picked and enables the primary CTA", () => {
    render(<WelcomeModulePicker onComplete={vi.fn()} onOpenAuth={vi.fn()} />);
    const copy = messages.welcomeModulePicker;
    expect(
      screen.getByRole("heading", { name: copy.heading }),
    ).toBeInTheDocument();
    for (const label of Object.values(MODULE_LABELS)) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    expect(screen.getByRole("button", { name: copy.cta })).toBeEnabled();
  });

  it("disables the CTA when every module is deselected", async () => {
    const user = userEvent.setup();
    render(<WelcomeModulePicker onComplete={vi.fn()} onOpenAuth={vi.fn()} />);
    const copy = messages.welcomeModulePicker;
    for (const label of Object.values(MODULE_LABELS)) {
      await user.click(screen.getByRole("button", { name: label }));
    }
    expect(screen.getByRole("button", { name: copy.cta })).toBeDisabled();
    expect(screen.getByText(copy.emptyHint)).toBeInTheDocument();
  });

  it("fires onComplete with the remaining picks", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <WelcomeModulePicker onComplete={onComplete} onOpenAuth={vi.fn()} />,
    );
    await user.click(
      screen.getByRole("button", { name: MODULE_LABELS.routine }),
    );
    await user.click(
      screen.getByRole("button", { name: MODULE_LABELS.nutrition }),
    );
    await user.click(
      screen.getByRole("button", { name: messages.welcomeModulePicker.cta }),
    );
    expect(onComplete).toHaveBeenCalledWith(["finyk", "fizruk"]);
  });

  it("обрана плитка: контур `-edge` модуля (A4 аудиту контрасту), необрана — тиха межа", async () => {
    // `border-{m}/60` давав 2.67-2.88:1 проти столу; стан вибору потребує ≥3:1.
    const user = userEvent.setup();
    render(<WelcomeModulePicker onComplete={vi.fn()} onOpenAuth={vi.fn()} />);
    const finyk = screen.getByRole("button", { name: MODULE_LABELS.finyk });
    expect(finyk.className).toContain("border-finyk-edge");
    expect(finyk.className).not.toContain("border-finyk/60");
    await user.click(finyk);
    expect(finyk).toHaveAttribute("aria-pressed", "false");
    expect(finyk.className).toContain("border-line");
    expect(finyk.className).not.toContain("border-finyk-edge");
  });

  it("routes returning users via onOpenAuth", async () => {
    const user = userEvent.setup();
    const onOpenAuth = vi.fn();
    render(
      <WelcomeModulePicker onComplete={vi.fn()} onOpenAuth={onOpenAuth} />,
    );
    await user.click(
      screen.getByRole("button", {
        name: messages.welcomeModulePicker.haveAccount,
      }),
    );
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
  });
});
