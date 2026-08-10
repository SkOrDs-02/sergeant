/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meal } from "@sergeant/nutrition-domain";
import { useQuickAddMealFromChip } from "./hooks/useQuickAddMealFromChip";
import {
  SkeletonMealCard,
  SkeletonText,
  Skeleton,
} from "@shared/components/ui/Skeleton";
import type { DataStateQueryLike } from "@shared/components/ui/DataState";
import type { NutritionDayPlan } from "./hooks/useNutritionUiState";
import { NutritionHeader } from "./components/NutritionHeader";
import { NutritionBottomNav } from "./components/NutritionBottomNav";
import { NutritionPantrySelector } from "./components/NutritionPantrySelector";
import { NutritionOverlays } from "./components/NutritionOverlays";
import { NutritionStartPage } from "./pages/NutritionStartPage";
import { NutritionPantryPage } from "./pages/NutritionPantryPage";
import { NutritionLogPage } from "./pages/NutritionLogPage";
import { NutritionMenuPage } from "./pages/NutritionMenuPage";
import { Banner } from "@shared/components/ui/Banner";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import {
  MeshBackground,
  ModuleAccentProvider,
} from "@shared/components/layout";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { useCloudPullPending } from "@shared/hooks/useCloudPullPending";
import { useQueryClient } from "@tanstack/react-query";
import { nutritionKeys } from "@shared/lib/api/queryKeys";
import { useNutritionPantries } from "./hooks/useNutritionPantries";
import { useNutritionLog } from "./hooks/useNutritionLog";
import { useNutritionDualWriteBoot } from "./hooks/useNutritionDualWriteBoot";
import { useNutritionSqliteReadBoot } from "./hooks/useNutritionSqliteReadBoot";
import { useNutritionSqliteReadTick } from "./lib/sqliteReadGate";
import { usePhotoAnalysis } from "./hooks/usePhotoAnalysis";
import { useShoppingList } from "./hooks/useShoppingList";
import { useNutritionUiState } from "./hooks/useNutritionUiState";
import { useNutritionRoute } from "./hooks/useNutritionRoute";
import type {
  NutritionPage,
  PantrySubTab,
  MenuSubTab,
} from "./lib/nutritionRouter";
import { useNutritionReminders } from "./hooks/useNutritionReminders";
import { usePantryBarcodeScan } from "./hooks/usePantryBarcodeScan";
import { useNutritionCloudBackup } from "./hooks/useNutritionCloudBackup";
import { useNutritionRemoteActions } from "./hooks/useNutritionRemoteActions";
import { useNutritionPwaAction } from "./hooks/useNutritionPwaAction";
import { useNutritionRecipeCache } from "./hooks/useNutritionRecipeCache";
import { useNutritionPrefsState } from "./hooks/useNutritionPrefsState";
import { useNutritionQuickStatsWriter } from "./hooks/useNutritionQuickStatsWriter";
import { buildRecipeCacheKey, readRecipeCache } from "./lib/recipeCache";
import { fileToThumbnailBlob, saveMealThumbnail } from "./lib/mealPhotoStorage";
import { todayISODate } from "./lib/nutritionFormat";
import { useToast } from "@shared/hooks/useToast";
import { useNutritionFirstRun } from "./hooks/useNutritionFirstRun";

