/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

const { toastSuccessMock, resetOnboardingStateMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  resetOnboardingStateMock: vi.fn(),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: toastSuccessMock, error: vi.fn() }),
}));

vi.mock("@sergeant/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sergeant/shared")>();
  return {
    ...actual,
    resetOnboardingState: resetOnboardingStateMock,
  };
});

vi.mock("@shared/lib/storage/storage", () => ({
  webKVStore: {},
  resolveLsStore: () => ({ kind: "durable-mirror" }),
  safeWriteLS: vi.fn(),
  safeReadStringLS: vi.fn(() => null),
  safeRemoveLS: vi.fn(),
}));

vi.mock("../onboarding/OnboardingWizard", () => ({
  OnboardingWizard: ({ onDone }: { onDone: () => void }) => (
    <div data-testid="onboarding-wizard">
      <button onClick={onDone}>Done</button>
    </div>
  ),
}));

vi.mock("@shared/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onCancel,
    confirmLabel,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>Скасувати</button>
      </div>
    ) : null,
}));

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: () => <span />,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { GeneralSection } from "./GeneralSection";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GeneralSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // location.assign is not configurable in jsdom — delete and replace.
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => cleanup());

  it("renders the tour launch button", () => {
    render(<GeneralSection user={null} />);
    expect(
      screen.getByRole("button", { name: /Переглянути вступну екскурсію/i }),
    ).toBeInTheDocument();
  });

  it("renders the reset button", () => {
    render(<GeneralSection user={null} />);
    expect(
      screen.getByRole("button", { name: /Почати знайомство з початку/i }),
    ).toBeInTheDocument();
  });

  it("opens the OnboardingWizard when launch button is clicked", () => {
    render(<GeneralSection user={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Переглянути вступну екскурсію/i }),
    );
    expect(screen.getByTestId("onboarding-wizard")).toBeInTheDocument();
  });

  it("closes the OnboardingWizard when onDone fires", () => {
    render(<GeneralSection user={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Переглянути вступну екскурсію/i }),
    );
    expect(screen.getByTestId("onboarding-wizard")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
  });

  it("shows confirm dialog when reset button is clicked", () => {
    render(<GeneralSection user={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Почати знайомство з початку/i }),
    );
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("calls resetOnboardingState and shows toast on confirm", () => {
    render(<GeneralSection user={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Почати знайомство з початку/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Почати з початку/i }));
    expect(resetOnboardingStateMock).toHaveBeenCalledTimes(2);
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  });

  it("closes the confirm dialog on cancel without resetting", () => {
    render(<GeneralSection user={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Почати знайомство з початку/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(resetOnboardingStateMock).not.toHaveBeenCalled();
  });
});
