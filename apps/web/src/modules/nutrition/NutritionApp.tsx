import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meal } from "@sergeant/nutrition-domain";
import {
  SkeletonMealCard,
  SkeletonText,
  Skeleton,
} from "@shared/components/ui/Skeleton";
import { NutritionHeader } from "./components/NutritionHeader";
import { NutritionBottomNav } from "./components/NutritionBottomNav";
import { SubTabs } from "./components/SubTabs";
import { PhotoAnalyzeCard } from "./components/PhotoAnalyzeCard";
import { NutritionDashboard } from "./components/NutritionDashboard";
import { PantryCard } from "./components/PantryCard";
import { RecipesCard } from "./components/RecipesCard";
import { DailyPlanCard } from "./components/DailyPlanCard";
import { ShoppingListCard } from "./components/ShoppingListCard";
import { LogCard } from "./components/LogCard";
import { NutritionPantrySelector } from "./components/NutritionPantrySelector";
import { NutritionOverlays } from "./components/NutritionOverlays";
import { Banner } from "@shared/components/ui/Banner";
import { ModuleAccentProvider } from "@shared/components/layout";
import { Icon } from "@shared/components/ui/Icon";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { requestCloudPull } from "@shared/lib/cloudPullRequest";
import { useQueryClient } from "@tanstack/react-query";
import { nutritionKeys } from "@shared/lib/queryKeys";
import {
  loadNutritionPrefs,
  persistNutritionPrefs,
} from "./lib/nutritionStorage";
import { useNutritionPantries } from "./hooks/useNutritionPantries";
import { useNutritionLog } from "./hooks/useNutritionLog";
import { usePhotoAnalysis } from "./hooks/usePhotoAnalysis";
import { useShoppingList } from "./hooks/useShoppingList";
import { useNutritionUiState } from "./hooks/useNutritionUiState";
import { useNutritionHashRoute } from "./hooks/useNutritionHashRoute";
import type {
  NutritionPage,
  PantrySubTab,
  MenuSubTab,
} from "./lib/nutritionRouter";
import { useNutritionReminders } from "./hooks/useNutritionReminders";
import { usePantryBarcodeScan } from "./hooks/usePantryBarcodeScan";
import { useNutritionCloudBackup } from "./hooks/useNutritionCloudBackup";
import { useNutritionRemoteActions } from "./hooks/useNutritionRemoteActions";
import { buildRecipeCacheKey, readRecipeCache } from "./lib/recipeCache";
import { stableRecipeId } from "./lib/recipeIds";
import { fileToThumbnailBlob, saveMealThumbnail } from "./lib/mealPhotoStorage";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";
import { fmtMacro, todayISODate } from "./lib/nutritionFormat";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";

