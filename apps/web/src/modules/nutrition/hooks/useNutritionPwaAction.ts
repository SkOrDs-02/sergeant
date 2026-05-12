import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { NutritionPage } from "../lib/nutritionRouter";
import type { useNutritionLog } from "./useNutritionLog";
import type { usePhotoAnalysis } from "./usePhotoAnalysis";

type LogController = ReturnType<typeof useNutritionLog>;
type PhotoController = ReturnType<typeof usePhotoAnalysis>;

interface UseNutritionPwaActionArgs {
  pwaAction?: string | null;
  log: LogController;
  photo: PhotoController;
  setActivePageAndHash: (page: NutritionPage) => void;
  setPhotoCardForceOpen: Dispatch<SetStateAction<boolean>>;
  onPwaActionConsumed?: () => void;
}

/**
 * Reacts to the `pwaAction` prop from the PWA shell:
 * - `add_meal` → route to «Щоденник» and open the AddMealSheet.
 * - `add_meal_photo` → route to «Старт», force the photo disclosure open
 *   and pop the native file picker (RAF + 80 ms fallback for mobile).
 *
 * Cleans up RAF / timeout when the effect tears down so a slow PWA
 * navigation can't dangling-click a torn-down file input.
 */
export function useNutritionPwaAction({
  pwaAction,
  log,
  photo,
  setActivePageAndHash,
  setPhotoCardForceOpen,
  onPwaActionConsumed,
}: UseNutritionPwaActionArgs): void {
  useEffect(() => {
    if (pwaAction === "add_meal") {
      setActivePageAndHash("log");
      log.setAddMealSheetOpen(true);
      onPwaActionConsumed?.();
      return undefined;
    }
    if (pwaAction === "add_meal_photo") {
      setActivePageAndHash("start");
      setPhotoCardForceOpen(true);
      const raf = requestAnimationFrame(() => {
        try {
          photo.fileRef.current?.click();
        } catch {
          /* noop — picker may be blocked without a user gesture */
        }
      });
      const fallback = window.setTimeout(() => {
        try {
          photo.fileRef.current?.click();
        } catch {
          /* noop */
        }
      }, 80);
      onPwaActionConsumed?.();
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(fallback);
      };
    }
    return undefined;
    // `photo.fileRef` is a stable ref; `setPhotoCardForceOpen` is a setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, onPwaActionConsumed, pwaAction]);
}
