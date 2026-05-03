import { afterEach, describe, expect, it } from "vitest";
import { shouldPrefetchOnConnection } from "./connectionGate";

interface ConnectionShape {
  saveData?: boolean;
  effectiveType?: string;
}

interface NavigatorMutable {
  connection?: ConnectionShape;
}

const nav: NavigatorMutable = navigator as unknown as NavigatorMutable;

afterEach(() => {
  delete nav.connection;
});

describe("shouldPrefetchOnConnection", () => {
  it("дозволяє prefetch коли API недоступне (Safari fail-open)", () => {
    expect(nav.connection).toBeUndefined();
    expect(shouldPrefetchOnConnection()).toBe(true);
  });

  it("блокує prefetch коли saveData увімкнено", () => {
    nav.connection = { saveData: true, effectiveType: "4g" };
    expect(shouldPrefetchOnConnection()).toBe(false);
  });

  it("блокує prefetch на 2g/slow-2g", () => {
    nav.connection = { effectiveType: "slow-2g" };
    expect(shouldPrefetchOnConnection()).toBe(false);
    nav.connection = { effectiveType: "2g" };
    expect(shouldPrefetchOnConnection()).toBe(false);
  });

  it("дозволяє prefetch на 3g/4g/wifi", () => {
    nav.connection = { effectiveType: "3g" };
    expect(shouldPrefetchOnConnection()).toBe(true);
    nav.connection = { effectiveType: "4g" };
    expect(shouldPrefetchOnConnection()).toBe(true);
    nav.connection = { effectiveType: "wifi" };
    expect(shouldPrefetchOnConnection()).toBe(true);
  });

  it("saveData має пріоритет над швидким effectiveType", () => {
    nav.connection = { saveData: true, effectiveType: "4g" };
    expect(shouldPrefetchOnConnection()).toBe(false);
  });
});
