import { describe, expect, it } from "vitest";
import { render } from "../entry-server";
import charset from "../fonts/charset.json";
import { ROUTE_META } from "./pageMeta";

/**
 * Шрифти сайту – підмножини лише з символів набору `src/fonts/charset.json`
 * (`scripts/subset-fonts.mjs`, аудит сайту 2026-10-08, F5). Символ поза
 * набором браузер намалює системним шрифтом посеред рядка Manrope, і
 * побачити це можна лише очима на конкретній сторінці. Тест рендерить усі
 * маршрути разом із title і description і вимагає, щоб кожен символ був у
 * наборі. Червоний – перезапусти генератор:
 *
 *   pnpm --filter @sergeant/landing build
 *   pnpm --filter @sergeant/landing fonts:subset
 */
const allowed = new Set(charset as string);
const ignorable = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x20 || (cp >= 0x7f && cp < 0xa0);
};

describe("шрифти покривають текст сайту", () => {
  it("кожен символ сторінок є в підмножині шрифтів", () => {
    const missing = new Map<string, string>();
    for (const [route, meta] of Object.entries(ROUTE_META)) {
      const { html } = render(route, "https://sergeant.com.ua");
      for (const ch of `${meta.title}${meta.description}${html}`) {
        if (!allowed.has(ch) && !ignorable(ch) && !missing.has(ch)) {
          const cp = ch.codePointAt(0)!.toString(16).toUpperCase();
          missing.set(ch, `U+${cp.padStart(4, "0")} «${ch}» на ${route}`);
        }
      }
    }
    expect([...missing.values()]).toEqual([]);
  });

  it("тест справді ловить символ поза набором", () => {
    // Захист від тесту, що мовчить завжди: ці символи на сайті не трапляються
    // і в набір не входять.
    expect(allowed.has("Ы")).toBe(false);
    expect(allowed.has("ё")).toBe(false);
    expect(allowed.has("ї")).toBe(true);
  });
});
