// @vitest-environment jsdom
/**
 * Last validated: 2026-09-16
 * Status: Active
 *
 * Режим «Швидкий запис» у формі «Записати проведене» (рішення власника
 * 2026-09-16: усі способи ЗАПИСАТИ — в одній формі). Кейси перенесено з
 * колишнього самостійного `QuickLogSheet.test.tsx` майже дослівно: сама
 * поведінка полів не змінилась, змінився лише хост.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { LogPastWorkoutSheet } from "./LogPastWorkoutSheet";

function setup(
  overrides: Partial<{
    open: boolean;
    weightKg: number | null;
    onQuickLog: ((payload: unknown) => void) | undefined;
  }> = {},
) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const onQuickLog = "onQuickLog" in overrides ? overrides.onQuickLog : vi.fn();
  const view = render(
    <LogPastWorkoutSheet
      open={overrides.open ?? true}
      onClose={onClose}
      onSubmit={onSubmit}
      weightKg={overrides.weightKg ?? null}
      onQuickLog={onQuickLog as never}
    />,
  );
  return { onClose, onSubmit, onQuickLog, view };
}

function quickMode() {
  fireEvent.click(screen.getByRole("tab", { name: "Швидкий запис" }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LogPastWorkoutSheet — режим «Швидкий запис»", () => {
  it("без onQuickLog режиму в перемикачі немає", () => {
    setup({ onQuickLog: undefined });
    expect(
      screen.queryByRole("tab", { name: "Швидкий запис" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Заняття й час" })).toBeVisible();
  });

  it("дефолт — відтискання × 20, «Записати» одразу активна, часових полів немає", () => {
    const { onQuickLog, onSubmit } = setup();
    quickMode();
    expect(screen.getByRole("tab", { name: "Відтискання" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Дата й час — не для цього режиму: запис «щойно».
    expect(screen.queryByLabelText("Дата")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Початок")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Записати" }));
    expect(onQuickLog).toHaveBeenCalledWith({
      exerciseId: "pushup",
      reps: 20,
      kcalBurned: null,
    });
    // У консюмер ретро-запису нічого не пішло.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("пресет підставляє число, чіп міняє вправу", () => {
    const { onQuickLog } = setup();
    quickMode();
    fireEvent.click(screen.getByRole("tab", { name: "Присідання" }));
    fireEvent.click(screen.getByRole("button", { name: "50" }));
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));
    expect(onQuickLog).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseId: "squat_bodyweight", reps: 50 }),
    );
  });

  it("невалідне число блокує запис і називає межі", () => {
    const { onQuickLog } = setup();
    quickMode();
    const input = screen.getByLabelText("Повторень");
    fireEvent.change(input, { target: { value: "0" } });
    expect(screen.getByText("Введи число від 1 до 1000.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Записати" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));
    expect(onQuickLog).not.toHaveBeenCalled();
  });

  it("з вагою показує оцінку витрат і передає її в запис", () => {
    // MET відтискань 5, вага 80 кг, 20 повторень → 40 с:
    // 5 × 80 × 40 / 3600 ≈ 4.44 → 4 ккал.
    const { onQuickLog } = setup({ weightKg: 80 });
    quickMode();
    expect(screen.getByText(/Приблизно 4 ккал/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));
    expect(onQuickLog).toHaveBeenCalledWith(
      expect.objectContaining({ kcalBurned: 4 }),
    );
  });

  it("Enter у полі теж записує — кнопка не єдиний шлях", () => {
    const { onQuickLog } = setup();
    quickMode();
    const input = screen.getByLabelText("Повторень");
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.submit(input.closest("form")!);
    expect(onQuickLog).toHaveBeenCalledWith(
      expect.objectContaining({ reps: 15 }),
    );
  });

  it("повернення в «Заняття й час» вертає часові поля, а кнопку знову тримає його умова", () => {
    const { onQuickLog, onSubmit } = setup();
    quickMode();
    fireEvent.click(screen.getByRole("tab", { name: "Заняття й час" }));
    expect(screen.getByLabelText("Дата")).toBeInTheDocument();
    // Заняття не обрано — у цьому режимі «Записати» заблоковано.
    expect(screen.getByRole("button", { name: "Записати" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Записати" }));
    expect(onQuickLog).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
