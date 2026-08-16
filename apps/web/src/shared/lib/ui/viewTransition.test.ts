// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { startViewTransition, supportsViewTransitions } from "./viewTransition";

const matchMediaStub = (matches: boolean) =>
  vi.fn(() => ({
    matches,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Ensure the API is cleaned up between cases.
  delete (document as unknown as { startViewTransition?: unknown })
    .startViewTransition;
});

describe("startViewTransition (R2-V-1/V-2)", () => {
  it("runs the mutation directly when the API is unavailable", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(false));
    const mutate = vi.fn();
    startViewTransition(mutate);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("runs the mutation directly (no transition) under reduced motion", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(true));
    const startVT = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    (
      document as unknown as { startViewTransition: typeof startVT }
    ).startViewTransition = startVT;

    const mutate = vi.fn();
    startViewTransition(mutate);

    // Reduced motion → bypass the API entirely.
    expect(startVT).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("drives the mutation through the API when supported", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(false));
    const startVT = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    (
      document as unknown as { startViewTransition: typeof startVT }
    ).startViewTransition = startVT;

    const mutate = vi.fn();
    startViewTransition(mutate);

    expect(startVT).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("falls back to a direct mutation if the API throws", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(false));
    const startVT = vi.fn(() => {
      throw new Error("boom");
    });
    (
      document as unknown as { startViewTransition: typeof startVT }
    ).startViewTransition = startVT;

    const mutate = vi.fn();
    expect(() => startViewTransition(mutate)).not.toThrow();
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  /**
   * Регресія — рожеві смуги впоперек чипів і стрічки тижня в «Рутині».
   *
   * Постійний `view-transition-name` лишав рожевий `ModuleHeader` окремим
   * snapshot-шаром, який WebKit малював поверх сусідніх рядів, а дублікат
   * імені (плитка хабу + хедер модуля) ще й робив перехід невалідним за
   * спекою. Ім'я мусить існувати лише на час переходу.
   */
  describe("view-transition-name живе лише під час переходу", () => {
    const mountNamed = (name: string) => {
      const el = document.createElement("div");
      el.setAttribute("data-vt-name", name);
      document.body.appendChild(el);
      return el;
    };

    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("ставить ім'я на час переходу і знімає після завершення", async () => {
      vi.stubGlobal("matchMedia", matchMediaStub(false));
      const tile = mountNamed("sgt-module-routine");
      let duringTransition = "";
      const startVT = vi.fn((cb: () => void) => {
        cb();
        duringTransition = tile.style.viewTransitionName;
        return { finished: Promise.resolve() };
      });
      (
        document as unknown as { startViewTransition: typeof startVT }
      ).startViewTransition = startVT;

      startViewTransition(() => {});
      expect(duringTransition).toBe("sgt-module-routine");

      await Promise.resolve();
      await Promise.resolve();
      expect(tile.style.viewTransitionName).toBe("");
    });

    it("не видає одне ім'я двом елементам одночасно", () => {
      vi.stubGlobal("matchMedia", matchMediaStub(false));
      const tile = mountNamed("sgt-module-routine");
      const header = mountNamed("sgt-module-routine");
      const startVT = vi.fn((cb: () => void) => {
        cb();
        return { finished: Promise.resolve() };
      });
      (
        document as unknown as { startViewTransition: typeof startVT }
      ).startViewTransition = startVT;

      startViewTransition(() => {});

      const named = [tile, header].filter(
        (el) => el.style.viewTransitionName === "sgt-module-routine",
      );
      expect(named).toHaveLength(1);
    });

    it("знімає ім'я, якщо перехід зірвався", async () => {
      vi.stubGlobal("matchMedia", matchMediaStub(false));
      const tile = mountNamed("sgt-module-routine");
      const startVT = vi.fn((cb: () => void) => {
        cb();
        return { finished: Promise.reject(new Error("aborted")) };
      });
      (
        document as unknown as { startViewTransition: typeof startVT }
      ).startViewTransition = startVT;

      startViewTransition(() => {});
      await Promise.resolve();
      await Promise.resolve();

      expect(tile.style.viewTransitionName).toBe("");
    });

    it("не лишає імені, коли рух вимкнено (перехід не запускається)", () => {
      vi.stubGlobal("matchMedia", matchMediaStub(true));
      const tile = mountNamed("sgt-module-routine");
      (
        document as unknown as { startViewTransition: () => void }
      ).startViewTransition = () => {};

      startViewTransition(() => {});

      expect(tile.style.viewTransitionName).toBe("");
    });
  });

  it("supportsViewTransitions reflects API presence", () => {
    expect(supportsViewTransitions()).toBe(false);
    (
      document as unknown as { startViewTransition: () => void }
    ).startViewTransition = () => {};
    expect(supportsViewTransitions()).toBe(true);
  });
});
