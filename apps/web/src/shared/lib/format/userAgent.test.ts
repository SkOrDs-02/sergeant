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
});
