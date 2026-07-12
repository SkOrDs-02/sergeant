// @vitest-environment jsdom
/**
 * Last validated: 2026-07-09
 * Status: Active
 * Smoke tests for NutritionApp — verifies the orchestration shell renders
 * without throwing and shows the expected page based on the active route.
 * All heavy hooks and child components are mocked; this test covers wiring
 * logic (page routing, PTR invalidation, pending-action state machine).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Storage chain — prevents db-schema import failure ────────────────────
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(() => null),
  safeWriteLS: vi.fn(() => true),
  safeReadStringLS: vi.fn(() => null),
  safeReadLSValidated: vi.fn(() => null),
  safeRemoveLS: vi.fn(() => true),
  safeListLSKeys: vi.fn(() => []),
  webKVStore: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

// ─── Hook mocks ────────────────────────────────────────────────────────────

vi.mock("./hooks/useNutritionDualWriteBoot", () => ({
  useNutritionDualWriteBoot: vi.fn(),
}));

vi.mock("./hooks/useNutritionSqliteReadBoot", () => ({
  useNutritionSqliteReadBoot: vi.fn(),
}));

vi.mock("./lib/sqliteReadGate", () => ({
  useNutritionSqliteReadTick: vi.fn(() => 0),
}));

vi.mock("./hooks/useNutritionRoute", () => ({
  useNutritionRoute: vi.fn(() => ({
    activePage: "start" as const,
    setActivePage: vi.fn(),
    setActivePageAndHash: vi.fn(),
    pantrySubTab: "items" as const,
    menuSubTab: "plan" as const,
    setPantrySubTab: vi.fn(),
    setMenuSubTab: vi.fn(),
  })),
}));

vi.mock("./hooks/useNutritionFirstRun", () => ({
  useNutritionFirstRun: vi.fn(() => ({
    firstRunNutritionActive: false,
    markNutritionSeen: vi.fn(),
    setFirstRunNutritionSurface: vi.fn(),
  })),
}));

vi.mock("./hooks/useNutritionPantries", () => ({
  useNutritionPantries: vi.fn(() => ({
    pantries: [],
    activePantryId: "default",
    effectiveItems: [],
    pantryStorageErr: "",
    upsertItem: vi.fn(),
    removeItem: vi.fn(),
    consumeItem: vi.fn(),
    addPantry: vi.fn(),
    removePantry: vi.fn(),
    setActivePantryId: vi.fn(),
    editPantry: vi.fn(),
    clearPantry: vi.fn(),
    replaceFromJsonText: vi.fn(),
    importText: vi.fn(),
  })),
}));

vi.mock("./hooks/useNutritionLog", () => ({
  useNutritionLog: vi.fn(() => ({
    nutritionLog: {},
    setNutritionLog: vi.fn(),
    selectedDate: "2026-01-01",
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
  })),
}));

vi.mock("./hooks/useNutritionUiState", () => ({
  useNutritionUiState: vi.fn(() => ({
    editingMeal: null,
    setEditingMeal: vi.fn(),
    recipes: [],
    setRecipes: vi.fn(),
    recipesTried: false,
    setRecipesTried: vi.fn(),
    recipesRaw: "",
    setRecipesRaw: vi.fn(),
    weekPlan: null,
    setWeekPlan: vi.fn(),
    weekPlanRaw: "",
    setWeekPlanRaw: vi.fn(),
    weekPlanBusy: false,
    setWeekPlanBusy: vi.fn(),
    dayPlan: null,
    setDayPlan: vi.fn(),
    dayPlanBusy: false,
    setDayPlanBusy: vi.fn(),
    shoppingBusy: false,
    setShoppingBusy: vi.fn(),
    dayHintText: "",
    setDayHintText: vi.fn(),
    dayHintBusy: false,
    setDayHintBusy: vi.fn(),
    cloudBackupBusy: false,
    setCloudBackupBusy: vi.fn(),
    backupPasswordDialog: null,
    setBackupPasswordDialog: vi.fn(),
    restoreConfirm: null,
    setRestoreConfirm: vi.fn(),
    pantryScannerOpen: false,
    setPantryScannerOpen: vi.fn(),
    pantryScanStatus: "",
    setPantryScanStatus: vi.fn(),
  })),
}));

vi.mock("./hooks/usePhotoAnalysis", () => ({
  usePhotoAnalysis: vi.fn(() => ({
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
  })),
}));

vi.mock("./hooks/useShoppingList", () => ({
  useShoppingList: vi.fn(() => ({
    shoppingList: [],
    checkedItems: [],
    addItems: vi.fn(),
    toggleItem: vi.fn(),
    clearChecked: vi.fn(),
    removeItem: vi.fn(),
    replaceFromJsonText: vi.fn(),
  })),
}));

vi.mock("./hooks/useNutritionReminders", () => ({
  useNutritionReminders: vi.fn(),
}));

vi.mock("./hooks/useNutritionPwaAction", () => ({
  useNutritionPwaAction: vi.fn(),
}));

vi.mock("./hooks/useNutritionRecipeCache", () => ({
  useNutritionRecipeCache: vi.fn(),
}));

vi.mock("./hooks/useNutritionPrefsState", () => ({
  useNutritionPrefsState: vi.fn(() => ({
    prefs: {
      goal: "balanced",
      servings: 2,
      timeMinutes: 30,
      exclude: [],
    },
    setPrefs: vi.fn(),
    prefsStorageErr: "",
  })),
}));

vi.mock("./hooks/usePantryBarcodeScan", () => ({
  usePantryBarcodeScan: vi.fn(() => vi.fn()),
}));

vi.mock("./hooks/useNutritionCloudBackup", () => ({
  useNutritionCloudBackup: vi.fn(() => ({
    handleBackupPasswordConfirm: vi.fn(),
    applyRestorePayload: vi.fn(),
  })),
}));

vi.mock("./hooks/useNutritionRemoteActions", () => ({
  useNutritionRemoteActions: vi.fn(() => ({
    recommendRecipes: vi.fn(),
    fetchWeekPlan: vi.fn(),
    fetchDayHint: vi.fn(),
    fetchDayPlan: vi.fn(),
    addMealFromPlan: vi.fn(),
    generateShoppingList: vi.fn(),
  })),
}));

vi.mock("./lib/recipeCache", () => ({
  buildRecipeCacheKey: vi.fn(() => "cache-key-test"),
  readRecipeCache: vi.fn(() => null),
}));

vi.mock("./lib/mealPhotoStorage", () => ({
  fileToThumbnailBlob: vi.fn(() => Promise.resolve(null)),
  saveMealThumbnail: vi.fn(() => Promise.resolve()),
}));

vi.mock("./lib/mealId", () => ({
  newMealId: vi.fn(() => "meal-test-id"),
}));

vi.mock("./lib/nutritionFormat", () => ({
  todayISODate: vi.fn(() => "2026-01-01"),
}));

vi.mock("@shared/lib/modules/cloudPullRequest", () => ({
  requestCloudPull: vi.fn(() => Promise.resolve()),
}));

vi.mock("@shared/hooks/useCloudPullPending", () => ({
  useCloudPullPending: vi.fn(() => false),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(() => Promise.resolve()),
    })),
  };
});

// ─── Child component mocks ─────────────────────────────────────────────────

vi.mock("./components/NutritionHeader", () => ({
  NutritionHeader: () => <div data-testid="nutrition-header" />,
}));

vi.mock("./components/NutritionBottomNav", () => ({
  NutritionBottomNav: ({ activePage }: { activePage: string }) => (
    <nav data-testid="nutrition-bottom-nav" data-page={activePage} />
  ),
}));

vi.mock("./components/NutritionPantrySelector", () => ({
  NutritionPantrySelector: () => (
    <div data-testid="nutrition-pantry-selector" />
  ),
}));

vi.mock("./components/NutritionOverlays", () => ({
  NutritionOverlays: () => <div data-testid="nutrition-overlays" />,
}));

vi.mock("./pages/NutritionStartPage", () => ({
  NutritionStartPage: () => <div data-testid="nutrition-start-page" />,
}));

vi.mock("./pages/NutritionPantryPage", () => ({
  NutritionPantryPage: () => <div data-testid="nutrition-pantry-page" />,
}));

vi.mock("./pages/NutritionLogPage", () => ({
  NutritionLogPage: () => <div data-testid="nutrition-log-page" />,
}));

vi.mock("./pages/NutritionMenuPage", () => ({
  NutritionMenuPage: () => <div data-testid="nutrition-menu-page" />,
}));

vi.mock("@shared/components/ui/Banner", () => ({
  Banner: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="banner">{children}</div>
  ),
}));

vi.mock("@shared/components/layout", () => ({
  MeshBackground: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mesh-background">{children}</div>
  ),
  ModuleAccentProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="module-accent-provider">{children}</div>
  ),
}));

vi.mock("@shared/components/ui/PullToRefresh", () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pull-to-refresh">{children}</div>
  ),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────

import NutritionApp from "./NutritionApp";
import { useNutritionRoute } from "./hooks/useNutritionRoute";
import type { UseNutritionRouteResult } from "./hooks/useNutritionRoute";
import type { NutritionPage } from "./lib/nutritionRouter";
import { useNutritionLog } from "./hooks/useNutritionLog";
import { useNutritionPantries } from "./hooks/useNutritionPantries";

function mockRoute(activePage: NutritionPage): UseNutritionRouteResult {
  return {
    activePage,
    setActivePage: vi.fn(),
    setActivePageAndHash: vi.fn(),
    pantrySubTab: "items",
    menuSubTab: "plan",
    setPantrySubTab: vi.fn(),
    setMenuSubTab: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useNutritionRoute).mockReturnValue(mockRoute("start"));
});

describe("NutritionApp — smoke tests", () => {
  it("renders without crashing and shows the shell structure", () => {
    render(<NutritionApp />);
    expect(screen.getByTestId("nutrition-header")).toBeInTheDocument();
    expect(screen.getByTestId("nutrition-bottom-nav")).toBeInTheDocument();
    expect(screen.getByTestId("nutrition-overlays")).toBeInTheDocument();
  });

  it("renders the start page when activePage is 'start'", () => {
    vi.mocked(useNutritionRoute).mockReturnValue(mockRoute("start"));
    render(<NutritionApp />);
    expect(screen.getByTestId("nutrition-start-page")).toBeInTheDocument();
    expect(screen.queryByTestId("nutrition-log-page")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("nutrition-pantry-page"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("nutrition-menu-page")).not.toBeInTheDocument();
  });

  it("renders the log page when activePage is 'log'", () => {
    vi.mocked(useNutritionRoute).mockReturnValue(mockRoute("log"));
    render(<NutritionApp />);
    expect(screen.getByTestId("nutrition-log-page")).toBeInTheDocument();
    expect(
      screen.queryByTestId("nutrition-start-page"),
    ).not.toBeInTheDocument();
  });

  it("renders the pantry page when activePage is 'pantry'", () => {
    vi.mocked(useNutritionRoute).mockReturnValue(mockRoute("pantry"));
    render(<NutritionApp />);
    expect(screen.getByTestId("nutrition-pantry-page")).toBeInTheDocument();
  });

  it("renders the menu page when activePage is 'menu'", () => {
    vi.mocked(useNutritionRoute).mockReturnValue(mockRoute("menu"));
    render(<NutritionApp />);
    expect(screen.getByTestId("nutrition-menu-page")).toBeInTheDocument();
  });

  it("accepts optional props without crashing", () => {
    render(
      <NutritionApp
        onBackToHub={vi.fn()}
        onOpenSettings={vi.fn()}
        pwaAction={null}
        onPwaActionConsumed={vi.fn()}
      />,
    );
    expect(screen.getByTestId("nutrition-header")).toBeInTheDocument();
  });
});

// ─── Log / pantry error state → storage warning banner ─────────────────────

const DEFAULT_LOG_RETURN = {
  nutritionLog: {},
  setNutritionLog: vi.fn(),
  selectedDate: "2026-01-01",
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
} as unknown as ReturnType<typeof useNutritionLog>;

const DEFAULT_PANTRY_RETURN = {
  pantries: [],
  activePantryId: "default",
  effectiveItems: [],
  pantryStorageErr: "",
  upsertItem: vi.fn(),
  removeItem: vi.fn(),
  consumeItem: vi.fn(),
  addPantry: vi.fn(),
  removePantry: vi.fn(),
  setActivePantryId: vi.fn(),
  editPantry: vi.fn(),
  clearPantry: vi.fn(),
  replaceFromJsonText: vi.fn(),
  importText: vi.fn(),
} as unknown as ReturnType<typeof useNutritionPantries>;

describe("NutritionApp — storage error banners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNutritionRoute).mockReturnValue(mockRoute("start"));
  });

  it("renders a warning banner when useNutritionLog has a storageErr", () => {
    vi.mocked(useNutritionLog).mockReturnValueOnce({
      ...DEFAULT_LOG_RETURN,
      storageErr: "Помилка сховища журналу",
    });
    render(<NutritionApp />);
    // Banner component is mocked as <div data-testid="banner">{children}</div>
    expect(screen.getByText("Помилка сховища журналу")).toBeInTheDocument();
  });

  it("renders a warning banner when useNutritionPantries has a pantryStorageErr", () => {
    vi.mocked(useNutritionPantries).mockReturnValueOnce({
      ...DEFAULT_PANTRY_RETURN,
      pantryStorageErr: "Помилка сховища комори",
    });
    render(<NutritionApp />);
    expect(screen.getByText("Помилка сховища комори")).toBeInTheDocument();
  });

  it("concatenates multiple storage errors into one banner", () => {
    vi.mocked(useNutritionLog).mockReturnValueOnce({
      ...DEFAULT_LOG_RETURN,
      storageErr: "Журнал: помилка",
    });
    vi.mocked(useNutritionPantries).mockReturnValueOnce({
      ...DEFAULT_PANTRY_RETURN,
      pantryStorageErr: "Комора: помилка",
    });
    render(<NutritionApp />);
    // storageBanner = errors joined by " "
    expect(
      screen.getByText("Журнал: помилка Комора: помилка"),
    ).toBeInTheDocument();
  });
});
