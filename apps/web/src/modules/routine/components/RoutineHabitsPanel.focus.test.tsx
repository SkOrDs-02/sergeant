/** @vitest-environment jsdom */
/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Регресія ux-08: кнопка порожнього стану «Створити звичку» розмонтовується,
 * щойно зʼявляється перша звичка, тож `useDialogFocusTrap` не має куди
 * повернути фокус після закриття аркуша й лишав його на `<body>`. Запасна
 * ціль: заголовок «Активні звички».
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
import { defaultRoutineState } from "@sergeant/routine-domain";
import { ToastProvider } from "@shared/hooks/useToast";
import { __resetDialogInertForTests } from "@shared/hooks/useDialogFocusTrap";
import { messages } from "@shared/i18n/uk";
import type { RoutineState } from "../lib/types";

vi.mock("@shared/lib/storage/storage", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/lib/storage/storage")
  >("@shared/lib/storage/storage");
  return {
    ...actual,
    safeWriteLS: () => true,
    safeReadLS: () => null,
    safeReadStringLS: () => null,
  };
});
vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticSuccess: vi.fn(),
  hapticTap: vi.fn(),
}));

import { RoutineHabitsPanel } from "./RoutineHabitsPanel";

function Harness() {
  const [routine, setRoutine] = useState<RoutineState>(
    defaultRoutineState() as RoutineState,
  );
  return (
    <ToastProvider>
      <RoutineHabitsPanel routine={routine} setRoutine={setRoutine} />
    </ToastProvider>
  );
}

afterEach(() => {
  cleanup();
  __resetDialogInertForTests();
});

describe("RoutineHabitsPanel: фокус після створення першої звички", () => {
  it("повертає фокус на заголовок списку, а не на <body>", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", {
      name: messages.routine.createHabit,
    });
    trigger.focus();
    fireEvent.click(trigger);

    const name = await screen.findByLabelText(/Назва/i);
    fireEvent.change(name, { target: { value: "Вода" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати звичку" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Тригер зник разом із порожнім станом.
    expect(trigger.isConnected).toBe(false);
    const heading = screen.getByRole("heading", { name: "Активні звички" });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(heading);
  });
});
