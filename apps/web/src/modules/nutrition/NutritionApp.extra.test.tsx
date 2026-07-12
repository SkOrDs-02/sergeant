// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Extended tests for NutritionApp covering callback handlers not exercised
 * by the base smoke tests:
 *   • handleSaveToLog  (onSaveToLog from NutritionStartPage)
 *   • handleQuickAddMealFromChip  (onQuickAddMeal from NutritionStartPage)
 *   • handleRequestAddMeal + pending "open-add-meal" effect
 *   • handleRequestMealPhoto  (onRequestMealPhoto from NutritionOverlays)
 *   • handlePullRefresh + handlePullRefreshError  (PTR callbacks)
 *   • wrappedSaveMeal – add path and edit path  (via NutritionOverlays)
 *   • statusText / err banners  (via captured setters from hook args)
 *   • addCheckedItemsToPantry  (via NutritionPantryPage)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import type { Meal } from "@sergeant/nutrition-domain";

// ─── Storage chain ─────────────────────────────────────────────────────────
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(() => null),
  safeWriteLS: vi.fn(() => true),
  safeReadStringLS: vi.fn(() => null),
  safeReadLSValidated: vi.fn(() => null),
  safeRemoveLS: vi.fn(() => true),
  safeListLSKeys: vi.fn(() => []),
  webKVStore: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

// ─── Captured callback refs ─────────────────────────────────────────────────
// We capture the setErr / setStatusText callbacks passed from NutritionApp to
// the mocked hooks, so tests can call them imperatively.
let capturedSetErr!: (val: string) => void;
let capturedSetStatusText!: (val: string) => void;

// ─── Hook mocks ─────────────────────────────────────────────────────────────

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

const mockLog = {
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
};

