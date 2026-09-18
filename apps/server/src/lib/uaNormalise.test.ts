import { describe, it, expect } from "vitest";
import { normaliseUserAgent } from "./uaNormalise.js";

// Канонічні UA-фікстури з реальних requestlog-ів сервера + кілька bot/edge-кейсів.
// Order має значення: Chrome / Edge / Opera мають перетин-токени (Chrome →
// Safari, Edge → Chrome → Safari), тож ми перевіряємо обидва: позитив для
// поточного браузера + щоб попередній клас не зловив його токен.
describe("normaliseUserAgent", () => {
  it.each([
    [
      "chrome desktop (Windows)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "chrome 121",
    ],
    [
      "chrome desktop (macOS)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
      "chrome 118",
    ],
    [
      "edge desktop (Windows, Chromium-based)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
      "edge 121",
    ],
    [
      "opera desktop (Chromium-based)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0",
      "opera 106",
    ],
    [
      "firefox desktop",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
      "firefox 121",
    ],
    [
      "safari desktop (macOS)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
      "safari 17",
    ],
    [
      "safari mobile (iPhone iOS 17)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
      "safari-mobile 17",
    ],
    [
      "chrome mobile (iOS via WKWebView)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.6167.71 Mobile/15E148 Safari/604.1",
      "chrome-mobile 121",
    ],
    [
      "firefox mobile (iOS)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/122.0 Mobile/15E148 Safari/605.1.15",
      "firefox-mobile 122",
    ],
    [
      "chrome mobile (Android)",
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
      "chrome-mobile 121",
    ],
  ])("розпізнає %s", (_label, input, expected) => {
    expect(normaliseUserAgent(input)).toBe(expected);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["only whitespace", "   "],
    ["curl bot", "curl/8.4.0"],
    ["python requests", "python-requests/2.31.0"],
    [
      "Googlebot",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    ],
    [
      "non-browser AhrefsBot",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    ],
    [
      "UA overflow (513 chars)",
      "Mozilla/5.0 " + "x".repeat(500) + " Chrome/121.0.0.0 Safari/537.36",
    ],
  ])("повертає 'unknown' для %s", (_label, input) => {
    expect(normaliseUserAgent(input)).toBe("unknown");
  });

  it("кардинальність обмежена набором сімейств — лейбл-сейфно для Prometheus", () => {
    const families = new Set<string>();
    const samples = [
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Linux) Firefox/120.0",
      "Mozilla/5.0 Edg/118.0.0.0 Chrome/118.0.0.0 Safari/537.36",
      "Mozilla/5.0 OPR/106.0.0.0 Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 CriOS/121.0.0.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 Version/17.2 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 Version/17.2 Safari/605.1.15",
      "garbage",
      "",
    ];
    for (const ua of samples) {
      const out = normaliseUserAgent(ua);
      const family = out.split(" ")[0];
      families.add(family!);
    }
    // Очікувані family-токени; "unknown" — для bot/garbage/empty.
    expect(families.size).toBeLessThanOrEqual(8);
    expect(families.has("unknown")).toBe(true);
  });
});
