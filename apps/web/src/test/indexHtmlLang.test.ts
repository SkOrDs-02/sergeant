/// <reference types="node" />
// `apps/web/tsconfig.json` ships `"types": ["vite/client"]` so the standalone
// `tsc-files` pre-commit cannot see Node's globals when this file is checked
// in isolation. The triple-slash reference adds `@types/node` only for this
// file — vitest config already pulls it in for `pnpm typecheck`, so this is
// a no-op in the project-wide build.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * L4 — `docs/security/hardening/L4-html-lang-attribute.md`.
 *
 * The PWA shell at `apps/web/index.html` MUST declare a primary language on
 * the root `<html>` element. Without `lang`, screen readers fall back to the
 * user-agent default (often US English), pronouncing Ukrainian copy with
 * the wrong phoneme set, and Lighthouse a11y drops "html-has-lang".
 *
 * The audit only flagged this for "explicit assertion" — the attribute is
 * already set today. This regression test is the guard against a future
 * commit that strips it during a meta-tag refactor.
 */

function readIndexHtml(): string {
  return readFileSync(resolve(process.cwd(), "index.html"), "utf8");
}

function extractHtmlLang(html: string): string | null {
  const match = html.match(/<html\b[^>]*\blang\s*=\s*"([^"]+)"/i);
  return match ? match[1]! : null;
}

describe("L4: <html lang> attribute", () => {
  const html = readIndexHtml();

  it("declares a lang attribute on <html>", () => {
    expect(extractHtmlLang(html)).not.toBeNull();
  });

  it("uses Ukrainian (uk or uk-UA) — primary product language", () => {
    const lang = extractHtmlLang(html);
    expect(lang).toMatch(/^uk(-UA)?$/i);
  });

  it("declares lang before the first child element of <html>", () => {
    // A regression where someone strips `lang` from the opening `<html>` tag
    // and adds it via JS at runtime would break SSR/static crawlers; assert
    // it sits literally on the static tag.
    const openingTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
    expect(openingTag).toMatch(/\blang\s*=\s*"[^"]+"/i);
  });
});