interface NutritionAppProps {
  onBackToHub?: () => void;
  onGoToHub?: () => void;
  onOpenSettings?: () => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

// One-shot imperative follow-ups that must run *after* a page/state change has
// committed. Resolved by effects keyed on the relevant page/state, not timers.
type PendingNutritionAction =
  { kind: "open-add-meal" } | { kind: "open-photo-picker" } | null;

export default function NutritionApp({
  onBackToHub,
  onGoToHub,
  onOpenSettings,
  pwaAction,
  onPwaActionConsumed,
}: NutritionAppProps = {}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [statusText, setStatusText] = useState("");

  // Stage 4 PR #032 / #033: install the dual-write context and warm
  // the SQLite read cache once auth is known; both are no-ops when
  // the corresponding flags are off.
  useNutritionDualWriteBoot();
  useNutritionSqliteReadBoot();

  const {
    activePage,
    setActivePageAndHash: setActivePageAndHashRaw,
    pantrySubTab,
    menuSubTab,
    setPantrySubTab: setPantrySubTabRaw,
    setMenuSubTab: setMenuSubTabRaw,
  } = useNutritionRoute();
  const setActivePageAndHash = useCallback(
    (...args: Parameters<typeof setActivePageAndHashRaw>) => {
      setErr("");
      setActivePageAndHashRaw(...args);
    },
    [setActivePageAndHashRaw],
  );
  const setPantrySubTab = useCallback(
    (...args: Parameters<typeof setPantrySubTabRaw>) => {
      setErr("");
      setPantrySubTabRaw(...args);
    },
    [setPantrySubTabRaw],
  );
  const setMenuSubTab = useCallback(
    (...args: Parameters<typeof setMenuSubTabRaw>) => {
      setErr("");
      setMenuSubTabRaw(...args);
    },
    [setMenuSubTabRaw],
  );

  const {
    firstRunNutritionActive,
    markNutritionSeen,
    setFirstRunNutritionSurface,
  } = useNutritionFirstRun({
    activePage,
    menuSubTab,
    pwaAction,
    setActivePageAndHash,
    setMenuSubTab,
  });

  const pantry = useNutritionPantries({ setBusy, setErr, setStatusText });
  const log = useNutritionLog();
  const ui = useNutritionUiState();
  const photo = usePhotoAnalysis({ setBusy, setErr, setStatusText });
  const shopping = useShoppingList();

  // When the photo-first FTUX CTA lands us here (#S0.3), we force the
  // "Аналіз фото страви" disclosure open and pop the native file picker
  // on the next frame — no extra "Звідки страва?" detour.
  const [photoCardForceOpen, setPhotoCardForceOpen] = useState(false);

  // AI-CONTEXT: Cross-page imperative follow-ups (open the add-meal sheet
  // once the Log page is mounted, pop the file picker once the Start page's
  // PhotoAnalyzeCard is force-open) are driven by this pending-action state
  // machine instead of `setTimeout` timing-guesses. An effect fires the
  // follow-up deterministically when the target page/state has committed,
  // then clears the action — no race on cold-load / low-end devices
  // (page-audit-08 F13). The single rAF handle is cleared on unmount so a
  // late `.click()` never touches a torn-down input.
  const [pendingAction, setPendingAction] =
    useState<PendingNutritionAction>(null);
  const pendingRafRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
        pendingRafRef.current = null;
      }
    };
  }, []);

  useNutritionPwaAction({
    pwaAction,
    log,
    photo,
    setActivePageAndHash,
    setPhotoCardForceOpen,
    onPwaActionConsumed,
  });

  const sqliteCacheTick = useNutritionSqliteReadTick();
  const { prefs, setPrefs, prefsStorageErr } =
    useNutritionPrefsState(sqliteCacheTick);
  // Keep the Hub nutrition bento card's quick-stats snapshot in sync with
  // real meals/goal, not just the onboarding demo seed.
  useNutritionQuickStatsWriter({ log: log.nutritionLog, prefs });

  const {
    editingMeal,
    setEditingMeal,
    recipes,
    setRecipes,
    recipesTried,
    setRecipesTried,
    recipesRaw,
    setRecipesRaw,
    weekPlan,
    setWeekPlan,
    weekPlanRaw,
    setWeekPlanRaw,
    weekPlanBusy,
    setWeekPlanBusy,
    dayPlan,
    setDayPlan,
    dayPlanBusy,
    setDayPlanBusy,
    shoppingBusy,
    setShoppingBusy,
    dayHintText,
    setDayHintText,
    dayHintBusy,
    setDayHintBusy,
    cloudBackupBusy,
    setCloudBackupBusy,
    backupPasswordDialog,
    setBackupPasswordDialog,
    restoreConfirm,
    setRestoreConfirm,
    pantryScannerOpen,
    setPantryScannerOpen,
    pantryScanStatus,
    setPantryScanStatus,
  } = ui;

  const recipeCacheKey = useMemo(
    () =>
      buildRecipeCacheKey(pantry.activePantryId, pantry.effectiveItems, {
        goal: prefs.goal,
        servings: prefs.servings,
        timeMinutes: prefs.timeMinutes,
        exclude: prefs.exclude,
      }),
    [
      pantry.activePantryId,
      pantry.effectiveItems,
      prefs.goal,
      prefs.servings,
      prefs.timeMinutes,
      prefs.exclude,
    ],
  );

  useNutritionRecipeCache({
    activePage,
    menuSubTab,
    recipeCacheKey,
    setRecipes,
    setRecipesRaw,
    setRecipesTried,
  });

  useNutritionReminders(prefs);

  const handleSaveToLog = () => {
    log.setAddMealPhotoResult(photo.photoResult);
    log.setAddMealSheetOpen(true);
  };

  // FAB (fab-and-manual-income spec §5): єдина точка входу для «додати
  // прийом їжі», уніфікована з рештою модулів. Скидає edit-стан, щоб
  // sheet завжди відкривався у create-режимі.
  const handleOpenAddMeal = useCallback(() => {
    setEditingMeal(null);
    log.setAddMealPhotoResult(null);
    log.setAddMealSheetOpen(true);
  }, [log, setEditingMeal]);

  // "Додати прийом їжі" from the Start dashboard: jump to today + Log page,
  // then open the add-meal sheet once that page has mounted. We request the
  // follow-up here and let the effect below fire it when `activePage` becomes
  // "log" — no timing guess (page-audit-08 F13).
  const handleRequestAddMeal = useCallback(() => {
    log.setSelectedDate(todayISODate());
    setActivePageAndHash("log");
    setPendingAction({ kind: "open-add-meal" });
  }, [log, setActivePageAndHash]);

  // Resolve "open-add-meal" deterministically once the Log page is committed.
  const [prevPendingAddMeal, setPrevPendingAddMeal] =
    useState<PendingNutritionAction>(null);
  if (
    pendingAction?.kind === "open-add-meal" &&
    activePage === "log" &&
    pendingAction !== prevPendingAddMeal
  ) {
    setPrevPendingAddMeal(pendingAction);
    log.setAddMealPhotoResult(null);
    log.setAddMealSheetOpen(true);
    setPendingAction(null);
  }

  // Resolve "open-photo-picker" once the Start page + force-open disclosure
  // have committed. One rAF lets the freshly-mounted <input> paint before we
  // synthesise the click; the handle is cleared on unmount (effect above).
  const [photoPickerTick, setPhotoPickerTick] = useState(0);
  const [prevPendingPhotoPicker, setPrevPendingPhotoPicker] =
    useState<PendingNutritionAction>(null);
  if (
    pendingAction?.kind === "open-photo-picker" &&
    activePage === "start" &&
    photoCardForceOpen &&
    pendingAction !== prevPendingPhotoPicker
  ) {
    setPrevPendingPhotoPicker(pendingAction);
    setPendingAction(null);
    setPhotoPickerTick((t) => t + 1);
  }
  useEffect(() => {
    if (photoPickerTick === 0) return;
    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      try {
        photo.fileRef.current?.click();
      } catch {
        /* noop — picker may be blocked without a user gesture */
      }
    });
    return () => {
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
        pendingRafRef.current = null;
      }
    };
  }, [photoPickerTick, photo.fileRef]);

  // Requested from inside AddMealSheet's source-step (S13). Close the
  // sheet, route to the Start page where PhotoAnalyzeCard lives, force
  // the disclosure open and pop the native file picker — mirrors the
  // `add_meal_photo` PWA shortcut so there's a single path for "дати
  // фото" regardless of where the user starts.
  const handleRequestMealPhoto = () => {
    log.setAddMealSheetOpen(false);
    log.setAddMealPhotoResult(null);
    setEditingMeal(null);
    setActivePageAndHash("start");
    setPhotoCardForceOpen(true);
    // The file picker is popped by the effect below once the Start page +
    // force-open disclosure have actually committed (deterministic, no 80ms
    // guess — see PendingNutritionAction).
    setPendingAction({ kind: "open-photo-picker" });
  };

  const {
    scan: handlePantryBarcodeDetected,
    notice: pantryBarcodeNotice,
    retry: retryPantryBarcodeLookup,
    dismissNotice: dismissPantryBarcodeNotice,
  } = usePantryBarcodeScan({
    pantry,
    setPantryScannerOpen,
    setPantryScanStatus,
  });

  const {
    recommendRecipes,
    fetchWeekPlan,
    fetchDayHint,
    fetchDayPlan,
    addMealFromPlan,
    generateShoppingList,
  } = useNutritionRemoteActions({
    setBusy,
    setErr,
    setStatusText,
    pantry,
    prefs,
    recipes,
    setRecipes,
    setRecipesRaw,
    setRecipesTried,
    recipeCacheKey,
    weekPlan,
    setWeekPlan,
    weekPlanRaw,
    setWeekPlanRaw,
    setWeekPlanBusy,
    setDayPlan,
    setDayPlanBusy,
    setDayHintBusy,
    setDayHintText,
    log,
    shopping,
    setShoppingBusy,
  });

  const addCheckedItemsToPantry = useCallback(() => {
    for (const item of shopping.checkedItems) {
      pantry.upsertItem(item.name);
    }
    shopping.clearChecked();
  }, [shopping, pantry]);

  const { handleBackupPasswordConfirm, applyRestorePayload } =
    useNutritionCloudBackup({
      toast,
      setErr,
      cloudBackupBusy,
      setCloudBackupBusy,
      backupPasswordDialog,
      setBackupPasswordDialog,
      setRestoreConfirm,
    });

  const recipeCacheEntry = useMemo(
    () => readRecipeCache(recipeCacheKey),
    [recipeCacheKey],
  );

  const wrappedSaveMeal = useCallback(
    async (meal: Meal) => {
      const isEdit = !!editingMeal?.id;
      if (isEdit && editingMeal && editingMeal.date) {
        log.handleEditMeal(editingMeal.date, meal);
        setEditingMeal(null);
        toast.success("Страву оновлено.");
      } else {
        const dateForLog = log.selectedDate;
        log.handleAddMeal(meal);
        // Додавання миттєве і без підтвердження — тост мусить нести
        // «Скасувати», як quick-chip нижче (бета-фідбек 2026-08-07).
        toast.success("Страву додано.", undefined, {
          label: "Скасувати",
          onClick: () => {
            log.handleRemoveMeal(dateForLog, meal.id);
          },
        });
      }
      if (meal.source === "photo" && photo.fileRef?.current?.files?.[0]) {
        const blob = await fileToThumbnailBlob(photo.fileRef.current.files[0]);
        if (blob) await saveMealThumbnail(meal.id, blob);
      }
    },
    [editingMeal, log, photo.fileRef, setEditingMeal, toast],
  );

  // Phase 6.6 quick-chip: логіка в `useQuickAddMealFromChip` (винесено
  // 2026-08-07 під стелю Hard Rule #18).
  const handleQuickAddMealFromChip = useQuickAddMealFromChip({ log, toast });

  const storageBanner = [
    log.storageErr,
    pantry.pantryStorageErr,
    prefsStorageErr,
  ]
    .filter(Boolean)
    .join(" ");

  // PTR refresh both invalidates nutrition RQ keys (so meal log / OFF
  // cache refetch on next read) and asks the App-level cloud-sync engine
  // for a pull. Both are awaited with `Promise.allSettled` so a slow
  // cloud-pull doesn't keep the spinner pinned past the refetch.
  const queryClient = useQueryClient();
  const handlePullRefresh = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all }),
      requestCloudPull(2500),
    ]);
  }, [queryClient]);

  const handlePullRefreshError = useCallback(() => {
    // PTR-fail: provide an actionable retry path per
    // docs/ui/toast-policy.md. The retry callback runs the same dual
    // refetch (`invalidateQueries` + `requestCloudPull`) the gesture
    // triggered so the user does not need to repeat the PTR pull.
    toast.error("Не вдалося оновити дані. Перевір з'єднання.", undefined, {
      label: "Повторити",
      onClick: () => {
        void handlePullRefresh();
      },
    });
  }, [toast, handlePullRefresh]);

  const cloudPullPending = useCloudPullPending();

  const dayPlanQuery: DataStateQueryLike<NutritionDayPlan | null> = {
    data: dayPlanBusy ? undefined : dayPlan,
    isLoading: dayPlanBusy,
  };

  const dayPlanLoadingSkeleton = (
    <div className="space-y-3 motion-safe:animate-in motion-safe:fade-in">
      <div className="flex items-center justify-between px-1 pb-1">
        <SkeletonText shimmer className="w-32" />
        <Skeleton shimmer className="w-20 h-6 rounded-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <SkeletonMealCard
          key={i}
          shimmer
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );

  return (
    // Sergeant v2 redesign (2026-05, PR-6) — Nutrition shell wraps content
    // in MeshBackground. ModuleAccentProvider drops asShellRoot; shell-root
    // role moves to MeshBackground (Hard Rule #12 — accent published
    // first, mesh DOM element inside).
    <ModuleAccentProvider module="nutrition" className="contents">
      {/* `bottom-nav-height-var` — див. FinykApp: навігацію малює модуль,
          тож і змінну висоти для `Sheet` виставляє він. */}
      <MeshBackground className="bottom-nav-height-var">
        <NutritionHeader
          busy={busy}
          onBackToHub={onBackToHub}
          onGoToHub={onGoToHub}
          onOpenSettings={onOpenSettings}
        />

        <PullToRefresh
          onRefresh={handlePullRefresh}
          onError={handlePullRefreshError}
          variant="nutrition"
          enabled={!cloudPullPending}
        >
          <div className="max-w-2xl mx-auto px-4 pt-4 pb-6 w-full min-w-0 overflow-x-hidden">
            <NutritionPantrySelector pantry={pantry} busy={busy} />

            {/* Photo analyze/refine status now renders inline inside
                `PhotoAnalyzeCard` (near the button it describes — see
                `photo.isAnalyzing` / `photo.isRefining` below) because the
                card lives inside a collapsed `<details>` at the bottom of
                the Start page, far from this top banner; users reported the
                banner as "silent failure" since they never scrolled up to
                see it. Suppress the duplicate top banner for exactly those
                two flows; every other `setStatusText` caller (pantry list
                parsing, recipe/day-plan fetches, …) has no in-card anchor
                yet, so it keeps using this banner. */}
            {statusText && !(photo.isAnalyzing || photo.isRefining) && (
              <Banner className="mb-4">{statusText}</Banner>
            )}
            {err && (
              <Banner
                variant="danger"
                className="mb-4 flex items-start justify-between gap-3"
                role="alert"
              >
                <span>{err}</span>
                <button
                  type="button"
                  onClick={() => setErr("")}
                  aria-label="Закрити повідомлення про помилку"
                  className="min-h-11 min-w-11 shrink-0 rounded-xl text-lg leading-none hover:bg-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  ×
                </button>
              </Banner>
            )}
            {storageBanner && (
              <Banner variant="warning" className="mb-4">
                {storageBanner}
              </Banner>
            )}

            <div className="grid gap-4 min-w-0">
              {activePage === "start" && (
                <NutritionStartPage
                  log={log}
                  photo={photo}
                  prefs={prefs}
                  busy={busy}
                  setActivePageAndHash={setActivePageAndHash}
                  fetchDayHint={fetchDayHint}
                  dayHintText={dayHintText}
                  dayHintBusy={dayHintBusy}
                  onRequestAddMeal={handleRequestAddMeal}
                  photoCardForceOpen={photoCardForceOpen}
                  setPhotoCardForceOpen={setPhotoCardForceOpen}
                  onSaveToLog={handleSaveToLog}
                  pantryItems={pantry.effectiveItems}
                  onQuickAddMeal={handleQuickAddMealFromChip}
                />
              )}

              {activePage === "pantry" && (
                <NutritionPantryPage
                  pantry={pantry}
                  shopping={shopping}
                  recipes={recipes}
                  weekPlan={weekPlan}
                  shoppingBusy={shoppingBusy}
                  busy={busy}
                  pantrySubTab={pantrySubTab}
                  setPantrySubTab={(id) => setPantrySubTab(id as PantrySubTab)}
                  pantryScanStatus={pantryScanStatus}
                  setPantryScanStatus={setPantryScanStatus}
                  setPantryScannerOpen={setPantryScannerOpen}
                  pantryBarcodeNotice={pantryBarcodeNotice}
                  onRetryPantryBarcode={retryPantryBarcodeLookup}
                  onDismissPantryBarcodeNotice={dismissPantryBarcodeNotice}
                  toast={toast}
                  generateShoppingList={generateShoppingList}
                  addCheckedItemsToPantry={addCheckedItemsToPantry}
                />
              )}

              {activePage === "log" && (
                <NutritionLogPage
                  log={log}
                  toast={toast}
                  setEditingMeal={setEditingMeal}
                />
              )}

              {activePage === "menu" && (
                <NutritionMenuPage
                  menuSubTab={menuSubTab}
                  setMenuSubTab={(id) => setMenuSubTab(id as MenuSubTab)}
                  pantry={pantry}
                  prefs={prefs}
                  setPrefs={setPrefs}
                  busy={busy}
                  err={err}
                  dayPlan={dayPlan}
                  dayPlanBusy={dayPlanBusy}
                  dayPlanQuery={dayPlanQuery}
                  dayPlanLoadingSkeleton={dayPlanLoadingSkeleton}
                  fetchDayPlan={fetchDayPlan}
                  addMealFromPlan={addMealFromPlan}
                  weekPlan={weekPlan}
                  weekPlanRaw={weekPlanRaw}
                  weekPlanBusy={weekPlanBusy}
                  fetchWeekPlan={fetchWeekPlan}
                  firstRunHint={firstRunNutritionActive}
                  onDismissFirstRunHint={() => {
                    markNutritionSeen();
                    setFirstRunNutritionSurface(false);
                  }}
                  recommendRecipes={recommendRecipes}
                  recipes={recipes}
                  recipesTried={recipesTried}
                  recipesRaw={recipesRaw}
                  recipeCacheEntry={recipeCacheEntry}
                  wrappedSaveMeal={wrappedSaveMeal}
                  selectedDate={log.selectedDate}
                />
              )}
            </div>
          </div>
        </PullToRefresh>

        {(activePage === "start" || activePage === "log") && (
          <FloatingActionButton
            variant="v2-nutrition"
            icon="plus"
            onClick={handleOpenAddMeal}
            aria-label="Додати прийом їжі"
          />
        )}

        <NutritionBottomNav
          activePage={activePage}
          setActivePage={(id) => setActivePageAndHash(id as NutritionPage)}
        />

        <NutritionOverlays
          pantry={pantry}
          log={log}
          busy={busy}
          pantryScannerOpen={pantryScannerOpen}
          setPantryScannerOpen={setPantryScannerOpen}
          handlePantryBarcodeDetected={handlePantryBarcodeDetected}
          editingMeal={editingMeal}
          setEditingMeal={setEditingMeal}
          wrappedSaveMeal={wrappedSaveMeal}
          prefs={prefs}
          setPrefs={setPrefs}
          backupPasswordDialog={backupPasswordDialog}
          setBackupPasswordDialog={setBackupPasswordDialog}
          handleBackupPasswordConfirm={handleBackupPasswordConfirm}
          restoreConfirm={restoreConfirm}
          setRestoreConfirm={setRestoreConfirm}
          applyRestorePayload={applyRestorePayload}
          onRequestMealPhoto={handleRequestMealPhoto}
        />
      </MeshBackground>
    </ModuleAccentProvider>
  );
}
