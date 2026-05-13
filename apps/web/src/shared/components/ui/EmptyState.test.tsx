/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EmptyState, ModuleEmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { Button } from "./Button";

afterEach(cleanup);

/**
 * A11y-контракт для `<EmptyState>` (+ обгортки `<ModuleEmptyState>`).
 * Перевіряємо саме observable-поведінку, важливу для screen-reader-ів,
 * — не «який клас на якому div». Класи перевіряємо лише там, де це
 * прямо стосується Hard Rule #14 (`focus-visible:ring-*`).
 */
describe("EmptyState — a11y", () => {
  it("renders title + description у live-region з role='status' / aria-live='polite' / aria-atomic", () => {
    const { container, getByText } = render(
      <EmptyState
        title="Поки немає шаблонів"
        description="Створи свій перший — кнопка вище."
      />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.getAttribute("aria-live")).toBe("polite");
    expect(status!.getAttribute("aria-atomic")).toBe("true");
    // title + description видимі і живуть всередині live-region.
    expect(status!.contains(getByText("Поки немає шаблонів"))).toBe(true);
    expect(
      status!.contains(getByText("Створи свій перший — кнопка вище.")),
    ).toBe(true);
  });

  it("ariaLive='off' вимикає озвучку (для empty-state-ів на initial page load)", () => {
    const { container } = render(
      <EmptyState title="Поки порожньо" ariaLive="off" />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.getAttribute("aria-live")).toBe("off");
  });

  it("icon-обгортка має aria-hidden='true' — декоративна графіка не дублюється у SR", () => {
    const { container } = render(
      <EmptyState icon={<Icon name="plus" />} title="Список звичок порожній" />,
    );
    // Шукаємо саме wrapper-div, який тримає іконку (всередині нього — <svg>).
    const iconWrapper = container.querySelector(
      '[role="status"] > [aria-hidden="true"]',
    );
    expect(iconWrapper).not.toBeNull();
    expect(iconWrapper!.querySelector("svg")).not.toBeNull();
  });

  it("illustration-обгортка має aria-hidden='true' (тіж декоративний дублікат)", () => {
    const { container } = render(
      <EmptyState
        illustration={
          <svg width={120} height={120} aria-hidden="true">
            <rect width="120" height="120" />
          </svg>
        }
        title="Жодної транзакції"
      />,
    );
    const illustrationWrapper = container.querySelector(
      '[role="status"] > [aria-hidden="true"]',
    );
    expect(illustrationWrapper).not.toBeNull();
    expect(illustrationWrapper!.querySelector("svg")).not.toBeNull();
  });

  it("action-кнопка рендериться без autofocus — фокус не перехоплюється на mount", () => {
    const { getByRole } = render(
      <EmptyState
        title="Список порожній"
        action={
          <Button variant="primary" size="md">
            Створити
          </Button>
        }
      />,
    );
    const button = getByRole("button", { name: "Створити" });
    // jsdom autofocuses тільки коли є атрибут — переконуємось, що його нема.
    expect(button.hasAttribute("autofocus")).toBe(false);
    expect(document.activeElement).not.toBe(button);
  });

  it("action-кнопка через <Button> зберігає focus-visible:ring (Hard Rule #14)", () => {
    const { getByRole } = render(
      <EmptyState
        title="Список порожній"
        action={
          <Button variant="primary" size="md">
            Створити
          </Button>
        }
      />,
    );
    const button = getByRole("button", { name: "Створити" });
    // Перевіряємо саме focus-visible-токени, а не focus: (Hard Rule #14).
    expect(button.className).toMatch(/focus-visible:ring-/);
    expect(button.className).not.toMatch(/(^|\s)focus:ring-/);
  });

  it("compact-варіант не вимикає live-region (поведінка ідентична default)", () => {
    const { container } = render(
      <EmptyState
        compact
        title="Нічого не знайдено"
        description="Спробуй інший запит."
      />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status!.getAttribute("aria-live")).toBe("polite");
  });

  it("hint живе у `text-subtle`-токені (не raw text-gray-*)", () => {
    const { getByText } = render(
      <EmptyState
        title="Готовий до першої цілі?"
        hint="Порада: підключи Monobank — імпорт автоматично."
      />,
    );
    const hint = getByText("Порада: підключи Monobank — імпорт автоматично.");
    expect(hint.className).toContain("text-subtle");
    expect(hint.className).not.toMatch(/text-gray-/);
  });
});

describe("ModuleEmptyState — dismiss button a11y", () => {
  it("dismiss-кнопка має aria-label і focus-visible:ring (Hard Rule #14)", () => {
    const { getByRole } = render(
      <ModuleEmptyState module="finyk" dismissible onDismiss={() => {}} />,
    );
    const closeBtn = getByRole("button", { name: "Закрити" });
    expect(closeBtn.className).toMatch(/focus-visible:ring-/);
    expect(closeBtn.className).toContain("focus:outline-none");
  });

  it("без dismissible-prop dismiss-кнопка не рендериться", () => {
    const { queryByRole } = render(<ModuleEmptyState module="finyk" />);
    expect(queryByRole("button", { name: "Закрити" })).toBeNull();
  });
});
