// @vitest-environment jsdom
/**
 * Last validated: 2026-08-16
 * Status: Active
 *
 * Спільне визначення «клавіатура на екрані» для `useVisualKeyboardInset`
 * і `useKeyboardAwareOverlay`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  KEYBOARD_GAP_MIN_PX,
  isTextEntryElement,
  softKeyboardGapPx,
} from "./softKeyboard";

function vvOfHeight(height: number): VisualViewport {
  return { height } as VisualViewport;
}

describe("isTextEntryElement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("впізнає input і textarea", () => {
    expect(isTextEntryElement(document.createElement("input"))).toBe(true);
    expect(isTextEntryElement(document.createElement("textarea"))).toBe(true);
  });

  it("впізнає contenteditable", () => {
    const el = document.createElement("div");
    // jsdom не реалізує `isContentEditable` як live-властивість.
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isTextEntryElement(el)).toBe(true);
  });

  it("відкидає звичайні елементи, кнопки і null", () => {
    expect(isTextEntryElement(document.createElement("button"))).toBe(false);
    expect(isTextEntryElement(document.createElement("div"))).toBe(false);
    expect(isTextEntryElement(null)).toBe(false);
  });
});

describe("softKeyboardGapPx", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function focusInput(): void {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
  }

  it("повертає висоту клавіатури, коли поле сфокусоване і гап великий", () => {
    focusInput();
    expect(softKeyboardGapPx(vvOfHeight(500))).toBe(300);
  });

  it("повертає 0 без сфокусованого поля вводу — це браузерний chrome", () => {
    // Той самий гап, але фокус на `body`: сценарій холодного старту з
    // пуш-сповіщення, через який `HubBottomNav` ховався без клавіатури.
    expect(softKeyboardGapPx(vvOfHeight(500))).toBe(0);
  });

  it("повертає 0 на гапі рівно на порозі — поріг строгий", () => {
    focusInput();
    const atThreshold = 800 - KEYBOARD_GAP_MIN_PX;
    expect(softKeyboardGapPx(vvOfHeight(atThreshold))).toBe(0);
    expect(softKeyboardGapPx(vvOfHeight(atThreshold - 1))).toBe(
      KEYBOARD_GAP_MIN_PX + 1,
    );
  });

  it("округлює дробову висоту viewport", () => {
    focusInput();
    expect(softKeyboardGapPx(vvOfHeight(500.4))).toBe(300);
  });
});
