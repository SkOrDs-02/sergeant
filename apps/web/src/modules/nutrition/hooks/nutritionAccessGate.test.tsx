// @vitest-environment jsdom
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * A3, поставка 2 — доказ, що гейт СТОЇТЬ, а не просто існує.
 *
 * Решта сюїт цих хуків гейт мокає (вони про потік даних і живуть без
 * `AuthProvider`). Саме тому потрібен окремий файл: інакше «pre-gate є»
 * підтверджувалось би лише тим, що його ніде не видно.
 */
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useNutritionCloudBackup } from "./useNutritionCloudBackup";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function harness() {
  const setBackupPasswordDialog = vi.fn();
  const setDenial = vi.fn();
  const { result } = renderHook(
    () =>
      useNutritionCloudBackup({
        toast: { success: vi.fn(), error: vi.fn() },
        setErr: vi.fn(),
        setDenial,
        cloudBackupBusy: false,
        setCloudBackupBusy: vi.fn(),
        backupPasswordDialog: null,
        setBackupPasswordDialog,
        setRestoreConfirm: vi.fn(),
      }),
    { wrapper: makeWrapper() },
  );
  return { result, setBackupPasswordDialog, setDenial };
}

describe("nutrition pre-gate (анонім)", () => {
  it("does not even ask for a backup password when there is no account", () => {
    // Головне тут — `setBackupPasswordDialog` НЕ викликано. Придумати
    // пароль шифрування, щоб отримати 401 наступним кроком, — це рівно
    // та «запізніла заборона», з якої почався пункт A3.
    const { result, setBackupPasswordDialog, setDenial } = harness();
    result.current.uploadCloudBackup();
    expect(setBackupPasswordDialog).not.toHaveBeenCalled();
    expect(setDenial).toHaveBeenCalledWith({ reason: "sign-in-required" });
  });

  it("blocks the restore side too, not just the upload side", () => {
    const { result, setBackupPasswordDialog, setDenial } = harness();
    result.current.downloadCloudBackup();
    expect(setBackupPasswordDialog).not.toHaveBeenCalled();
    expect(setDenial).toHaveBeenCalledWith({ reason: "sign-in-required" });
  });
});
