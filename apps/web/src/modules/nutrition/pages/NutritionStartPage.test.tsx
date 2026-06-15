// @vitest-environment jsdom
//
// audit-08 F12 — NutritionStartPage page-level test coverage.
//
// NutritionStartPage orchestrates:
//   • <NutritionDashboard> — gets log, prefs, callbacks
//   • A collapsible <details> wrapper around <PhotoAnalyzeCard>
//   • useFeatureGate("ai-photo-analysis") — gates analyzePhoto behind Premium
//   • <PaywallModal> bound to gate.paywallOpen / gate.closePaywall
//   • useLocale() — resolves paywall copy
//
// Strategy: vi.mock() both `useFeatureGate` and `useLocale` at the module
// level so the page component never hits real billing queries or localStorage.
// NutritionDashboard and PhotoAnalyzeCard are also mocked so tests stay
// focused on the page's wiring.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { messages } from "@shared/i18n/uk";

import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { usePhotoAnalysis } from "../hooks/usePhotoAnalysis";
import { NutritionStartPage } from "./NutritionStartPage";

// ---------------------------------------------------------------------------
// Break the import chain that leads to @sergeant/db-schema/sqlite (which is
// not built in this worktree environment). The chain is:
//   NutritionStartPage → Icon (via @shared/components/ui/Card)
//     → @shared/lib (barrel) → storage/storage → kvStoreBoot → db-schema
// Mocking storage/storage (and the barrel) prevents vite from resolving the
// unbuilt db-schema package. This mirrors the pattern in analytics.test.ts.
// ---------------------------------------------------------------------------
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(() => null),
  safeWriteLS: vi.fn(() => true),
  safeReadStringLS: vi.fn(() => null),
  safeReadLSValidated: vi.fn(() => null),
  safeRemoveLS: vi.fn(() => true),
  safeListLSKeys: vi.fn(() => []),
  webKVStore: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

