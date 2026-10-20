// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@shared/hooks/useToast";
import { FizrukData } from "@sergeant/fizruk-domain";

vi.mock("../../../core/auth/useLocalUserId", () => ({
  useLocalUserId: () => "test-user",
}));

import { StrongImportReview } from "./StrongImportReview";

const fixture = readFileSync(
  "src/modules/fizruk/lib/__fixtures__/strong-export.csv",
  "utf8",
);

function makeExercise(id: string, englishName: string) {
  return {
    id,
    name: { uk: englishName, en: englishName },
    muscles: { primary: [], secondary: [] },
    equipment: [],
  } as unknown as FizrukData.RawExerciseDef;
}

function renderReview(open = true) {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <StrongImportReview
        open={open}
        onClose={onClose}
        exercises={[makeExercise("walking", "Walking")]}
      />
    </ToastProvider>,
  );
  return onClose;
}

describe("StrongImportReview", () => {
  it("hides the dialog when closed", () => {
    renderReview(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows parser errors and prevents an invalid import", async () => {
    renderReview();
    const csv = fixture.replace("Workout Name", "Title");
    const file = new File([csv], "workouts.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    await userEvent.upload(screen.getByLabelText("Файл тренувань"), file);
    expect(
      await screen.findByText(/Strong workout CSV header is unknown/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Записати імпорт" }),
    ).toBeDisabled();
  });

  it("lets the user select a match and commits only retained items", async () => {
    const onClose = renderReview();
    const file = new File([fixture], "strong-export.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: async () => fixture });
    await userEvent.upload(screen.getByLabelText("Файл тренувань"), file);
    await screen.findByText("Потребують звіряння");
    fireEvent.click(screen.getByRole("button", { name: "lb" }));
    expect(screen.getByRole("button", { name: "lb" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.change(screen.getAllByRole("combobox")[0]!, {
      target: { value: "walking" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Записати імпорт" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Записати імпорт" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
