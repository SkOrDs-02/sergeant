/**
 * Last validated: 2026-10-03
 * Status: Active
 *
 * Гейт на канали звітів про вразливості (аудит 2026-10-01, `sec-17`).
 *
 * Після переїздів репозиторію й доменів `security.txt` вебу вказував на
 * неіснуючий `Skords-01/Sergeant` і на чужий `Canonical`, а на лендингу
 * файлу не було зовсім. Дослідник, який знайшов вразливість, не мав куди
 * написати. Тест тримає саме те, що тоді зламалося: живий Contact, свої
 * домени, незастарілий Expires. Це друга лінія до `scripts/check-security-
 * txt-expiry.sh` (той перевіряє лише дату).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILES = {
  web: new URL("../../../public/.well-known/security.txt", import.meta.url),
  landing: new URL(
    "../../../../landing/public/.well-known/security.txt",
    import.meta.url,
  ),
} as const;

const CONTACT = "https://github.com/SkOrDs-02/sergeant/security/advisories/new";
const DAY_MS = 86_400_000;
// RFC 9116 §2.5.5: Expires не далі ніж за рік; +1 доба на межу часових поясів.
const MAX_AHEAD_MS = 366 * DAY_MS;

function read(url: URL): string {
  return readFileSync(fileURLToPath(url), "utf8");
}

function fields(text: string, name: string): string[] {
  const re = new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, "gim");
  return [...text.matchAll(re)].map((m) => m[1] as string);
}

describe.each(Object.entries(FILES))("security.txt (%s)", (surface, url) => {
  const text = read(url);

  it("Contact — перше поле і веде на приватні advisories живого репо", () => {
    const first = text.split(/\r?\n/).find((l) => l.trim() !== "");
    expect(first).toBe(`Contact: ${CONTACT}`);
  });

  it("не містить мертвих власників, доменів і поштових адрес", () => {
    expect(text).not.toMatch(/2dmanager/i);
    expect(text).not.toMatch(/Skords-01/);
    expect(text).not.toMatch(/sergeant\.app/i);
  });

  it("Expires у майбутньому, але не далі ніж за рік", () => {
    const [raw, ...rest] = fields(text, "Expires");
    expect(rest).toEqual([]);
    const expires = Date.parse(raw ?? "");
    expect(Number.isNaN(expires)).toBe(false);
    const ahead = expires - Date.now();
    expect(ahead).toBeGreaterThan(0);
    expect(ahead).toBeLessThanOrEqual(MAX_AHEAD_MS);
  });

  it("Preferred-Languages: uk, en", () => {
    expect(fields(text, "Preferred-Languages")).toEqual(["uk, en"]);
  });

  it("Canonical веде на власний домен поверхні", () => {
    const canonical = fields(text, "Canonical");
    expect(canonical.length).toBeGreaterThan(0);
    const allowed =
      surface === "web"
        ? [
            "https://app.sergeant.com.ua/.well-known/security.txt",
            "https://sergeant.vercel.app/.well-known/security.txt",
          ]
        : ["https://sergeant.com.ua/.well-known/security.txt"];
    for (const c of canonical) expect(allowed).toContain(c);
  });
});