// ---------------------------------------------------------------------------
// vi.hoisted — build stable mock references before any import is resolved.
// ---------------------------------------------------------------------------
const { requireAccessMock, closePaywallMock } = vi.hoisted(() => ({
  requireAccessMock: vi.fn(() => true), // default: user is Pro
  closePaywallMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock billing gate — allows controlling isPro per test.
// ---------------------------------------------------------------------------
vi.mock("../../../core/billing", () => ({
  useFeatureGate: () => ({
    canAccess: requireAccessMock.mock.results[0]?.value !== false,
    requireAccess: requireAccessMock,
    paywallOpen: false,
    paywallSurface: "unlimited_ai_photo" as const,
    featureId: "ai-photo-analysis" as const,
    closePaywall: closePaywallMock,
  }),
  PaywallModal: ({
    open,
    title,
    onClose,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button onClick={onClose}>Закрити</button>
      </div>
    ) : null,
}));

// ---------------------------------------------------------------------------
// Mock useLocale — return uk messages directly (no localStorage needed).
// ---------------------------------------------------------------------------
vi.mock("@shared/i18n/useLocale", () => ({
  useLocale: () => ({ locale: "uk" as const, messages, setLocale: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock heavy child components.
// ---------------------------------------------------------------------------
vi.mock("../components/NutritionDashboard", () => ({
  NutritionDashboard: ({
    onGoToLog,
    onGoToDailyPlan,
    onAddMeal,
    onFetchDayHint,
  }: {
    onGoToLog: () => void;
    onGoToDailyPlan: () => void;
    onAddMeal: () => void;
    onFetchDayHint: () => void;
  }) => (
    <div data-testid="nutrition-dashboard">
      <button onClick={onGoToLog}>До щоденника</button>
      <button onClick={onGoToDailyPlan}>До плану</button>
      <button onClick={onAddMeal}>Додати прийом їжі</button>
      <button onClick={onFetchDayHint}>Підказка дня</button>
    </div>
  ),
}));

vi.mock("../components/PhotoAnalyzeCard", () => ({
  PhotoAnalyzeCard: ({ analyzePhoto }: { analyzePhoto: () => void }) => (
    <div data-testid="photo-analyze-card">
      <button onClick={analyzePhoto}>Аналізувати фото</button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMPTY_PREFS: NutritionPrefs = {} as NutritionPrefs;

function makeLog(
  override?: Partial<ReturnType<typeof useNutritionLog>>,
): ReturnType<typeof useNutritionLog> {
  return {
    nutritionLog: {},
    setNutritionLog: vi.fn(),
    selectedDate: "2025-01-01",
    setSelectedDate: vi.fn(),
    addMealSheetOpen: false,
    setAddMealSheetOpen: vi.fn(),
    addMealPhotoResult: null,
    setAddMealPhotoResult: vi.fn(),
    handleAddMeal: vi.fn(),
    handleEditMeal: vi.fn(),
    handleRemoveMeal: vi.fn(),
    handleRestoreMeal: vi.fn(),
    storageErr: "",
    duplicateYesterday: vi.fn(),
    replaceLogFromJsonText: vi.fn(),
    mergeLogFromJsonText: vi.fn(),
    trimLogToLastDays: vi.fn(),
    ...override,
  } as ReturnType<typeof useNutritionLog>;
}

function makePhoto(
  override?: Partial<ReturnType<typeof usePhotoAnalysis>>,
): ReturnType<typeof usePhotoAnalysis> {
  return {
    fileRef: { current: null },
    photoPreviewUrl: "",
    photoResult: null,
    lastPhotoPayload: null,
    answers: {},
    setAnswers: vi.fn(),
    portionGrams: "",
    setPortionGrams: vi.fn(),
    onPickPhoto: vi.fn(),
    analyzePhoto: vi.fn(),
    refinePhoto: vi.fn(),
    ...override,
  } as ReturnType<typeof usePhotoAnalysis>;
}

function renderStartPage(
  overrides: {
    log?: Partial<ReturnType<typeof useNutritionLog>>;
    photo?: Partial<ReturnType<typeof usePhotoAnalysis>>;
    setActivePageAndHash?: (page: string) => void;
    onRequestAddMeal?: () => void;
    photoCardForceOpen?: boolean;
  } = {},
) {
  const log = makeLog(overrides.log);
  const photo = makePhoto(overrides.photo);
  const setActivePageAndHash = overrides.setActivePageAndHash ?? vi.fn();
  const onRequestAddMeal = overrides.onRequestAddMeal ?? vi.fn();

  render(
    <NutritionStartPage
      log={log}
      photo={photo}
      prefs={EMPTY_PREFS}
      busy={false}
      setActivePageAndHash={
        setActivePageAndHash as (
          page: import("../lib/nutritionRouter").NutritionPage,
        ) => void
      }
      fetchDayHint={vi.fn()}
      dayHintText=""
      dayHintBusy={false}
      onRequestAddMeal={onRequestAddMeal}
      photoCardForceOpen={overrides.photoCardForceOpen ?? false}
      setPhotoCardForceOpen={vi.fn()}
      onSaveToLog={vi.fn()}
    />,
  );

  return { log, photo, setActivePageAndHash, onRequestAddMeal };
}

afterEach(() => {
  cleanup();
  requireAccessMock.mockReset();
  requireAccessMock.mockReturnValue(true);
  closePaywallMock.mockReset();
});

describe("NutritionStartPage", () => {
  it("renders without crashing — shows NutritionDashboard and the photo-analyze collapsible", () => {
    renderStartPage();
    expect(screen.getByTestId("nutrition-dashboard")).toBeTruthy();
    // The summary card for the collapsible section is always visible
    expect(screen.getByText("Аналіз фото страви")).toBeTruthy();
  });

  it("'До щоденника' button calls setActivePageAndHash('log')", async () => {
    const setActivePageAndHash = vi.fn();
    renderStartPage({ setActivePageAndHash });

    await userEvent.click(screen.getByRole("button", { name: "До щоденника" }));
    expect(setActivePageAndHash).toHaveBeenCalledWith("log");
  });

  it("'До плану' button calls setActivePageAndHash('menu')", async () => {
    const setActivePageAndHash = vi.fn();
    renderStartPage({ setActivePageAndHash });

    await userEvent.click(screen.getByRole("button", { name: "До плану" }));
    expect(setActivePageAndHash).toHaveBeenCalledWith("menu");
  });

  it("'Додати прийом їжі' delegates to onRequestAddMeal (parent owns navigate + sheet-open)", async () => {
    // F13: the page no longer owns the date-set / navigate / setTimeout
    // sheet-open dance. It just requests the action; NutritionApp drives the
    // deterministic, effect-based follow-up once the Log page has mounted.
    const onRequestAddMeal = vi.fn();

    renderStartPage({ onRequestAddMeal });

    await userEvent.click(
      screen.getByRole("button", { name: "Додати прийом їжі" }),
    );

    expect(onRequestAddMeal).toHaveBeenCalledTimes(1);
  });

  it("when user is Pro, clicking 'Аналізувати фото' calls photo.analyzePhoto", async () => {
    requireAccessMock.mockReturnValue(true);
    const analyzePhoto = vi.fn();

    renderStartPage({ photo: { analyzePhoto }, photoCardForceOpen: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Аналізувати фото" }),
    );

    expect(requireAccessMock).toHaveBeenCalledTimes(1);
    expect(analyzePhoto).toHaveBeenCalledTimes(1);
  });

  it("when user is Free (requireAccess returns false), analyzePhoto is NOT called", async () => {
    requireAccessMock.mockReturnValue(false);
    const analyzePhoto = vi.fn();

    renderStartPage({ photo: { analyzePhoto }, photoCardForceOpen: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Аналізувати фото" }),
    );

    expect(requireAccessMock).toHaveBeenCalledTimes(1);
    expect(analyzePhoto).not.toHaveBeenCalled();
  });

  it("PhotoAnalyzeCard is inside a collapsible <details> — hidden when collapsed, visible when open", () => {
    renderStartPage({ photoCardForceOpen: false });

    // The details element is closed by default — PhotoAnalyzeCard stub IS in
    // the DOM (details renders children regardless), but the card itself
    // is not visually expanded. We assert the testid exists but the
    // <details> is not `open`.
    const detailsEl = document.querySelector("details");
    expect(detailsEl).toBeTruthy();
    expect(detailsEl!.hasAttribute("open")).toBe(false);
  });

  it("photoCardForceOpen=true sets the <details> open attribute", () => {
    renderStartPage({ photoCardForceOpen: true });
    const detailsEl = document.querySelector("details");
    expect(detailsEl).toBeTruthy();
    expect(detailsEl!.hasAttribute("open")).toBe(true);
  });
});
