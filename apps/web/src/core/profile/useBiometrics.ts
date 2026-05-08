/**
 * React adapter around `apps/web/src/core/profile/biometrics.ts` —
 * exposes a memoized snapshot of the biometric record plus typed
 * setters for the form to call. Subscribes to `webKVStore.onChange`
 * so the component re-renders when:
 *
 *   - another tab edits biometrics (`BroadcastChannel("kv-store")`),
 *   - CloudSync pulls a remote write into the local KV store,
 *   - Fizruk Body's `useDailyLog.addEntry` mirrors a weigh-in into
 *     biometrics via `mirrorWeightToBiometrics`.
 *
 * `saveBiometrics` only touches `hub_biometrics_v1`. The
 * Profile→Fizruk weight mirror lives in `BiometricsSection`
 * (calls `useDailyLog.addEntry`) so the cross-module dual-write
 * goes through the canonical fizruk hook — see the module comment
 * in `biometrics.ts` for the full sync contract.
 */
import { useCallback, useEffect, useState } from "react";
import { webKVStore } from "@shared/lib/storage/storage";
import {
  BIOMETRICS_KEY,
  readBiometrics,
  subscribeBiometrics,
  writeBiometricsPatch,
  type Biometrics,
} from "./biometrics";

export interface UseBiometricsResult {
  biometrics: Biometrics;
  /**
   * Persist the supplied subset of biometrics. The helper auto-bumps
   * `updatedAt` (and `weightUpdatedAt` when `weightKg` is part of the
   * patch). Returns the merged record so callers can show toasts /
   * derive UI state from the freshly written value.
   */
  saveBiometrics: (
    next: Partial<Omit<Biometrics, "updatedAt" | "weightUpdatedAt">>,
  ) => Biometrics;
}

export function useBiometrics(): UseBiometricsResult {
  const [biometrics, setBiometrics] = useState<Biometrics>(() =>
    readBiometrics(),
  );

  useEffect(() => {
    const unsubLocal = subscribeBiometrics((next) => {
      setBiometrics(next);
    });
    const unsubKv = webKVStore.onChange(BIOMETRICS_KEY, () => {
      setBiometrics(readBiometrics());
    });
    return () => {
      unsubLocal();
      unsubKv();
    };
  }, []);

  const saveBiometrics = useCallback<UseBiometricsResult["saveBiometrics"]>(
    (next) => {
      const merged = writeBiometricsPatch(next);
      setBiometrics(merged);
      return merged;
    },
    [],
  );

  return { biometrics, saveBiometrics };
}
