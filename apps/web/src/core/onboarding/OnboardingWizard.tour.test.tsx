// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  ONBOARDING_HERO_COPY_EXPERIMENT,
  overrideVariant,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { OnboardingWizard } from "./OnboardingWizard";

/**
 * Tour mode (S4.5) covers the read-only replay launched from
 * Settings → "Подивитись tour". The contract is that the wizard
 * never touches the user's onboarding / first-action / vibe-picks
 * state and never fires the FTUX-funnel events.
 */
describe("OnboardingWizard — tour mode (read-only replay)", () => {
  // The repo's vitest setup does not auto-cleanup RTL renders; mount
  // hygiene is handled per-file (see NoBankBanner.test.tsx).
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not persist picks to localStorage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<OnboardingWizard mode="tour" onDone={() => {}} />);
    // The wizard should not write any of the FTUX persistence keys
    // while running in tour mode.
    const writtenKeys = setItem.mock.calls.map(([k]) => String(k));
    expect(writtenKeys).not.toContain("sergeant.onboarding.wizardState.v2");
    expect(writtenKeys).not.toContain("hub_onboarding_done_v1");
    expect(writtenKeys.some((k) => k.startsWith("sergeant.vibePicks"))).toBe(
      false,
    );
  });

  it("does not mark onboarding done or change first-action state on close", () => {
    const onDone = vi.fn();
    render(<OnboardingWizard mode="tour" onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /Закрити/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    // Critical: tour finish must hand back `null` start module + intent
    // tagged as `tour_replay`, never `vibe_picked` / `vibe_empty` (those
    // labels feed the real activation funnel).
    expect(onDone).toHaveBeenCalledWith(null, {
      intent: "tour_replay",
      picks: [],
    });
    expect(localStorage.getItem("hub_onboarding_done_v1")).toBeNull();
    expect(
      localStorage.getItem("sergeant.onboarding.wizardState.v2"),
    ).toBeNull();
  });

  it("renders the «Закрити» CTA instead of the experiment-arm CTA", () => {
    render(<OnboardingWizard mode="tour" onDone={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Закрити/i }),
    ).toBeInTheDocument();
    // Tour mode must override `copy.primaryCta` so the user always sees
    // «Закрити» regardless of which hero variant is assigned.
    expect(
      screen.queryByRole("button", { name: /Розпочати/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Відкрити Sergeant/i }),
    ).not.toBeInTheDocument();
  });

  it("modal dialog is vertically scrollable with a fixed (non-scrolling) backdrop", () => {
    // Audit-guard for the 2026-05-08 fix. Раніше модалка була
    // `fixed inset-0 ... flex items-end sm:items-center` без
    // `overflow-y-auto`, а backdrop сидів у тому ж flex-контейнері
    // через `absolute inset-0`. Коли користувач у Settings →
    // «Подивитись tour» розгортав модулі через «Що це за розділи?»,
    // картка ставала вищою за viewport і обрізалась і зверху
    // (логотип), і знизу — без можливості прокрутки дістатись до
    // CTA / тогл-кнопки «Згорнути». Регресія легко повертається
    // зворотнім рефакторингом, тож структуру фіксуємо тестом, а не
    // коментарем.
    render(<OnboardingWizard mode="tour" onDone={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: /Вітальний екран/i });
    expect(dialog.className).toMatch(/\boverflow-y-auto\b/);
    // The backdrop is a sibling rendered first, with `aria-hidden`,
    // and it must be `fixed` (not `absolute`) so it stays anchored to
    // the viewport while the dialog scroll-layer slides under it.
    const backdrop = dialog.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toMatch(/\bfixed\b/);
    expect(backdrop?.className).toMatch(/\binset-0\b/);
  });

  it("default mode renders the outcome-variant CTA (mainline post-S1.1)", () => {
    // PR-04 bumped the experiment to v2 (4-way split, weights [0.4, 0.2,
    // 0.2, 0.2]) so a fresh fingerprint can land on any arm. Pin the
    // outcome arm explicitly so this test asserts what it claims to —
    // that the CTA copy is wired up — instead of relying on a 100% lock.
    overrideVariant(webKVStore, ONBOARDING_HERO_COPY_EXPERIMENT.id, "outcome");
    render(<OnboardingWizard onDone={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Розпочати/i }),
    ).toBeInTheDocument();
    // Audit-guard — the pre-S1.1 «Відкрити Sergeant» CTA must not
    // resurrect from a stale assignment or a forgotten code path.
    expect(
      screen.queryByRole("button", { name: /Відкрити Sergeant/i }),
    ).not.toBeInTheDocument();
  });
});
