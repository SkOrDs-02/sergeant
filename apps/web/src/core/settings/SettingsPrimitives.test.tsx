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

  // L-7 parity (адверсарне ревʼю 2026-08-08, знахідка №4): CollapsibleSection
  // закрив tab-trap для свого акордеона через `inert`, але SettingsGroup зі
  // спільним `grid-rows-[0fr] overflow-hidden`-патерном лишався непокритим —
  // Tab від згорнутого заголовка провалювався у приховані контроли.
  //
  // Round-trip в одному тесті: перевірка "після кліку inert знято" сама по
  // собі нічого не доводить, якщо inert ніколи не виставлявся взагалі —
  // ловимо регресію, лише зафіксувавши "виставлено" ДО кліку.
  it("ставить inert+aria-hidden на вміст, коли група монтується згорнутою (default), і знімає обидва при розгортанні", () => {
    render(
      <SettingsGroup title="Дашборд" icon="layout">
        <button type="button">Приховане поле</button>
      </SettingsGroup>,
    );
    const btn = screen.getByRole("button", { name: /Дашборд/ });
    const content = btn.nextElementSibling;
    expect(content).not.toBeNull();
    expect(content).toHaveAttribute("inert");
    expect(content).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(btn);
    expect(content).not.toHaveAttribute("inert");
    expect(content).not.toHaveAttribute("aria-hidden");
  });

  it("не ставить inert/aria-hidden, коли група монтується розгорнутою, і ставить обидва при згортанні", () => {
    render(
      <SettingsGroup title="Профіль" icon="user" defaultOpen>
        <button type="button">Видиме поле</button>
      </SettingsGroup>,
    );
    const btn = screen.getByRole("button", { name: /Профіль/ });
    const content = btn.nextElementSibling;
    expect(content).not.toBeNull();
    expect(content).not.toHaveAttribute("inert");
    expect(content).not.toHaveAttribute("aria-hidden");

    fireEvent.click(btn);
    expect(content).toHaveAttribute("inert");
    expect(content).toHaveAttribute("aria-hidden", "true");
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

  // V-2: наживо на /settings усі 8 кнопок другого рівня мали
  // aria-expanded === null (перший рівень, SettingsGroup, — коректно).
  // Скрінрідер не міг оголосити стан розкриття другорівневих акордеонів.
  it("виставляє aria-expanded і синхронізує його зі станом розкриття", () => {
    render(
      <SettingsSubGroup title="Вигляд">
        <p>вміст</p>
      </SettingsSubGroup>,
    );

    const btn = screen.getByRole("button", { name: /Вигляд/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  // V-3 (переглянуто після адверсарного ревʼю 2026-08-08, знахідка №1/№3):
  // "41px" було зафіксовано на fine-pointer, де floor навмисно не діє.
  // Під pointer:coarse звичайний `<button>` без `data-compact` уже отримує
  // 44×44 від глобального safety-net (`apps/web/src/styles/mobile.css`),
  // незалежно від класу `touch-target` — клас був но-опом і прибраний.
  // Пін на рядок класу нічого не міряв і видалений разом із класом; єдиний
  // реальний enforcement 44px-floor під pointer:coarse — Playwright-аудит
  // `apps/web/tests/mobile/mobile-ui-audit.spec.ts` (root AGENTS.md §
  // Touch targets), який ця зміна не займає.

  // L-7 parity (та сама знахідка №4, що й для SettingsGroup вище): другий
  // рівень акордеона мав ідентичний непокритий tab-trap.
  it("ставить inert+aria-hidden на вміст, коли підгрупа монтується згорнутою (default), і знімає обидва при розгортанні", () => {
    render(
      <SettingsSubGroup title="Розділи на головній">
        <button type="button">Приховане поле</button>
      </SettingsSubGroup>,
    );
    const btn = screen.getByRole("button", {
      name: /Розділи на головній/,
    });
    const content = btn.nextElementSibling;
    expect(content).not.toBeNull();
    expect(content).toHaveAttribute("inert");
    expect(content).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(btn);
    expect(content).not.toHaveAttribute("inert");
    expect(content).not.toHaveAttribute("aria-hidden");
  });

  it("не ставить inert/aria-hidden, коли підгрупа монтується розгорнутою, і ставить обидва при згортанні", () => {
    render(
      <SettingsSubGroup title="Деталі" defaultOpen>
        <button type="button">Видиме поле</button>
      </SettingsSubGroup>,
    );
    const btn = screen.getByRole("button", { name: /Деталі/ });
    const content = btn.nextElementSibling;
    expect(content).not.toBeNull();
    expect(content).not.toHaveAttribute("inert");
    expect(content).not.toHaveAttribute("aria-hidden");

    fireEvent.click(btn);
    expect(content).toHaveAttribute("inert");
    expect(content).toHaveAttribute("aria-hidden", "true");
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