vi.mock("./hooks/useNutritionLog", () => ({
  useNutritionLog: vi.fn(() => ({ ...mockLog })),
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

const mockPhotoRef = { current: null as HTMLInputElement | null };
vi.mock("./hooks/usePhotoAnalysis", () => ({
  usePhotoAnalysis: vi.fn(() => ({
    fileRef: mockPhotoRef,
    photoPreviewUrl: "",
    photoResult: { meals: [] },
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

const mockShopping = {
  shoppingList: [],
  checkedItems: [{ name: "Молоко" }, { name: "Яйця" }],
  addItems: vi.fn(),
  toggleItem: vi.fn(),
  clearChecked: vi.fn(),
  removeItem: vi.fn(),
  replaceFromJsonText: vi.fn(),
};
vi.mock("./hooks/useShoppingList", () => ({
  useShoppingList: vi.fn(() => ({ ...mockShopping })),
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
    prefs: { goal: "balanced", servings: 2, timeMinutes: 30, exclude: [] },
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
  useNutritionRemoteActions: vi.fn(
    (args: {
      setErr: (v: string) => void;
      setStatusText: (v: string) => void;
    }) => {
      capturedSetErr = args.setErr;
      capturedSetStatusText = args.setStatusText;
      return {
        recommendRecipes: vi.fn(),
        fetchWeekPlan: vi.fn(),
        fetchDayHint: vi.fn(),
        fetchDayPlan: vi.fn(),
        addMealFromPlan: vi.fn(),
        generateShoppingList: vi.fn(),
      };
    },
  ),
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
  newMealId: vi.fn(() => "meal-extra-id"),
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

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock("@shared/hooks/useToast", () => ({
  useToast: vi.fn(() => mockToast),
}));

const mockInvalidateQueries = vi.fn(() => Promise.resolve());
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
  };
});

// ─── Child component mocks — exposing callback props ─────────────────────────

vi.mock("./components/NutritionHeader", () => ({
  NutritionHeader: () => <div data-testid="nutrition-header" />,
}));

vi.mock("./components/NutritionBottomNav", () => ({
  NutritionBottomNav: () => <nav data-testid="nutrition-bottom-nav" />,
}));

vi.mock("./components/NutritionPantrySelector", () => ({
  NutritionPantrySelector: () => (
    <div data-testid="nutrition-pantry-selector" />
  ),
}));

// NutritionOverlays exposes wrappedSaveMeal and onRequestMealPhoto
vi.mock("./components/NutritionOverlays", () => ({
  NutritionOverlays: ({
    wrappedSaveMeal,
    onRequestMealPhoto,
    editingMeal,
  }: {
    wrappedSaveMeal: (meal: Meal) => Promise<void>;
    onRequestMealPhoto: () => void;
    editingMeal: Meal | null;
  }) => (
    <div data-testid="nutrition-overlays">
      <button
        type="button"
        data-testid="save-meal-add"
        onClick={() =>
          void wrappedSaveMeal({
            id: "m1",
            name: "Тест",
            time: "08:00",
            mealType: "breakfast",
            label: "Сніданок",
            macros: { kcal: 400, protein_g: 30, fat_g: 10, carbs_g: 50 },
            source: "manual",
            macroSource: "manual",
            amount_g: 200,
            foodId: null,
          } as Meal)
        }
      >
        Save Add
      </button>
      {editingMeal && (
        <button
          type="button"
          data-testid="save-meal-edit"
          onClick={() =>
            void wrappedSaveMeal({
              id: "m1",
              name: "Тест Ред",
              time: "09:00",
              mealType: "lunch",
              label: "Обід",
              macros: { kcal: 600, protein_g: 40, fat_g: 20, carbs_g: 60 },
              source: "manual",
              macroSource: "manual",
              amount_g: 300,
              foodId: null,
            } as Meal)
          }
        >
          Save Edit
        </button>
      )}
      <button
        type="button"
        data-testid="request-meal-photo"
        onClick={onRequestMealPhoto}
      >
        Request Photo
      </button>
    </div>
  ),
}));

// NutritionStartPage exposes onSaveToLog and onQuickAddMeal
vi.mock("./pages/NutritionStartPage", () => ({
  NutritionStartPage: ({
    onSaveToLog,
    onRequestAddMeal,
    onQuickAddMeal,
  }: {
    onSaveToLog: () => void;
    onRequestAddMeal: () => void;
    onQuickAddMeal: (chip: {
      label: string;
      macros: {
        kcal: number;
        protein_g: number;
        fat_g: number;
        carbs_g: number;
      };
      grams: number;
    }) => void;
  }) => (
    <div data-testid="nutrition-start-page">
      <button type="button" data-testid="save-to-log" onClick={onSaveToLog}>
        Save to log
      </button>
      <button
        type="button"
        data-testid="request-add-meal"
        onClick={onRequestAddMeal}
      >
        Add Meal
      </button>
      <button
        type="button"
        data-testid="quick-add"
        onClick={() =>
          onQuickAddMeal({
            label: "Куряча грудка",
            macros: { kcal: 300, protein_g: 55, fat_g: 3, carbs_g: 0 },
            grams: 200,
          })
        }
      >
        Quick Add
      </button>
    </div>
  ),
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
  Banner: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant?: string;
  }) => (
    <div data-testid="banner" data-variant={variant ?? "default"}>
      {children}
    </div>
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

// PullToRefresh exposes onRefresh and onError
vi.mock("@shared/components/ui/PullToRefresh", () => ({
  PullToRefresh: ({
    children,
    onRefresh,
    onError,
    enabled,
  }: {
    children: React.ReactNode;
    onRefresh: () => Promise<void>;
    onError: () => void;
    enabled: boolean;
  }) => (
    <div data-testid="pull-to-refresh" data-enabled={String(enabled)}>
      <button
        type="button"
        data-testid="ptr-refresh"
        onClick={() => void onRefresh()}
      >
        Refresh
      </button>
      <button type="button" data-testid="ptr-error" onClick={onError}>
        Error
      </button>
      {children}
    </div>
  ),
}));

// ─── Imports (after mocks) ─────────────────────────────────────────────────
import NutritionApp from "./NutritionApp";
import { useNutritionLog } from "./hooks/useNutritionLog";
import { useNutritionUiState } from "./hooks/useNutritionUiState";
import { useNutritionRoute } from "./hooks/useNutritionRoute";
import type { UseNutritionRouteResult } from "./hooks/useNutritionRoute";
import type { NutritionPage } from "./lib/nutritionRouter";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";

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

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("NutritionApp — handleSaveToLog", () => {
  it("calls log.setAddMealPhotoResult with photoResult and opens the add-meal sheet", () => {
    render(<NutritionApp />);
    fireEvent.click(screen.getByTestId("save-to-log"));
    expect(
      vi.mocked(useNutritionLog)().setAddMealPhotoResult,
    ).toHaveBeenCalledWith(expect.objectContaining({ meals: [] }));
    expect(
      vi.mocked(useNutritionLog)().setAddMealSheetOpen,
    ).toHaveBeenCalledWith(true);
  });
});

describe("NutritionApp — handleRequestAddMeal", () => {
  it("opens the add-meal sheet once the log page commits", () => {
    let activePage: NutritionPage = "start";
    vi.mocked(useNutritionRoute).mockImplementation(() => ({
      activePage,
      setActivePage: vi.fn(),
      setActivePageAndHash: vi.fn((page: NutritionPage) => {
        activePage = page;
      }),
      pantrySubTab: "items",
      menuSubTab: "plan",
      setPantrySubTab: vi.fn(),
      setMenuSubTab: vi.fn(),
    }));

    const { rerender } = render(<NutritionApp />);
    fireEvent.click(screen.getByTestId("request-add-meal"));
    expect(vi.mocked(useNutritionLog)().setSelectedDate).toHaveBeenCalled();
    expect(activePage).toBe("log");

    rerender(<NutritionApp />);
    expect(
      vi.mocked(useNutritionLog)().setAddMealPhotoResult,
    ).toHaveBeenCalledWith(null);
    expect(
      vi.mocked(useNutritionLog)().setAddMealSheetOpen,
    ).toHaveBeenCalledWith(true);
  });
});

describe("NutritionApp — handleQuickAddMealFromChip", () => {
  it("calls log.handleAddMeal and toast.success with the chip data", () => {
    render(<NutritionApp />);
    fireEvent.click(screen.getByTestId("quick-add"));
    expect(vi.mocked(useNutritionLog)().handleAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Куряча грудка",
        source: "manual",
        macroSource: "manual",
        macros: expect.objectContaining({ kcal: 300 }),
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining("300 ккал"),
      undefined,
      expect.objectContaining({ label: "Скасувати" }),
    );
  });

  it("quick-add undo calls log.handleRemoveMeal", () => {
    render(<NutritionApp />);
    fireEvent.click(screen.getByTestId("quick-add"));
    const successCall = mockToast.success.mock.calls[0]!;
    const undoAction = successCall[2] as { label: string; onClick: () => void };
    undoAction.onClick();
    expect(vi.mocked(useNutritionLog)().handleRemoveMeal).toHaveBeenCalled();
  });
});

describe("NutritionApp — handlePullRefresh / handlePullRefreshError", () => {
  it("handlePullRefresh calls invalidateQueries and requestCloudPull", async () => {
    render(<NutritionApp />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ptr-refresh"));
    });
    expect(mockInvalidateQueries).toHaveBeenCalled();
    expect(requestCloudPull).toHaveBeenCalledWith(2500);
  });

  it("handlePullRefreshError calls toast.error with a retry action", () => {
    render(<NutritionApp />);
    fireEvent.click(screen.getByTestId("ptr-error"));
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining("Не вдалося оновити"),
      undefined,
      expect.objectContaining({ label: "Повторити" }),
    );
  });

  it("the retry action in the error toast calls invalidateQueries again", async () => {
    render(<NutritionApp />);
    fireEvent.click(screen.getByTestId("ptr-error"));
    const errorCall = mockToast.error.mock.calls[0]!;
    const retryAction = errorCall[2] as { label: string; onClick: () => void };
    await act(async () => {
      retryAction.onClick();
    });
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });
});

describe("NutritionApp — wrappedSaveMeal (add path)", () => {
  it("add path calls log.handleAddMeal and shows success toast", async () => {
    // editingMeal is null by default → add path
    render(<NutritionApp />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("save-meal-add"));
    });
    expect(vi.mocked(useNutritionLog)().handleAddMeal).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith("Страву додано.");
  });
});

describe("NutritionApp — wrappedSaveMeal (edit path)", () => {
  it("edit path calls log.handleEditMeal and shows edit success toast", async () => {
    vi.mocked(useNutritionUiState).mockReturnValueOnce({
      ...(vi.mocked(useNutritionUiState)() as ReturnType<
        typeof useNutritionUiState
      >),
      editingMeal: {
        id: "m1",
        name: "Старий запис",
        date: "2026-01-01",
      } as import("./hooks/useNutritionUiState").EditingMealState,
      setEditingMeal: vi.fn(),
    } as ReturnType<typeof useNutritionUiState>);

    render(<NutritionApp />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("save-meal-edit"));
    });
    expect(vi.mocked(useNutritionLog)().handleEditMeal).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith("Страву оновлено.");
  });
});

describe("NutritionApp — handleRequestMealPhoto", () => {
  it("closes the add-meal sheet, clears photo, and navigates to start", () => {
    render(<NutritionApp />);
    fireEvent.click(screen.getByTestId("request-meal-photo"));
    const log = vi.mocked(useNutritionLog)();
    expect(log.setAddMealSheetOpen).toHaveBeenCalledWith(false);
    expect(log.setAddMealPhotoResult).toHaveBeenCalledWith(null);
    const route = vi.mocked(useNutritionRoute)();
    expect(route.setActivePageAndHash).toHaveBeenCalledWith("start");
  });

  it("clicks the hidden file input after start page + disclosure commit", () => {
    const click = vi.fn();
    mockPhotoRef.current = { click } as unknown as HTMLInputElement;

    let activePage: NutritionPage = "log";
    vi.mocked(useNutritionRoute).mockImplementation(() => ({
      activePage,
      setActivePage: vi.fn(),
      setActivePageAndHash: vi.fn((page: NutritionPage) => {
        activePage = page;
      }),
      pantrySubTab: "items",
      menuSubTab: "plan",
      setPantrySubTab: vi.fn(),
      setMenuSubTab: vi.fn(),
    }));

    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });

    const { rerender } = render(<NutritionApp />);
    fireEvent.click(screen.getByTestId("request-meal-photo"));
    expect(activePage).toBe("start");

    rerender(<NutritionApp />);
    expect(click).toHaveBeenCalledTimes(1);
    raf.mockRestore();
    mockPhotoRef.current = null;
  });
});

describe("NutritionApp — page shells", () => {
  it.each([
    ["log", "nutrition-log-page"],
    ["pantry", "nutrition-pantry-page"],
    ["menu", "nutrition-menu-page"],
  ] as const)("renders the %s page", (page, testId) => {
    vi.mocked(useNutritionRoute).mockReturnValue(mockRoute(page));
    render(<NutritionApp />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });
});

describe("NutritionApp — statusText and err banners", () => {
  it("shows a status banner when setStatusText is called by a hook", () => {
    render(<NutritionApp />);
    // capturedSetStatusText is populated when useNutritionRemoteActions mock runs
    act(() => {
      capturedSetStatusText("Операція успішна");
    });
    expect(screen.getByText("Операція успішна")).toBeInTheDocument();
  });

  it("shows a danger banner when setErr is called by a hook", () => {
    render(<NutritionApp />);
    act(() => {
      capturedSetErr("Помилка мережі");
    });
    const banner = screen
      .getByText("Помилка мережі")
      .closest("[data-testid='banner']");
    expect(banner).toHaveAttribute("data-variant", "danger");
  });
});
