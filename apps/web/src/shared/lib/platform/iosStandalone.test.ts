// @vitest-environment jsdom
/**
 * Tests for the iOS + standalone-PWA detection helper.
 *
 * Спуфимо `navigator.userAgent` / `navigator.platform` /
 * `navigator.maxTouchPoints` + `window.matchMedia` / `navigator.standalone`,
 * щоб покрити iPhone, iPadOS-як-Mac, Safari-вкладку та desktop.
 */
import { afterEach, describe, expect, it } from "vitest";
import { isIOS, isStandalonePWA, isIOSStandalonePWA } from "./iosStandalone";

const ORIGINAL_UA = navigator.userAgent;
const ORIGINAL_PLATFORM = navigator.platform;
const ORIGINAL_MAX_TOUCH = navigator.maxTouchPoints;
const ORIGINAL_MATCH_MEDIA = window.matchMedia;

function setNavigator(opts: {
  ua?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}): void {
  Object.defineProperty(navigator, "userAgent", {
    value: opts.ua ?? "Mozilla/5.0 (X11; Linux x86_64)",
    configurable: true,
  });
  Object.defineProperty(navigator, "platform", {
    value: opts.platform ?? "Linux x86_64",
    configurable: true,
  });
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: opts.maxTouchPoints ?? 0,
    configurable: true,
  });
  Object.defineProperty(navigator, "standalone", {
    value: opts.standalone,
    configurable: true,
  });
}

function setDisplayModeStandalone(matches: boolean): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("display-mode: standalone") ? matches : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  Object.defineProperty(navigator, "userAgent", {
    value: ORIGINAL_UA,
    configurable: true,
  });
  Object.defineProperty(navigator, "platform", {
    value: ORIGINAL_PLATFORM,
    configurable: true,
  });
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: ORIGINAL_MAX_TOUCH,
    configurable: true,
  });
  Object.defineProperty(navigator, "standalone", {
    value: undefined,
    configurable: true,
  });
  window.matchMedia = ORIGINAL_MATCH_MEDIA;
});

describe("isIOS", () => {
  it("true для iPhone UA", () => {
    setNavigator({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
    expect(isIOS()).toBe(true);
  });

  it("true для iPadOS, що рапортує як MacIntel + тач", () => {
    setNavigator({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
  });

  it("false для справжнього desktop Mac (без тачу)", () => {
    setNavigator({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(false);
  });

  it("false для Linux/desktop", () => {
    setNavigator({});
    expect(isIOS()).toBe(false);
  });
});

describe("isStandalonePWA", () => {
  it("true коли display-mode: standalone matches", () => {
    setNavigator({});
    setDisplayModeStandalone(true);
    expect(isStandalonePWA()).toBe(true);
  });

  it("true коли navigator.standalone === true (iOS Safari)", () => {
    setNavigator({ standalone: true });
    setDisplayModeStandalone(false);
    expect(isStandalonePWA()).toBe(true);
  });

  it("false у звичайній вкладці", () => {
    setNavigator({ standalone: false });
    setDisplayModeStandalone(false);
    expect(isStandalonePWA()).toBe(false);
  });
});

describe("isIOSStandalonePWA", () => {
  it("true лише коли iOS І standalone", () => {
    setNavigator({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      standalone: true,
    });
    setDisplayModeStandalone(true);
    expect(isIOSStandalonePWA()).toBe(true);
  });

  it("false на iOS у Safari-вкладці (не standalone)", () => {
    setNavigator({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      standalone: false,
    });
    setDisplayModeStandalone(false);
    expect(isIOSStandalonePWA()).toBe(false);
  });

  it("false у standalone, але не iOS (Android/desktop PWA)", () => {
    setNavigator({ ua: "Mozilla/5.0 (Linux; Android 14)" });
    setDisplayModeStandalone(true);
    expect(isIOSStandalonePWA()).toBe(false);
  });
});
