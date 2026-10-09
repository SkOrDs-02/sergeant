// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  hasDirtyState,
  installTypedInputTracker,
  registerDirtyState,
  resetDirtyStateForTests,
} from "./dirtyState";

afterEach(() => resetDirtyStateForTests());

describe("dirtyState", () => {
  it("порожній за замовчуванням", () => {
    expect(hasDirtyState()).toBe(false);
  });

  it("лічить незалежні джерела: брудний, доки знято не всі", () => {
    const a = registerDirtyState();
    const b = registerDirtyState();
    expect(hasDirtyState()).toBe(true);
    a();
    expect(hasDirtyState()).toBe(true);
    b();
    expect(hasDirtyState()).toBe(false);
  });

  it("повторне зняття ідемпотентне і не чіпає чужі реєстрації", () => {
    const a = registerDirtyState();
    const b = registerDirtyState();
    a();
    a();
    expect(hasDirtyState()).toBe(true);
    b();
    expect(hasDirtyState()).toBe(false);
  });
});

describe("installTypedInputTracker (інлайн-поля поза Sheet/Modal)", () => {
  function mount(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("без встановленого трекера ввід у поле не рахується", () => {
    const host = mount('<input id="w" type="text" />');
    type(host.querySelector("input")!, "82");
    expect(hasDirtyState()).toBe(false);
  });

  it("введене значення робить стан брудним, спорожнення — чистим", () => {
    installTypedInputTracker();
    const host = mount('<input type="text" /><textarea></textarea>');
    const input = host.querySelector("input")!;
    expect(hasDirtyState()).toBe(false);
    type(input, "82");
    expect(hasDirtyState()).toBe(true);
    type(input, "  ");
    expect(hasDirtyState()).toBe(false);
    type(host.querySelector("textarea")!, "нотатка");
    expect(hasDirtyState()).toBe(true);
  });

  it("поле, прибране з DOM, більше не тримає стан брудним", () => {
    installTypedInputTracker();
    const host = mount('<input type="number" />');
    type(host.querySelector("input")!, "5");
    expect(hasDirtyState()).toBe(true);
    host.remove();
    expect(hasDirtyState()).toBe(false);
  });

  it("не рахує пошук, перемикачі, readonly і disabled", () => {
    installTypedInputTracker();
    const host = mount(
      '<input type="search" /><input type="checkbox" /><input type="text" readonly /><input type="text" disabled />',
    );
    for (const el of Array.from(host.querySelectorAll("input"))) {
      type(el, "x");
    }
    expect(hasDirtyState()).toBe(false);
  });

  it("повторне встановлення ідемпотентне, зняття вимикає трекер", () => {
    const off = installTypedInputTracker();
    installTypedInputTracker();
    const host = mount('<input type="text" />');
    type(host.querySelector("input")!, "a");
    expect(hasDirtyState()).toBe(true);
    resetDirtyStateForTests();
    off();
    type(host.querySelector("input")!, "b");
    expect(hasDirtyState()).toBe(false);
  });
});
