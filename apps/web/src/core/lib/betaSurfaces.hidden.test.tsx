// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * The DEFAULT beta state: both surfaces hidden.
 *
 * `betaSurfaces` reads `import.meta.env`, which Vitest leaves unset, so the
 * real module already evaluates to `false/false` here — no mock needed. The
 * mirror-image suites (commerce/legal SHOWN) force the gate on via
 * `vi.mock("…/betaSurfaces")`; between the two, both sides of every branch
 * stay covered while the beta flags are off in production.
 */

import {
  COMMERCE_SURFACES_ENABLED,
  LEGAL_SURFACES_ENABLED,
  isHiddenBetaHref,
} from "./betaSurfaces";
import { LegalLinks } from "../legal/LegalLinks";
import {
  SETTINGS_SECTIONS_CATALOG,
  VISIBLE_SETTINGS_SECTIONS,
  settingsSectionTitle,
} from "../hub/settingsSectionsCatalog";
import { RELEASES } from "../whatsNew/releases";
import { SETTINGS_INDEX } from "../hub/search/searchSettings";

describe("beta surface gates (default: hidden)", () => {
  it("both switches default to off when the env vars are unset", () => {
    expect(COMMERCE_SURFACES_ENABLED).toBe(false);
    expect(LEGAL_SURFACES_ENABLED).toBe(false);
  });

  it("renders no legal links anywhere", () => {
    const { container } = render(
      <MemoryRouter>
        <LegalLinks />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
    cleanup();
  });

  it("drops «Підписка та план» from every section list at once", () => {
    const ids = VISIBLE_SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids).not.toContain("plan");
    // The Settings page, the ⌘K palette and the valid-tab-id set all read
    // the same filtered list — a hidden section must not stay searchable.
    expect(SETTINGS_INDEX.map((s) => s.id)).not.toContain("plan");
    // …while the raw catalog stays complete, so the title lookup that other
    // sections rely on keeps resolving instead of throwing.
    expect(SETTINGS_SECTIONS_CATALOG.map((s) => s.id)).toContain("plan");
    expect(settingsSectionTitle("plan")).toBe("Підписка та план");
  });

  it("classifies hrefs into hidden surfaces, including the live release CTA", () => {
    expect(isHiddenBetaHref("/pricing")).toBe(true);
    expect(isHiddenBetaHref("/pricing?source=whats_new")).toBe(true);
    expect(isHiddenBetaHref("/legal/privacy")).toBe(true);
    expect(isHiddenBetaHref("/")).toBe(false);
    expect(isHiddenBetaHref("https://example.com")).toBe(false);

    // Not hypothetical: shipped releases still carry a «Подивитись тарифи» →
    // `/pricing` CTA, so without this the What's New modal would offer users a
    // button straight into a 404. Assert against the whole feed rather than
    // `pickRelease(null)` — the newest entry is incidental content and rotates
    // with every release, while the guard's job does not.
    const ctaHrefs = RELEASES.map((r) => r.cta?.href).filter(
      (href): href is string => href !== undefined,
    );
    // Vacuity guard: if the feed ever loses every CTA, the loop below passes
    // for the wrong reason and this test stops proving anything.
    expect(ctaHrefs).toContain("/pricing");
    for (const href of ctaHrefs) {
      const shouldBeHidden =
        href.startsWith("/pricing") || href.startsWith("/legal/");
      expect(isHiddenBetaHref(href), href).toBe(shouldBeHidden);
    }
  });
});

describe("hidden routes answer 404", () => {
  it("serves the 404 page for /pricing and every /legal/* path", async () => {
    vi.resetModules();
    const { renderStandaloneRoute } = await import("../app/StandaloneRoutes");
    const args = {
      user: null,
      authLoading: false,
      storageReady: true,
      onLeaveAuth: () => {},
      onLeaveWelcome: () => {},
      onOpenAuth: () => {},
      onAssistantClose: () => {},
    };

    for (const pathname of [
      "/pricing",
      "/legal/privacy",
      "/legal/terms",
      "/legal/cookies",
      "/legal/offer",
    ]) {
      const node = renderStandaloneRoute({ ...args, pathname });
      expect(node, `${pathname} must still own a route entry`).not.toBeNull();
      render(<MemoryRouter>{node}</MemoryRouter>);
      expect(
        await screen.findByRole("heading", { name: "Сторінку не знайдено" }),
        `${pathname} must render the 404 page`,
      ).toBeInTheDocument();
      cleanup();
    }
  });
});
