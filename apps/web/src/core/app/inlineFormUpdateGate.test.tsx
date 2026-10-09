// @vitest-environment jsdom
/**
 * data-45: тихий idle-reload не має стирати форму, що стоїть прямо на
 * сторінці (не в Sheet/Modal). Реальні модулі: справжній `BodyEntryForm` з
 * «Тіла» і справжній `setupAutoUpdate`; підмінено лише `updateSW` і SW-реєстрацію.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { BodyEntryForm } from "../../modules/fizruk/pages/Body/BodyEntryForm";
import { resetDirtyStateForTests } from "@shared/lib/ui/dirtyState";
import { setupAutoUpdate } from "./autoUpdate";
import { resetSwReloadForTests } from "./swReload";

function installWaitingServiceWorker() {
  const reg = {
    update: vi.fn().mockResolvedValue(undefined),
    waiting: { postMessage: vi.fn() } as unknown as ServiceWorker,
  };
  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    value: {
      controller: null,
      ready: Promise.resolve(reg),
      getRegistration: vi.fn().mockResolvedValue(reg),
    },
    configurable: true,
  });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

/**
 * Піднімає `setupAutoUpdate`, дає `interact` попрацювати з DOM (як користувач
 * після завантаження), ховає вкладку на 6 хв і повертається.
 */
async function idleReturn(interact: () => void) {
  const updateSW = vi.fn();
  let fakeNow = 0;
  setVisibility("visible");
  const ctrl = setupAutoUpdate({
    updateSW,
    idleSkipWaitingMs: 5 * 60 * 1000,
    now: () => fakeNow,
  });
  interact();
  setVisibility("hidden");
  await Promise.resolve();
  fakeNow = 6 * 60 * 1000;
  setVisibility("visible");
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  ctrl.dispose();
  return updateSW;
}

describe("idle-reload проти інлайн-форми на сторінці", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDirtyStateForTests();
    resetSwReloadForTests();
    installWaitingServiceWorker();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
  });

  it("введена вага у формі «Тіла» блокує тихий reload", async () => {
    const { container } = render(<BodyEntryForm onSubmitEntry={vi.fn()} />);
    const updateSW = await idleReturn(() => {
      fireEvent.input(container.querySelector("#body-weight")!, {
        target: { value: "82,5" },
      });
    });
    expect(updateSW).not.toHaveBeenCalled();
  });

  it("лише оцінка настрою (кнопка, не поле) теж блокує тихий reload", async () => {
    const { getAllByRole } = render(<BodyEntryForm onSubmitEntry={vi.fn()} />);
    const updateSW = await idleReturn(() => {
      fireEvent.click(getAllByRole("radio")[0]!);
    });
    expect(updateSW).not.toHaveBeenCalled();
  });

  it("порожня форма «Тіла» не блокує: reload як раніше", async () => {
    render(<BodyEntryForm onSubmitEntry={vi.fn()} />);
    const updateSW = await idleReturn(() => {});
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it("поле, спорожнене після збереження, більше не блокує", async () => {
    const { container } = render(<BodyEntryForm onSubmitEntry={vi.fn()} />);
    const updateSW = await idleReturn(() => {
      const weight = container.querySelector("#body-weight")!;
      fireEvent.input(weight, { target: { value: "82" } });
      fireEvent.input(weight, { target: { value: "" } });
    });
    expect(updateSW).toHaveBeenCalledWith(true);
  });
});