interface NutritionAppProps {
  onBackToHub?: () => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function NutritionApp({
  onBackToHub,
  pwaAction,
  onPwaActionConsumed,
}: NutritionAppProps = {}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [statusText, setStatusText] = useState("");

  const {
    activePage,
    setActivePageAndHash,
    pantrySubTab,
    menuSubTab,
    setPantrySubTab,
    setMenuSubTab,
  } = useNutritionHashRoute();

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

  useEffect(() => {
    if (pwaAction === "add_meal") {
      setActivePageAndHash("log");
      log.setAddMealSheetOpen(true);
      onPwaActionConsumed?.();
      return;
    }
    if (pwaAction === "add_meal_photo") {
      setActivePageAndHash("start");
      setPhotoCardForceOpen(true);
      // Defer the file-picker click until after the disclosure has
      // rendered the `<input ref={fileRef}>`. requestAnimationFrame is
      // enough on desktop; the 80ms fallback covers mobile browsers
      // that stall the first frame behind route transitions.
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
    // `photo.fileRef` is a stable ref; `setPhotoCardForceOpen` is a setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, onPwaActionConsumed, pwaAction]);

  const [prefs, setPrefs] = useState(() => loadNutritionPrefs());
  const [prefsStorageErr, setPrefsStorageErr] = useState("");

  useEffect(() => {
    setPrefsStorageErr(
      persistNutritionPrefs(prefs) ? "" : "Не вдалося зберегти налаштування.",
    );
  }, [prefs]);

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

  useEffect(() => {
    // Recipes moved to a sub-tab inside the "menu" page (#8). Only read
    // the cache when the menu page is actually showing the recipes tab.
    if (activePage !== "menu" || menuSubTab !== "recipes") return;
    const c = readRecipeCache<Record<string, unknown>>(recipeCacheKey);
    if (c?.recipes?.length) {
      setRecipes(
        c.recipes.map((r) => {
          const rawId = (r as { id?: unknown })?.id;
          return {
            ...r,
            id: rawId ? String(rawId) : stableRecipeId(r),
          };
        }),
      );
      setRecipesRaw(c.recipesRaw || "");
      setRecipesTried(true);
    }
  }, [
    activePage,
    menuSubTab,
    recipeCacheKey,
    setRecipes,
    setRecipesRaw,
    setRecipesTried,
  ]);

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

  return (
    <ModuleAccentProvider module="nutrition" asShellRoot>
      <NutritionHeader busy={busy} onBackToHub={onBackToHub} />

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
              <SectionErrorBoundary
                key="page-start"
                title="Не вдалось показати «Харчування»"
              >
                <>
                  <NutritionDashboard
                    log={log.nutritionLog}
                    prefs={prefs}
                    onGoToLog={() => setActivePageAndHash("log")}
                    onGoToDailyPlan={() => {
                      setActivePageAndHash("menu");
                    }}
                    onFetchDayHint={fetchDayHint}
                    dayHintText={dayHintText}
                    dayHintBusy={dayHintBusy}
                    onAddMeal={() => {
                      log.setSelectedDate(todayISODate());
                      setActivePageAndHash("log");
                      scheduleTransient(() => {
                        log.setAddMealPhotoResult(null);
                        log.setAddMealSheetOpen(true);
                      }, 80);
                    }}
                  />
                  <details
                    className="group"
                    open={photoCardForceOpen || undefined}
                    onToggle={(e) => {
                      if (!e.currentTarget.open) setPhotoCardForceOpen(false);
                    }}
                  >
                    <summary className="flex items-center gap-2 cursor-pointer select-none py-2 px-1 text-style-label text-text">
                      <Icon
                        name="chevron-right"
                        size={16}
                        className="transition-transform group-open:rotate-90"
                      />
                      Аналіз фото страви
                    </summary>
                    <div className="pt-1">
                      <PhotoAnalyzeCard
                        busy={busy}
                        analyzePhoto={photo.analyzePhoto}
                        fileRef={photo.fileRef as React.Ref<HTMLInputElement>}
                        onPickPhoto={photo.onPickPhoto}
                        photoPreviewUrl={photo.photoPreviewUrl}
                        photoResult={photo.photoResult}
                        fmtMacro={fmtMacro}
                        portionGrams={photo.portionGrams}
                        setPortionGrams={photo.setPortionGrams}
                        refinePhoto={photo.refinePhoto}
                        answers={photo.answers}
                        setAnswers={photo.setAnswers}
                        onSaveToLog={
                          photo.photoResult ? handleSaveToLog : undefined
                        }
                      />
                    </div>
                  </details>
                </>
              </SectionErrorBoundary>
            )}

            {activePage === "pantry" && (
              <SectionErrorBoundary
                key="page-pantry"
                title="Не вдалось показати «Комора»"
              >
                <>
                  <SubTabs
                    value={pantrySubTab}
                    onChange={(id) => setPantrySubTab(id as PantrySubTab)}
                    tabs={[
                      { id: "items", label: "Склад" },
                      { id: "shopping", label: "Покупки" },
                    ]}
                  />
                  {pantrySubTab === "items" ? (
                    <>
                      <PantryCard
                        busy={busy}
                        parsePantry={pantry.parsePantry}
                        newItemName={pantry.newItemName}
                        setNewItemName={pantry.setNewItemName}
                        upsertItem={pantry.upsertItem}
                        pantryText={pantry.pantryText}
                        setPantryText={pantry.setPantryText}
                        effectiveItems={pantry.effectiveItems}
                        editItemAt={pantry.editItemAt}
                        removeItemAtOrByName={(idx, name) => {
                          if (pantry.pantryItems.length > 0) {
                            const removed = pantry.pantryItems[idx];
                            pantry.removeItemAt(idx);
                            if (removed) {
                              showUndoToast(toast, {
                                msg: `Прибрано «${removed.name}» з комори`,
                                onUndo: () => pantry.upsertItem(removed),
                              });
                            }
                          } else if (name) {
                            pantry.removeItem(name);
                          }
                        }}
                        pantryItemsLength={pantry.pantryItems.length}
                        pantrySummary={pantry.pantrySummary}
                        onScanBarcode={() => {
                          setPantryScanStatus("");
                          setPantryScannerOpen(true);
                        }}
                      />
                      {pantryScanStatus && (
                        <div className="text-xs text-subtle px-1">
                          {pantryScanStatus}
                        </div>
                      )}
                    </>
                  ) : (
                    <ShoppingListCard
                      recipes={recipes}
                      weekPlan={weekPlan}
                      pantryItems={pantry.effectiveItems}
                      shoppingList={shopping.shoppingList}
                      shoppingBusy={shoppingBusy}
                      onGenerate={generateShoppingList}
                      onToggleItem={shopping.toggle}
                      onClearChecked={shopping.clearChecked}
                      onClearAll={shopping.clearAll}
                      onAddCheckedToPantry={addCheckedItemsToPantry}
                      checkedItems={shopping.checkedItems}
                    />
                  )}
                </>
              </SectionErrorBoundary>
            )}

            {activePage === "log" && (
              <SectionErrorBoundary
                key="page-log"
                title="Не вдалось показати «Щоденник»"
              >
                <LogCard
                  log={log.nutritionLog}
                  selectedDate={log.selectedDate}
                  setSelectedDate={log.setSelectedDate}
                  onAddMeal={() => {
                    log.setAddMealPhotoResult(null);
                    log.setAddMealSheetOpen(true);
                  }}
                  onAddMealFromSearch={(meal) => {
                    const id = `meal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    log.handleAddMeal({ ...meal, id });
                  }}
                  onRemoveMeal={(date, meal) => {
                    if (!meal?.id) return;
                    log.handleRemoveMeal(date, meal);
                    showUndoToast(toast, {
                      msg: "Запис видалено",
                      onUndo: () => log.handleRestoreMeal(date, meal),
                    });
                  }}
                  onEditMeal={(date, meal) => {
                    setEditingMeal({ date, ...meal });
                    log.setAddMealPhotoResult(null);
                    log.setAddMealSheetOpen(true);
                  }}
                  onDuplicateYesterday={log.duplicateYesterday}
                  onTrimLog={log.trimLogToLastDays}
                />
              </SectionErrorBoundary>
            )}

            {activePage === "menu" && (
              <SectionErrorBoundary
                key="page-menu"
                title="Не вдалось показати «Меню»"
              >
                <>
                  <SubTabs
                    value={menuSubTab}
                    onChange={(id) => setMenuSubTab(id as MenuSubTab)}
                    tabs={[
                      { id: "plan", label: "План на день" },
                      { id: "recipes", label: "Рецепти" },
                    ]}
                  />
                  {menuSubTab === "plan" && dayPlanBusy ? (
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
                  ) : menuSubTab === "plan" ? (
                    <DailyPlanCard
                      prefs={prefs}
                      setPrefs={setPrefs}
                      pantryItems={pantry.effectiveItems}
                      busy={busy}
                      dayPlan={dayPlan}
                      dayPlanBusy={dayPlanBusy}
                      fetchDayPlan={() => fetchDayPlan(null)}
                      regenMeal={(mealType) => fetchDayPlan(mealType)}
                      addMealToLog={addMealFromPlan}
                      weekPlan={weekPlan}
                      weekPlanRaw={weekPlanRaw}
                      weekPlanBusy={weekPlanBusy}
                      fetchWeekPlan={fetchWeekPlan}
                    />
                  ) : (
                    <RecipesCard
                      busy={busy}
                      activePantry={pantry.activePantry}
                      prefs={prefs}
                      setPrefs={setPrefs}
                      recommendRecipes={recommendRecipes}
                      recipes={recipes}
                      recipesTried={recipesTried}
                      recipesRaw={recipesRaw}
                      err={err}
                      fmtMacro={fmtMacro}
                      recipeCacheEntry={recipeCacheEntry}
                      addMealToLog={wrappedSaveMeal}
                      selectedDate={log.selectedDate}
                    />
                  )}
                </>
              </SectionErrorBoundary>
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
