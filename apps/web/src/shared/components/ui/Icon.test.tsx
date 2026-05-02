/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
  CAPABILITY_MODULE_ORDER,
} from "@sergeant/shared";
import { ICON_NAMES } from "./Icon";

// AI-CONTEXT: the Assistant Catalogue references icons by string name. When
// PATHS lacks an entry the <Icon> component silently renders nothing — the
// catalogue card then shows an empty circle with no glyph (#bug). Lock
// catalogue ↔ icon-set coverage so adding a capability without its glyph
// fails CI instead of shipping a half-rendered card.
describe("Icon coverage for Assistant Catalogue", () => {
  const known = new Set(ICON_NAMES);

  it("registers an SVG path for every CAPABILITY_MODULE_META.icon", () => {
    const missing = CAPABILITY_MODULE_ORDER.filter(
      (m) => !known.has(CAPABILITY_MODULE_META[m].icon),
    ).map((m) => `${m} → "${CAPABILITY_MODULE_META[m].icon}"`);
    expect(missing).toEqual([]);
  });

  it("registers an SVG path for every AssistantCapability.icon", () => {
    const missing = ASSISTANT_CAPABILITIES.filter(
      (c) => !known.has(c.icon),
    ).map((c) => `${c.id} → "${c.icon}"`);
    expect(missing).toEqual([]);
  });

  // Icons that AssistantCataloguePage / CapabilityDetailModal hard-code in
  // JSX (search field, row trailing chevron/send, legend chips). Keep this
  // list in sync with those files; the type signature accepts arbitrary
  // strings so the compiler will not catch a typo here.
  const CATALOGUE_HARDCODED_ICONS = [
    "chevron-left",
    "chevron-right",
    "chevron-down",
    "chevron-up",
    "search",
    "send",
    "sparkles",
    "zap",
    "alert-triangle",
  ];

  it("registers an SVG path for every catalogue UI hard-coded icon", () => {
    const missing = CATALOGUE_HARDCODED_ICONS.filter((n) => !known.has(n));
    expect(missing).toEqual([]);
  });

  it("registers an SVG path for onboarding UI hard-coded icons", () => {
    const missing = ["list-checks"].filter((n) => !known.has(n));
    expect(missing).toEqual([]);
  });
});
