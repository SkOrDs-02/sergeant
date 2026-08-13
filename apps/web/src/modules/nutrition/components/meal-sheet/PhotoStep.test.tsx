// @vitest-environment jsdom
/**
 * Last validated: 2026-08-13
 * Status: Active
 *
 * PhotoStep — гейти авто-аналізу (рішення founder-а 2026-08-13):
 * аналіз стартує сам після вибору/заміни фото, але ТІЛЬКИ коли
 * privacy-нотіс підтверджено і користувач Pro; один запуск на кадр.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { messages } from "@shared/i18n/uk";

import { PhotoStep } from "./PhotoStep";
import { usePhotoAnalysis } from "../../hooks/usePhotoAnalysis";

// ─── Storage chain (уникаємо db-schema imports + контролюємо ack) ──────────
const { storageState } = vi.hoisted(() => ({
  storageState: { privacyAcked: false },
}));
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn((key: string, fallback: unknown) =>
    key === "sergeant.nutrition.photoPrivacyAck.v1"
      ? storageState.privacyAcked
      : fallback,
  ),
  safeWriteLS: vi.fn(() => true),
  safeReadStringLS: vi.fn(() => null),
  safeReadLSValidated: vi.fn(() => null),
  safeRemoveLS: vi.fn(() => true),
  safeListLSKeys: vi.fn(() => []),
  webKVStore: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

// ─── Billing gate — керований isPro ────────────────────────────────────────
const { gateState, requireAccessMock } = vi.hoisted(() => ({
  gateState: { canAccess: true },
  requireAccessMock: vi.fn(() => true),
}));
vi.mock("../../../../core/billing", () => ({
  useFeatureGate: () => ({
    canAccess: gateState.canAccess,
    requireAccess: requireAccessMock,
    paywallOpen: false,
    paywallSurface: "unlimited_ai_photo" as const,
    featureId: "ai-photo-analysis" as const,
    closePaywall: vi.fn(),
  }),
  PaywallModal: () => null,
}));

vi.mock("@shared/i18n/useLocale", () => ({
  useLocale: () => ({ locale: "uk" as const, messages, setLocale: vi.fn() }),
}));

// ─── usePhotoAnalysis — контрольований контролер ───────────────────────────
const { photoState } = vi.hoisted(() => ({
  photoState: {
    photoPreviewUrl: "",
    analyzePhoto: vi.fn(),
  },
}));
vi.mock("../../hooks/usePhotoAnalysis", () => ({
  usePhotoAnalysis: vi.fn(() => ({
    fileRef: { current: null },
    photoPreviewUrl: photoState.photoPreviewUrl,
    photoResult: null,
    lastPhotoPayload: null,
    answers: {},
    setAnswers: vi.fn(),
    portionGrams: "",
    setPortionGrams: vi.fn(),
    onPickPhoto: vi.fn(),
    analyzePhoto: photoState.analyzePhoto,
    refinePhoto: vi.fn(),
    isAnalyzing: false,
    isRefining: false,
  })),
}));

beforeEach(() => {
  storageState.privacyAcked = false;
  gateState.canAccess = true;
  photoState.photoPreviewUrl = "";
  photoState.analyzePhoto = vi.fn();
});

afterEach(() => cleanup());

describe("PhotoStep — auto-analyze gating", () => {
  it("auto-runs analysis once when a photo appears for an acked Pro user", () => {
    storageState.privacyAcked = true;
    photoState.photoPreviewUrl = "blob:photo-1";
    const { rerender } = render(<PhotoStep onApply={vi.fn()} />);
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
    // Ре-рендер без нового кадру не дублює запуск (і не палить квоту).
    rerender(<PhotoStep onApply={vi.fn()} />);
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
  });

  it("re-runs analysis when the photo is replaced (new preview URL)", () => {
    storageState.privacyAcked = true;
    photoState.photoPreviewUrl = "blob:photo-1";
    const { rerender } = render(<PhotoStep onApply={vi.fn()} />);
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
    // «Замінити фото» → новий blob-URL → авто-перезапуск (founder 2026-08-13).
    photoState.photoPreviewUrl = "blob:photo-2";
    rerender(<PhotoStep onApply={vi.fn()} />);
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(2);
  });

  it("does NOT auto-run before the privacy notice is acknowledged", () => {
    // Нотіс просить перевірити кадр ДО відправлення — авто-запуск до
    // «Зрозуміло» зробив би цю перевірку фікцією.
    photoState.photoPreviewUrl = "blob:photo-1";
    render(<PhotoStep onApply={vi.fn()} />);
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
  });

  it("acking the notice with a photo already picked starts the analysis", () => {
    photoState.photoPreviewUrl = "blob:photo-1";
    render(<PhotoStep onApply={vi.fn()} />);
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-run for a Free user — the paywall stays on the explicit tap", () => {
    storageState.privacyAcked = true;
    gateState.canAccess = false;
    photoState.photoPreviewUrl = "blob:photo-1";
    render(<PhotoStep onApply={vi.fn()} />);
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
    // Явний тап «Аналізувати» іде через requireAccess → paywall.
    requireAccessMock.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Аналізувати" }));
    expect(requireAccessMock).toHaveBeenCalled();
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
  });

  it("does NOT auto-run without a photo", () => {
    storageState.privacyAcked = true;
    render(<PhotoStep onApply={vi.fn()} />);
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
  });
});

// Санітарна перевірка, що мок контролера справді підмінив хук.
it("uses the mocked usePhotoAnalysis controller", () => {
  render(<PhotoStep onApply={vi.fn()} />);
  expect(vi.mocked(usePhotoAnalysis)).toHaveBeenCalled();
});
