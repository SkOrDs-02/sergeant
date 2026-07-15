// @vitest-environment jsdom
//
// PR-A v2-polish-redesign — SettingsPrimitives icon prop + glass surface.
// Covers: SettingsGroup renders the design-system <Icon>; module badge applies
// the correct scoped surface class.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
  ConfirmModal,
  SectionSkeleton,
} from "./SettingsPrimitives";

// Icon is a thin wrapper; stub it so tests don't need an SVG sprite.
vi.mock("@shared/components/ui/Icon", () => ({
  Icon: ({ name, size }: { name: string; size?: number }) => (
    <span data-testid="icon" data-name={name} data-size={size} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SettingsGroup — icon prop", () => {
  it("renders an <Icon> when `icon` is provided", () => {
    render(
      <SettingsGroup title="Профіль" icon="user">
        <div>child</div>
      </SettingsGroup>,
    );

    const icons = screen.getAllByTestId("icon");
    // First icon belongs to the icon badge; second is the ChevronIcon.
    const badgeIcon = icons.find((el) => el.dataset["name"] === "user");
    expect(badgeIcon).toBeTruthy();
    expect(badgeIcon?.dataset["size"]).toBe("18");
  });

  it("applies module soft-surface class on the icon badge span", () => {
    render(
      <SettingsGroup title="Фінанси" icon="wallet" module="finyk">
        <div>child</div>
      </SettingsGroup>,
    );

    // The badge span wrapping the Icon should carry the finyk soft bg class.
    const badge = document.querySelector("span.bg-finyk-soft");
    expect(badge).toBeTruthy();
  });

  it("uses neutral surface class when no module is given", () => {
    render(
      <SettingsGroup title="Загальне" icon="settings">
        <div>child</div>
      </SettingsGroup>,
    );

    const badge = document.querySelector("span.bg-surface-soft-glass");
    expect(badge).toBeTruthy();
  });

  it("expands children on button click", () => {
    render(
      <SettingsGroup title="Тест" icon="info">
        <p>прихований контент</p>
      </SettingsGroup>,
    );

    const btn = screen.getByRole("button", { name: /Тест/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});

describe("SettingsSubGroup", () => {
  it("expands on click", () => {
    render(
      <SettingsSubGroup title="Деталі">
        <p>вміст</p>
      </SettingsSubGroup>,
    );

    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(screen.getByText("вміст")).toBeTruthy();
  });
});

describe("ToggleRow", () => {
  it("calls onChange when the label is clicked", () => {
    const onChange = vi.fn();
    render(
      <ToggleRow label="Сповіщення" checked={false} onChange={onChange} />,
    );

    // Switch renders an input[type=checkbox] inside the label.
    const input = document.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    if (!input) throw new Error("Switch input not found");
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalled();
  });
});

describe("ConfirmModal", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmModal
        open={false}
        title="Видалити?"
        confirmLabel="Так"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog and calls onConfirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open={true}
        title="Видалити акаунт?"
        confirmLabel="Підтвердити"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByText("Підтвердити"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel on backdrop click", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open={true}
        title="Тест"
        confirmLabel="ОК"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    // Backdrop button is the sibling of the dialog panel.
    const backdrop = document.querySelector(
      "button.absolute.inset-0",
    ) as HTMLButtonElement | null;
    if (!backdrop) throw new Error("backdrop button not found");
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("SectionSkeleton — Suspense fallback (0017 Sprint 1.1)", () => {
  it("renders with default minHeight 72px and aria-busy", () => {
    render(<SectionSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.style.minHeight).toBe("72px");
  });

  it("honours a custom minH for tall sections that should not cause CLS", () => {
    render(<SectionSkeleton minH={240} />);
    const status = screen.getByRole("status");
    expect(status.style.minHeight).toBe("240px");
  });

  it("uses the default localized aria-label when none provided", () => {
    render(<SectionSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("Завантажую розділ");
  });

  it("uses a caller-provided aria-label when given (e.g. section-specific copy)", () => {
    render(<SectionSkeleton ariaLabel="Завантажую розділ Finyk" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("Завантажую розділ Finyk");
  });
});
