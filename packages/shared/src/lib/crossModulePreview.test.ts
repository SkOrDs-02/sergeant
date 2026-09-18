import { describe, it, expect } from "vitest";
import { createMemoryKVStore } from "../test-utils";
import { DASHBOARD_MODULE_IDS } from "./dashboard";
import {
  CROSS_MODULE_PREVIEW_COPY,
  getCrossModulePreviewCopy,
  hasSeenCrossModulePreview,
  markCrossModulePreviewSeen,
} from "./crossModulePreview";

describe("crossModulePreview persistence", () => {
  it("hasSeenCrossModulePreview returns false on a fresh store", () => {
    const store = createMemoryKVStore();
    expect(hasSeenCrossModulePreview(store)).toBe(false);
  });

  it("markCrossModulePreviewSeen flips the flag and is one-shot", () => {
    const store = createMemoryKVStore();
    markCrossModulePreviewSeen(store);
    expect(hasSeenCrossModulePreview(store)).toBe(true);
    // Calling again is a no-op (idempotent).
    markCrossModulePreviewSeen(store);
    expect(hasSeenCrossModulePreview(store)).toBe(true);
  });
});

describe("crossModulePreview copy", () => {
  it("getCrossModulePreviewCopy returns null for null source", () => {
    expect(getCrossModulePreviewCopy(null)).toBeNull();
  });

  it("getCrossModulePreviewCopy returns the copy variant for each module", () => {
    for (const moduleId of DASHBOARD_MODULE_IDS) {
      const copy = getCrossModulePreviewCopy(moduleId);
      expect(copy).not.toBeNull();
      expect(copy?.sourceModule).toBe(moduleId);
      expect(copy?.partnerModule).not.toBe(moduleId);
    }
  });
});

describe("crossModulePreview audit-guard (S6.4)", () => {
  it("every module has a copy variant — no fallback drift to a generic string", () => {
    // Audit-guard: every variant must exist explicitly. If a new module is
    // added to DASHBOARD_MODULE_IDS, this test fails until copy is written —
    // we refuse to fall back to a generic "додай ще модуль" body, which is
    // the exact failure mode S6.4 was opened to prevent.
    for (const moduleId of DASHBOARD_MODULE_IDS) {
      expect(CROSS_MODULE_PREVIEW_COPY[moduleId]).toBeDefined();
    }
    // Symmetry check: no orphan keys snuck in.
    expect(Object.keys(CROSS_MODULE_PREVIEW_COPY).sort()).toEqual(
      [...DASHBOARD_MODULE_IDS].sort(),
    );
  });

  it("body uses 'коли додаси ще' framing — forward-looking, not a claim", () => {
    // Audit-guard: the audit explicitly demanded post-entry preview be
    // framed as "what Sergeant *will* do when you add another category",
    // not a present-tense claim that the user already has cross-module
    // insights. Block any drift to "Sergeant показує", "ти можеш", etc.
    for (const moduleId of DASHBOARD_MODULE_IDS) {
      const copy = CROSS_MODULE_PREVIEW_COPY[moduleId];
      expect(copy.body.toLowerCase()).toContain("коли додаси ще");
      // Block claims that imply user already has cross-module data.
      expect(copy.body.toLowerCase()).not.toMatch(/ти вже бачиш/);
      expect(copy.body.toLowerCase()).not.toMatch(/sergeant вже/);
    }
  });

  it("body contains a × pairing — the visual cue cross-module insights live on", () => {
    // The "×" multiplication sign is the canonical typography for the
    // cross-module USP across the audit and the design system. Without it
    // the copy reads as a generic upsell rather than a paired-insight tease.
    for (const moduleId of DASHBOARD_MODULE_IDS) {
      const copy = CROSS_MODULE_PREVIEW_COPY[moduleId];
      expect(copy.body).toContain("×");
    }
  });

  it("CTA stays acknowledgement-style — single-primary affordance contract", () => {
    // S6.7 / S6.4 share the single-primary affordance pattern. The card
    // has 1 CTA + 1 dismiss-X; the CTA is acknowledgement, not a deep-link
    // (which would shift this from a one-shot promo into a navigation
    // surface and conflict with the bento grid below).
    for (const moduleId of DASHBOARD_MODULE_IDS) {
      const copy = CROSS_MODULE_PREVIEW_COPY[moduleId];
      expect(copy.ctaLabel).toBe("Зрозуміло");
      expect(copy.dismissAriaLabel).toBe("Закрити підказку");
    }
  });
});
