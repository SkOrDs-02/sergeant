// scripts/__tests__/check-pwa-precache-1st-party.test.mjs
//
// Unit tests for the PWA precache 1st-party gate (PR-38 / L11).
// Run with: node --test scripts/__tests__/check-pwa-precache-1st-party.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ORIGIN_ALLOWLIST,
  extractPrecacheUrls,
  isFirstParty,
} from "../check-pwa-precache-1st-party.mjs";

// ── isFirstParty ─────────────────────────────────────────────────────────────

describe("isFirstParty", () => {
  it("treats relative paths as first-party", () => {
    for (const u of [
      "index.html",
      "assets/index-abc123.js",
      "/icon-192.png",
      "./favicon.ico",
      "../up-one.css",
      "icon.svg",
    ]) {
      assert.equal(
        isFirstParty(u),
        true,
        `expected first-party: ${JSON.stringify(u)}`,
      );
    }
  });

  it("rejects absolute https/http URLs", () => {
    for (const u of [
      "https://fonts.googleapis.com/css?family=Inter",
      "https://cdn.jsdelivr.net/npm/foo@1/dist/foo.js",
      "http://insecure.example.com/script.js",
    ]) {
      assert.equal(
        isFirstParty(u),
        false,
        `expected NOT first-party: ${JSON.stringify(u)}`,
      );
    }
  });

  it("rejects scheme-relative URLs (//host/…)", () => {
    assert.equal(isFirstParty("//cdn.example.com/lib.js"), false);
  });

  it("rejects data: / blob: as non-first-party (cache-poisoning safety)", () => {
    // Не очікуємо їх у precache — Workbox теж не має сенсу їх кешувати.
    // Якщо колись з'являться — інженер навмисно додасть до allowlist.
    assert.equal(isFirstParty("data:text/css;base64,QQ=="), false);
    assert.equal(isFirstParty("blob:https://example.com/abc"), false);
  });

  it("respects ORIGIN_ALLOWLIST when populated", () => {
    // ORIGIN_ALLOWLIST мутується тестом; чистимо після — `Set` живе у
    // module-instance, тестам того ж файлу він спільний.
    const origin = "https://allowed.example.com";
    ORIGIN_ALLOWLIST.add(origin);
    try {
      assert.equal(isFirstParty(`${origin}/asset.js`), true);
      // Інший origin того ж host-у — НЕ дозволено (строгий equality).
      assert.equal(
        isFirstParty("https://different.example.com/asset.js"),
        false,
      );
    } finally {
      ORIGIN_ALLOWLIST.delete(origin);
    }
  });
});

// ── extractPrecacheUrls ──────────────────────────────────────────────────────

describe("extractPrecacheUrls", () => {
  it("extracts all URLs from minified Workbox manifest", () => {
    // Реальний формат: масив `{"url":"...","revision":"..."}` після
    // VitePWA injectManifest substitution. Minifier-и (Vite/Rolldown)
    // лишають JSON-keys у лапках, бо це property-strings.
    const sw = `
      var manifest=[{"revision":"abc","url":"index.html"},
        {"revision":null,"url":"assets/index-DvneaVG2.js"},
        {"revision":"d4","url":"icon-192.png"}];
      precacheAndRoute(manifest);
    `;
    assert.deepEqual(extractPrecacheUrls(sw), [
      "index.html",
      "assets/index-DvneaVG2.js",
      "icon-192.png",
    ]);
  });

  it("returns [] when no manifest URLs present", () => {
    assert.deepEqual(extractPrecacheUrls("// no precache here"), []);
  });

  it("captures absolute URLs (which the gate then rejects)", () => {
    const sw = `[{"url":"https://fonts.googleapis.com/css","revision":null}]`;
    assert.deepEqual(extractPrecacheUrls(sw), [
      "https://fonts.googleapis.com/css",
    ]);
  });
});

// ── Integration: combined extract + isFirstParty gating ─────────────────────

describe("end-to-end gate logic", () => {
  it("clean manifest passes (no violations)", () => {
    const sw = `[
      {"url":"index.html","revision":"a"},
      {"url":"assets/index-abc.js","revision":null},
      {"url":"icon-512.png","revision":"d4"}
    ]`;
    const urls = extractPrecacheUrls(sw);
    const violations = urls.filter((u) => !isFirstParty(u));
    assert.equal(violations.length, 0);
  });

  it("mixed manifest fails with the offending URLs surfaced", () => {
    const sw = `[
      {"url":"index.html","revision":"a"},
      {"url":"https://fonts.googleapis.com/css?family=Inter","revision":null},
      {"url":"assets/index-abc.js","revision":null},
      {"url":"//cdn.example.com/lib.js","revision":null}
    ]`;
    const urls = extractPrecacheUrls(sw);
    const violations = urls.filter((u) => !isFirstParty(u));
    assert.deepEqual(violations, [
      "https://fonts.googleapis.com/css?family=Inter",
      "//cdn.example.com/lib.js",
    ]);
  });
});
