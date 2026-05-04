/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { ToastProvider } from "@shared/hooks/useToast";
import type { RoutineState, Tag } from "../../lib/types";
import { TagsSection } from "./TagsSection";

// `routineStorage` writes to localStorage on every mutation; the test
// harness here cares only about the post-update `RoutineState` shape, so
// we silence persistence to keep tests deterministic across runs.
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

function makeRoutineWithTags(tags: Tag[]): RoutineState {
  return { ...defaultRoutineState(), tags };
}

function Harness({ initial }: { initial: RoutineState }) {
  const [routine, setRoutine] = useState(initial);
  const [tagDraft, setTagDraft] = useState("");
  return (
    <ToastProvider>
      <TagsSection
        routine={routine}
        setRoutine={setRoutine}
        tagDraft={tagDraft}
        setTagDraft={setTagDraft}
      />
    </ToastProvider>
  );
}

describe("TagsSection — useApiForm inline rename (Item #8 round-12)", () => {
  beforeEach(() => {
    // Reset localStorage between tests so persisted routine fragments
    // from one case don't bleed into the next.
    window.localStorage.clear();
  });

  afterEach(() => {
    // RTL автоматично НЕ викликає cleanup для vitest без `globals: true`
    // в config-і — без цього кілька рендерів накопичуються у спільному
    // DOM-tree і `findByLabelText` бачить дублікати з попередніх кейсів.
    cleanup();
  });

  it("commits rename on Enter (form submit) and closes the inline edit", async () => {
    const initial = makeRoutineWithTags([
      { id: "tag-1", name: "морк" },
      { id: "tag-2", name: "хобі" },
    ]);
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Змінити морк" }));

    const input = await screen.findByLabelText("Назва тега морк");
    fireEvent.change(input, { target: { value: "ранок" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("ранок")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Назва тега морк")).not.toBeInTheDocument();
  });

  it("commits rename on blur and closes the inline edit", async () => {
    const initial = makeRoutineWithTags([{ id: "tag-1", name: "морк" }]);
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Змінити морк" }));
    const input = await screen.findByLabelText("Назва тега морк");

    fireEvent.change(input, { target: { value: "обід" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText("обід")).toBeInTheDocument();
    });
  });

  it("zod schema rejects empty name → edit stays open with aria-invalid", async () => {
    const initial = makeRoutineWithTags([{ id: "tag-1", name: "морк" }]);
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Змінити морк" }));
    const input = await screen.findByLabelText("Назва тега морк");

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);

    // Edit-mode залишається відкритим, бо `.trim().min(1)` валить submit
    // (input усе ще in-DOM з поточним value), а тег не перейменовано —
    // `Змінити морк` button не з'являється, бо ми ще в edit-mode для нього.
    await waitFor(() => {
      expect(input).toHaveAttribute("aria-invalid", "true");
    });
    expect(input).toBeInTheDocument();
    // Aria-label усе ще використовує оригінальну назву "морк"; тобто routine
    // state не отримав updateTag-виклик з порожнім ім'ям.
    expect(screen.getByLabelText("Назва тега морк")).toBe(input);
  });

  it("Escape cancels inline edit without persisting changes", async () => {
    const initial = makeRoutineWithTags([{ id: "tag-1", name: "морк" }]);
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Змінити морк" }));
    const input = await screen.findByLabelText("Назва тега морк");

    fireEvent.change(input, { target: { value: "ВЕЧЕРЯ" } });
    fireEvent.keyDown(input, { key: "Escape" });

    // Cancel закриває редагування — оригінальна назва зберігається.
    await waitFor(() => {
      expect(
        screen.queryByLabelText("Назва тега морк"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("морк")).toBeInTheDocument();
    expect(screen.queryByText("ВЕЧЕРЯ")).not.toBeInTheDocument();
  });

  it("trims surrounding whitespace before persisting", async () => {
    const initial = makeRoutineWithTags([{ id: "tag-1", name: "морк" }]);
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Змінити морк" }));
    const input = await screen.findByLabelText("Назва тега морк");

    fireEvent.change(input, { target: { value: " обід " } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      // Тег рендериться з обрізаним ім'ям — не " обід ", а саме "обід";
      // `getByText` за замовчуванням нормалізує whitespace, тому
      // exact-match через `{ exact: true, normalizer }` не застосовуємо —
      // достатньо, що button-aria-label не містить навколишніх пробілів.
      expect(screen.getByText("обід")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Змінити обід" }),
    ).toBeInTheDocument();
  });
});
