// @vitest-environment jsdom
//
// Pin parser behaviour for `parseUserAgent` (PR-10 ux-roast 2026-Q2 / §10.3
// Profile-Sessions «людський User-Agent»).

import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./userAgent";

describe("parseUserAgent", () => {
  it("parses Chrome on Windows into «Chrome 132 на Windows»", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua)).toEqual({
      label: "Chrome 132 на Windows",
      browser: "chrome",
      browserVersion: "132",
      os: "windows",
    });
  });

  it("parses Mobile Safari on iPhone into «Safari 17 на iPhone»", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua)).toEqual({
      label: "Safari 17 на iPhone",
      browser: "safari",
      browserVersion: "17",
      os: "iphone",
    });
  });

  it("parses Firefox on Linux into «Firefox 122 на Linux»", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0";
    expect(parseUserAgent(ua).label).toBe("Firefox 122 на Linux");
  });

  it("prefers Edge over Chrome when both tokens are present", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0";
    expect(parseUserAgent(ua).browser).toBe("edge");
    expect(parseUserAgent(ua).label).toBe("Edge 132 на Windows");
  });

  it("returns the unknown-device fallback for empty input", () => {
    expect(parseUserAgent(null).label).toBe("Невідомий пристрій");
    expect(parseUserAgent(undefined).label).toBe("Невідомий пристрій");
    expect(parseUserAgent("").label).toBe("Невідомий пристрій");
  });

  it("returns the unknown-device fallback for unrecognised UA strings", () => {
    expect(parseUserAgent("totally-not-a-browser/1.0").label).toBe(
      "Невідомий пристрій",
    );
  });

  it("returns browser-only label when UA has a browser token but no recognisable OS", () => {
    // A synthetic UA that contains Chrome but no OS token
    const ua = "Mozilla/5.0 Chrome/132.0.0.0";
    const result = parseUserAgent(ua);
    expect(result.browser).toBe("chrome");
    expect(result.os).toBeNull();
    // label should be browser + version, no "на <OS>" suffix
    expect(result.label).toBe("Chrome 132");
  });

  it("returns OS-only label when UA has a recognisable OS but no browser token", () => {
    // A synthetic UA with a Windows token but no browser match
    const ua = "Mozilla/5.0 (Windows NT 10.0)";
    const result = parseUserAgent(ua);
    expect(result.os).toBe("windows");
    expect(result.browser).toBeNull();
    expect(result.label).toBe("Windows");
  });

  it("parses Opera (OPR/ token) correctly", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 OPR/117.0.0.0";
    const result = parseUserAgent(ua);
    expect(result.browser).toBe("opera");
    expect(result.browserVersion).toBe("117");
    expect(result.os).toBe("windows");
    expect(result.label).toBe("Opera 117 на Windows");
  });

  it("parses Chrome on Android correctly", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.163 Mobile Safari/537.36";
    const result = parseUserAgent(ua);
    expect(result.browser).toBe("chrome");
    expect(result.os).toBe("android");
    expect(result.label).toBe("Chrome 132 на Android");
  });

  it("detects iPad before macOS (prioritisation order)", () => {
    // iPadOS 13+ spoof Mac OS X in the UA — iPad must win
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/604.1";
    // This UA has Mac OS X but no iPad token → should be macOS
    const result = parseUserAgent(ua);
    expect(result.os).toBe("macos");

    // Real iPadOS UA with Mac OS X in it
    const ipadUa =
      "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
    const ipadResult = parseUserAgent(ipadUa);
    expect(ipadResult.os).toBe("ipad");
  });

  it("returns all ParsedUserAgent fields for a recognised browser", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0";
    const result = parseUserAgent(ua);
    expect(result).toHaveProperty("label");
    expect(result).toHaveProperty("browser", "firefox");
    expect(result).toHaveProperty("browserVersion", "122");
    expect(result).toHaveProperty("os", "linux");
  });
});
