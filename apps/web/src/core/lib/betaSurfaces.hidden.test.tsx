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
} from "./betaSurfaces";
import { LegalLinks } from "../legal/LegalLinks";
import {
  SETTINGS_SECTIONS_CATALOG,
  VISIBLE_SETTINGS_SECTIONS,
  settingsSectionTitle,
} from "../hub/settingsSectionsCatalog";
import { RELEASES, pickRelease } from "../whatsNew/releases";
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

  it("never surfaces a release CTA pointing at the hidden tariffs page", () => {
    const release = pickRelease(null);
    expect(release).not.toBeNull();
    // The archive still holds a `Подивитись тарифи` → `/pricing` CTA on an
    // older entry. `pickRelease` only ever returns the newest release, so
    // that one is already unreachable — the guard in the selector is there
    // so a future release note (or a reorder of the archive) cannot quietly
    // put a dead link back in front of users.
    expect(release?.cta?.href ?? "").not.toMatch(/^\/pricing/);
    expect(
      RELEASES.some((r) => r.cta?.href.startsWith("/pricing")),
      "archive still carries the historical /pricing CTA the guard exists for",
    ).toBe(true);
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
