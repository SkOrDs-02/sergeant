import { describe, expect, it } from "vitest";
import { sanitizeUrl } from "./sanitizeUrl";

describe("sanitizeUrl", () => {
  it("повертає URL без змін, коли немає чутливих query-params", () => {
    expect(sanitizeUrl("https://sergeant.vercel.app/welcome")).toBe(
      "https://sergeant.vercel.app/welcome",
    );
    expect(
      sanitizeUrl("https://sergeant.vercel.app/hub?vibe=finyk&step=2"),
    ).toBe("https://sergeant.vercel.app/hub?vibe=finyk&step=2");
  });

  it("стрипає magic-link токен", () => {
    const out = sanitizeUrl(
      "https://sergeant.vercel.app/auth/callback?token=abc123def&email=u%40x",
    );
    expect(out).toContain("token=%5Bredacted%5D");
    expect(out).not.toContain("abc123def");
    // Інші парами зберігаються.
    expect(out).toContain("email=u%40x");
  });

  it("стрипає OAuth `code` і `state`", () => {
    const out = sanitizeUrl(
      "https://sergeant.vercel.app/oauth/callback?code=SECRET&state=STATEVAL&scope=read",
    );
    expect(out).toContain("code=%5Bredacted%5D");
    expect(out).toContain("state=%5Bredacted%5D");
    expect(out).not.toContain("SECRET");
    expect(out).not.toContain("STATEVAL");
    expect(out).toContain("scope=read");
  });

  it("стрипає access_token / refresh_token в різних регістрах", () => {
    const out = sanitizeUrl(
      "https://sergeant.vercel.app/cb?ACCESS_TOKEN=aaa&Refresh_Token=bbb",
    );
    expect(out).not.toContain("aaa");
    expect(out).not.toContain("bbb");
  });

  it("редактує всі дублікати ключа", () => {
    const out = sanitizeUrl(
      "https://sergeant.vercel.app/x?token=a&token=b&token=c",
    );
    expect(out).not.toContain("=a");
    expect(out).not.toContain("=b");
    expect(out).not.toContain("=c");
    // URLSearchParams.set зливає дублікати в один запис.
    expect(out.match(/token=/g)?.length).toBe(1);
  });

  it("зберігає hash", () => {
    const out = sanitizeUrl(
      "https://sergeant.vercel.app/hub?token=abc#section",
    );
    expect(out.endsWith("#section")).toBe(true);
  });

  it("повертає входовий рядок, якщо URL невалідний", () => {
    expect(sanitizeUrl("not a url")).toBe("not a url");
    expect(sanitizeUrl("")).toBe("");
  });
});
