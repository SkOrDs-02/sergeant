import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meal } from "@sergeant/nutrition-domain";
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
import { ModuleAccentProvider } from "@shared/components/layout";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
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
import { buildRecipeCacheKey, readRecipeCache } from "./lib/recipeCache";
import { fileToThumbnailBlob, saveMealThumbnail } from "./lib/mealPhotoStorage";
import { useToast } from "@shared/hooks/useToast";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";

interface NutritionAppProps {
  onBackToHub?: () => void;
  onOpenSettings?: () => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function NutritionApp({
  onBackToHub,
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
    setActivePageAndHash,
    pantrySubTab,
    menuSubTab,
    setPantrySubTab,
    setMenuSubTab,
  } = useNutritionRoute();

  // Per-module first-run handoff. On the user's very first Nutrition
  // entry route them to «Меню → План на день» so the canonical macro
  // editor (`DailyPlanCard`) is what they see — see
  // `core/onboarding/useModuleFirstRun.ts` for the rationale and
  // legacy storage-key contract.
  const { firstRun: firstRunNutrition, markSeen: markNutritionSeen } =
    useModuleFirstRun("nutrition");
  // Latch the initial `firstRun` so `markSeen()` (or any cross-tab
  // edit to the seen flag) doesn't yank the banner away mid-session.
  // The banner itself dismounts on dismiss via `onDismiss`.
  const [firstRunNutritionSurface, setFirstRunNutritionSurface] =
    useState(firstRunNutrition);
  useEffect(() => {
    if (firstRunNutrition) setFirstRunNutritionSurface(true);
  }, [firstRunNutrition]);
  const firstRunNutritionActive =
    firstRunNutritionSurface && activePage === "menu" && menuSubTab === "plan";

  const pantry = useNutritionPantries({ setBusy, setErr, setStatusText });
  const log = useNutritionLog();
  const ui = useNutritionUiState();
  const photo = usePhotoAnalysis({ setBusy, setErr, setStatusText });
  const shopping = useShoppingList();

  // When the photo-first FTUX CTA lands us here (#S0.3), we force the
  // "Аналіз фото страви" disclosure open and pop the native file picker
  // on the next frame — no extra "Звідки страва?" detour.
  const [photoCardForceOpen, setPhotoCardForceOpen] = useState(false);

  // Shared bucket for short-lived one-shot timers scheduled from imperative
  // click / route handlers (file picker fallbacks, "Add meal" sheet open).
  // We need to clear them on unmount so late setState / click() calls
  // don't touch a torn-down component.
  const transientTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set(),
  );
  const scheduleTransient = useCallback(
    (cb: () => void, delayMs: number): ReturnType<typeof setTimeout> => {
      const id = setTimeout(() => {
        transientTimersRef.current.delete(id);
        cb();
      }, delayMs);
      transientTimersRef.current.add(id);
      return id;
    },
    [],
  );
  useEffect(() => {
    const timers = transientTimersRef.current;
    return () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

  // First-run jump to the canonical goal surface. Runs once after
  // mount so a user mid-session who clears the seen flag does not
  // get re-routed away from whatever page they were on. Skipped when
  // a `pwaAction` is already routing the user (e.g. `add_meal`,
  // `add_meal_photo`) so the action target wins.
  useEffect(() => {
    if (!firstRunNutrition) return;
    if (pwaAction === "add_meal" || pwaAction === "add_meal_photo") return;
    if (activePage !== "menu") setActivePageAndHash("menu");
    if (menuSubTab !== "plan") setMenuSubTab("plan");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount; subsequent edits to firstRun must not retrigger
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
    const raf = requestAnimationFrame(() => {
      try {
        photo.fileRef.current?.click();
      } catch {
        /* noop — picker may be blocked without a user gesture */
      }
    });
    scheduleTransient(() => {
      cancelAnimationFrame(raf);
      try {
        photo.fileRef.current?.click();
      } catch {
        /* noop */
      }
    }, 80);
  };

  const handlePantryBarcodeDetected = usePantryBarcodeScan({
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
      } else {
        log.handleAddMeal(meal);
      }
      // Сигналимо успіх як у Finyk (витрати) / Routine (звички) — тост із
      // check-pop анімацією плюс haptic зроблено вже в `AddMealSheet`
      // на `handleSave`. Без цього користувач бачив лише те, що модалка
      // закрилась, — це не читалось як «збережено».
      toast.success(isEdit ? "Страву оновлено." : "Страву додано.");
      if (meal.source === "photo" && photo.fileRef?.current?.files?.[0]) {
        const blob = await fileToThumbnailBlob(photo.fileRef.current.files[0]);
        if (blob) await saveMealThumbnail(meal.id, blob);
      }
    },
    [editingMeal, log, photo.fileRef, setEditingMeal, toast],
  );

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
    toast.error("Не вдалося оновити дані. Перевір з'єднання.");
  }, [toast]);

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
    <ModuleAccentProvider module="nutrition" asShellRoot>
      <NutritionHeader
        busy={busy}
        onBackToHub={onBackToHub}
        onOpenSettings={onOpenSettings}
      />

      <PullToRefresh
        onRefresh={handlePullRefresh}
        onError={handlePullRefreshError}
        variant="nutrition"
      >
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-6 w-full">
          <NutritionPantrySelector pantry={pantry} busy={busy} />

          {statusText && <Banner className="mb-4">{statusText}</Banner>}
          {err && (
            <Banner variant="danger" className="mb-4">
              {err}
            </Banner>
          )}
          {storageBanner && (
            <Banner variant="warning" className="mb-4">
              {storageBanner}
            </Banner>
          )}

          <div className="grid gap-4">
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
                scheduleTransient={scheduleTransient}
                photoCardForceOpen={photoCardForceOpen}
                setPhotoCardForceOpen={setPhotoCardForceOpen}
                onSaveToLog={handleSaveToLog}
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
    </ModuleAccentProvider>
  );
}
