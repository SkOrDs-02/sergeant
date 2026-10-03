import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("Vercel output configuration", () => {
  it("points Vercel at an output directory inside the selected project root", () => {
    // SSOT lives next to the app — Vercel's Root Directory is `apps/web`, so
    // it only reads `apps/web/vercel.json`. A repo-root `vercel.json` is
    // explicitly disallowed and `scripts/check-vercel-config.sh` enforces
    // that on every PR (see commit 61196120).
    const webRootConfig = readJson(resolve(process.cwd(), "vercel.json"));
    expect(webRootConfig["outputDirectory"]).toBe("dist");

    const repoRootConfigPath = resolve(process.cwd(), "../../vercel.json");
    expect(existsSync(repoRootConfigPath)).toBe(false);
  });

  it("serves SPA route HTML with edge no-cache headers", () => {
    const webRootConfig = readJson(resolve(process.cwd(), "vercel.json")) as {
      headers?: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };

    const spaHtmlHeaders = webRootConfig.headers?.find(
      (entry) =>
        entry.source === "/((?!api/|assets/|_vercel/|\\.well-known/).*)",
    );
    const cacheControl = spaHtmlHeaders?.headers.find(
      (header) => header.key.toLowerCase() === "cache-control",
    );

    expect(cacheControl?.value).toBe(
      "public, max-age=0, must-revalidate, s-maxage=0",
    );
  });

  // Регресія SERGEANT-API-M / SERGEANT-WEB-R (~25 користувачів за бету).
  //
  // SPA-rewrite ловить усе, що не знайшлося на диску, і віддає `index.html`
  // з кодом 200. Для відсутнього асета це найгірша з можливих відповідей:
  // замість чесної 404 клієнт отримує HTML із типом `text/html`, і далі
  // помилка спливає там, де її ніхто не повʼязує з деплоєм. Для `.wasm` це
  // виглядало як «both async and sync fetching of the wasm failed» —
  // emscripten валив і streaming-, і ArrayBuffer-шлях, бо намагався
  // скомпілювати сторінку застосунку.
  it("відсутній асет дає 404, а не HTML-оболонку", () => {
    const config = readJson(resolve(process.cwd(), "vercel.json")) as {
      rewrites?: Array<{ source: string; destination: string }>;
    };

    const spaRewrite = config.rewrites?.find(
      (entry) => entry.destination === "/index.html",
    );
    expect(spaRewrite).toBeDefined();

    // `assets/` мусить бути у виключеннях — інакше стейлі хеші знову
    // почнуть повертати сторінку замість 404.
    expect(spaRewrite!.source).toContain("assets/");

    // А тепер головне: перевіряємо не текст патерну, а його ПОВЕДІНКУ.
    // Негативний lookahead прикріплений до початку шляху, тож він відсікає
    // рівно `/assets/**` і НЕ чіпає прикладні роути, у яких слово `assets`
    // стоїть глибше — а такий у застосунку є (`/finyk/assets`).
    const rewriteRe = new RegExp(`^${spaRewrite!.source}$`);

    expect(rewriteRe.test("/assets/sqlite3-DGXXSD5r.wasm")).toBe(false);
    expect(rewriteRe.test("/assets/index-abc123.js")).toBe(false);

    expect(rewriteRe.test("/finyk/assets")).toBe(true);
    expect(rewriteRe.test("/finyk/analytics")).toBe(true);
    expect(rewriteRe.test("/")).toBe(true);
  });
});
