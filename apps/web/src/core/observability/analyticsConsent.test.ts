// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
  getAnalyticsDecision,
  getPendingAnalyticsSync,
  hydrateAnalyticsConsent,
  isAnalyticsServerHydrated,
  markAnalyticsDecisionSynced,
  markAnalyticsServerHydrated,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
} from "./analyticsConsent";

const { safeWriteLSMock, warnMock } = vi.hoisted(() => ({
  safeWriteLSMock: vi.fn(),
  warnMock: vi.fn(),
}));
vi.mock("@shared/lib/storage/storage", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/lib/storage/storage")
  >("@shared/lib/storage/storage");
  safeWriteLSMock.mockImplementation(actual.safeWriteLS);
  return { ...actual, safeWriteLS: safeWriteLSMock };
});
vi.mock("@shared/lib", () => ({ logger: { warn: warnMock } }));

afterEach(() => {
  warnMock.mockClear();
  __resetAnalyticsConsentForTests();
  localStorage.clear();
});

describe("analyticsConsent", () => {
  it("defaults to false — deny until an authenticated boot hydrates the server value (CodeRabbit PR #627)", () => {
    expect(getAnalyticsConsent()).toBe(false);
  });

  it("reflects the last value written by setAnalyticsConsent", () => {
    setAnalyticsConsent(true);
    expect(getAnalyticsConsent()).toBe(true);
    setAnalyticsConsent(false);
    expect(getAnalyticsConsent()).toBe(false);
  });

  it("__resetAnalyticsConsentForTests restores the deny-by-default", () => {
    setAnalyticsConsent(true);
    __resetAnalyticsConsentForTests();
    expect(getAnalyticsConsent()).toBe(false);
  });
});

describe("рішення пристрою (банер першого запуску)", () => {
  it("спершу рішення немає", () => {
    expect(getAnalyticsDecision()).toBeNull();
  });

  it("явний вибір запамʼятовується: granted / denied", () => {
    setAnalyticsConsent(true);
    expect(getAnalyticsDecision()).toBe("granted");
    setAnalyticsConsent(false);
    expect(getAnalyticsDecision()).toBe("denied");
  });

  it("гідрація сервером зі значенням false — не відповідь людини, банер лишається", () => {
    hydrateAnalyticsConsent(false);
    expect(getAnalyticsConsent()).toBe(false);
    expect(getAnalyticsDecision()).toBeNull();
    expect(isAnalyticsServerHydrated()).toBe(true);
  });

  it("гідрація true гасить банер (уже погодилась на іншому пристрої)", () => {
    hydrateAnalyticsConsent(true);
    expect(getAnalyticsConsent()).toBe(true);
    expect(getAnalyticsDecision()).toBe("granted");
  });

  it("сервер має пріоритет: false після локального granted → denied", () => {
    setAnalyticsConsent(true);
    hydrateAnalyticsConsent(false);
    expect(getAnalyticsConsent()).toBe(false);
    expect(getAnalyticsDecision()).toBe("denied");
  });

  it("сповіщає підписників і відписується", () => {
    const listener = vi.fn();
    const off = subscribeAnalyticsConsent(listener);
    setAnalyticsConsent(true);
    markAnalyticsServerHydrated(true);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    setAnalyticsConsent(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("рішення переживає перезавантаження: granted → кеш true, denied → false", async () => {
    setAnalyticsConsent(true);
    vi.resetModules();
    const fresh = await import("./analyticsConsent");
    expect(fresh.getAnalyticsDecision()).toBe("granted");
    expect(fresh.getAnalyticsConsent()).toBe(true);

    fresh.setAnalyticsConsent(false);
    vi.resetModules();
    const again = await import("./analyticsConsent");
    expect(again.getAnalyticsDecision()).toBe("denied");
    expect(again.getAnalyticsConsent()).toBe(false);
  });
});

describe("analyticsConsent — збій запису рішення у сховище", () => {
  it("лишає рішення в памʼяті, сповіщає підписників і логує попередження", () => {
    safeWriteLSMock.mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    const listener = vi.fn();
    subscribeAnalyticsConsent(listener);

    expect(() => setAnalyticsConsent(true)).not.toThrow();

    expect(getAnalyticsConsent()).toBe(true);
    expect(getAnalyticsDecision()).toBe("granted");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it("логує попередження й коли запис повертає false", () => {
    safeWriteLSMock.mockReturnValueOnce(false);
    setAnalyticsConsent(false);
    expect(getAnalyticsDecision()).toBe("denied");
    expect(warnMock).toHaveBeenCalledTimes(1);
  });
});

describe("рішення гостя, ще не віддане серверу", () => {
  it("звичайний вибір не позначається як очікування синку", () => {
    setAnalyticsConsent(true);
    expect(getPendingAnalyticsSync()).toBeNull();
  });

  it("вибір гостя чекає синку і переживає перезавантаження", async () => {
    setAnalyticsConsent(true, { pendingServerSync: true });
    expect(getPendingAnalyticsSync()).toBe("granted");

    vi.resetModules();
    const fresh = await import("./analyticsConsent");
    expect(fresh.getAnalyticsDecision()).toBe("granted");
    expect(fresh.getPendingAnalyticsSync()).toBe("granted");
  });

  it("після синку прапорець знімається, рішення лишається", async () => {
    setAnalyticsConsent(false, { pendingServerSync: true });
    markAnalyticsDecisionSynced();
    expect(getPendingAnalyticsSync()).toBeNull();
    expect(getAnalyticsDecision()).toBe("denied");

    vi.resetModules();
    const fresh = await import("./analyticsConsent");
    expect(fresh.getPendingAnalyticsSync()).toBeNull();
    expect(fresh.getAnalyticsDecision()).toBe("denied");
  });

  it("новий явний вибір залогіненого знімає очікування", () => {
    setAnalyticsConsent(true, { pendingServerSync: true });
    setAnalyticsConsent(false);
    expect(getPendingAnalyticsSync()).toBeNull();
  });
});
