/** @vitest-environment jsdom */
/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Регресія ux-08: аркуш готовності відкривається сам, без жесту, тож
 * тригера для повернення фокуса нема. Після «Пропустити» фокус мусить піти
 * на «+ Вправа» сесії, а не на `<body>`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { __resetDialogInertForTests } from "@shared/hooks/useDialogFocusTrap";
import { focusFallbackProps } from "@shared/lib/ui/focusFallback";
import { SESSION_FOCUS_FALLBACK } from "../session/focusFallback";
import { ReadinessSheet } from "./ReadinessSheet";

vi.mock("@shared/lib/adapters/haptic", () => ({ hapticTap: vi.fn() }));

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" {...focusFallbackProps(SESSION_FOCUS_FALLBACK)}>
        + Вправа
      </button>
      <ReadinessSheet
        open={open}
        onSubmit={() => setOpen(false)}
        onSkip={() => setOpen(false)}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  __resetDialogInertForTests();
});

describe("ReadinessSheet: фокус після закриття", () => {
  it("«Пропустити» віддає фокус на «+ Вправа», а не на <body>", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Пропустити" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "+ Вправа" }),
    );
  });

  it("«Готово» теж", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "+ Вправа" }),
    );
  });
});
