// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  overrideVariant,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

import { OnboardingWizard } from "./OnboardingWizard";

/**
 * S6.1 — opt-in module selection (none by default).
 *
 * The new behaviour ships behind the
 * `onboarding_default_picks_v1` A/B (50/50). Tests force each arm
 * deterministically via `overrideVariant` so we can assert the
 * branch-specific contract (CTA disabled vs. legacy ALL fallback)
 * without depending on the random fingerprint.
 *
 * Hero copy is also pinned to the `outcome` arm because all
 * assertions match the «Розпочати …» CTA, which is shared by the
 * outcome / safe / disciplined arms but NOT by `bold` (which uses
 * «Спробувати …»). Without the pin, the v2 4-way split (PR-04)
 * would make a 20% of runs flake on the bold arm.
 */
describe("OnboardingWizard — S6.1 default-picks A/B", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
  });

  describe("`none` arm (opt-in, new behaviour)", () => {
    beforeEach(() => {
      overrideVariant(
        webKVStore,
        ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id,
        "none",
      );
    });

    it("starts with no module pre-selected and disables the primary CTA", () => {
      render(<OnboardingWizard onDone={() => {}} />);

      // Primary CTA («Розпочати — 30 секунд» on the outcome arm) is
      // disabled until the user picks ≥1 module.
      const cta = screen.getByRole("button", { name: /Розпочати/i });
      expect(cta).toBeDisabled();

      // Inline hint must be visible so the user understands why the
      // CTA is inactive. The exact phrasing is part of the audit-guard
      // contract — see `audit-guard` block below.
      expect(screen.getByText("Обери хоч один модуль")).toBeInTheDocument();
    });

    it("does not write `vibePicks` when finish() is called with empty picks", () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const onDone = vi.fn();
      render(<OnboardingWizard onDone={onDone} />);

      // The CTA is disabled in DOM, but defensive-test it against a
      // programmatic click bypass — finish() must short-circuit
      // before saving picks or marking onboarding done.
      const cta = screen.getByRole("button", { name: /Розпочати/i });
      fireEvent.click(cta);

      expect(onDone).not.toHaveBeenCalled();
      const writtenKeys = setItem.mock.calls.map(([k]) => String(k));
      expect(writtenKeys).not.toContain("hub_onboarding_done_v1");
      expect(writtenKeys.some((k) => k.startsWith("sergeant.vibePicks"))).toBe(
        false,
      );
    });

    it("enables the CTA after the user picks at least one module", () => {
      render(<OnboardingWizard onDone={() => {}} />);

      // Pick the first module row. Module rows are rendered as buttons
      // inside `WelcomeOneScreen`, labelled by module name.
      const finykRow = screen.getByRole("button", { name: /Фінік/i });
      fireEvent.click(finykRow);

      const cta = screen.getByRole("button", { name: /Розпочати/i });
      expect(cta).not.toBeDisabled();
      expect(
        screen.queryByText("Обери хоч один модуль"),
      ).not.toBeInTheDocument();
    });
  });

  describe("`all` arm (legacy fallback)", () => {
    beforeEach(() => {
      overrideVariant(
        webKVStore,
        ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id,
        "all",
      );
    });

    it("CTA stays enabled because every module is pre-selected", () => {
      render(<OnboardingWizard onDone={() => {}} />);
      const cta = screen.getByRole("button", { name: /Розпочати/i });
      expect(cta).not.toBeDisabled();
      // Hint never renders in the legacy arm.
      expect(
        screen.queryByText("Обери хоч один модуль"),
      ).not.toBeInTheDocument();
    });
  });
});

describe("S6.1 audit-guard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    overrideVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id, "none");
  });

  it("inline hint copy is the exact audit-spec phrasing", () => {
    render(<OnboardingWizard onDone={() => {}} />);
    // The plan (`docs/launch/ftux-sprint-plan.md` §S6.1 / B-1)
    // pins this copy. Drift here would silently downgrade the
    // commitment-affordance the audit hypothesis depends on.
    expect(screen.getByText("Обери хоч один модуль")).toBeInTheDocument();
    // Block resurrection of the pre-S6.1 «Без вибору — всі 4 модулі»
    // copy that effectively told the user "you can skip this".
    expect(
      screen.queryByText(/Без вибору — всі 4 модулі/i),
    ).not.toBeInTheDocument();
  });
});
