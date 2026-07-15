import { useState, useEffect, useRef, Suspense } from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { lazyImport } from "../../core/lib/lazyImport";
import { useSwipeNavigation } from "@shared/hooks/useSwipeNavigation";
import { useMonobank } from "./hooks/useMonobank";
import { usePrivatbank } from "./hooks/usePrivatbank";
import { useStorage } from "./hooks/useStorage";
import { readRaw } from "./lib/finykStorage";
import { FINYK_MANUAL_ONLY_KEY, enableFinykManualOnly } from "./lib/demoData";
import { ModuleBottomNav } from "@shared/components/ui/ModuleBottomNav";
import { messages } from "@shared/i18n/uk";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import {
  MeshBackground,
  ModuleAccentProvider,
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
  ModuleHeaderHubButton,
  ModuleHeaderSettingsButton,
} from "@shared/components/layout";
import { NoBankBanner } from "./components/NoBankBanner";
import { FinykManualExpenseConflictBanner } from "./components/FinykManualExpenseConflictBanner";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { tryShowCrossModulePrompt } from "@shared/lib/modules/crossModulePrompt";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import { Overview } from "./pages/Overview";
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";

// Lazy pages. Import the concrete page modules, not the folders: the
// `pages/{transactions,budgets}/index.ts` barrels were removed as dead
// code in #3504 (Knip can't see dynamic directory imports), which left
// these two imports unresolved and broke the Vercel production build.
const Transactions = lazyImport(
  () => import("./pages/transactions/Transactions"),
  "Transactions",
);
const Budgets = lazyImport(() => import("./pages/budgets/Budgets"), "Budgets");
const Assets = lazyImport(() => import("./pages/Assets"), "Assets");
const Analytics = lazyImport(() => import("./pages/Analytics"), "Analytics");

import { ManualExpenseSheet } from "./components/ManualExpenseSheet";
import { FinykLoginScreen } from "./components/FinykLoginScreen";
import { NAV_ICONS, NAV_IDS, NAV_ITEMS } from "./components/finykNav";
import { useFinykRoute, useFinykQueryParam } from "./hooks/useFinykRoute";
import { useUnifiedFinanceData } from "./hooks/useUnifiedFinanceData";
import { useFinykPersonalization } from "./hooks/useFinykPersonalization";
import { useMonoTokenMigration } from "./hooks/useMonoTokenMigration";
import { consumePresetPrefill } from "../../core/onboarding/presetPrefill";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";
import {
  getSyncTone,
  SwipeProgressBar,
  SWIPE_THRESHOLD_PX,
} from "./components/SyncIndicator";

const PRIVAT_ENABLED = false;

interface FinykAppProps {
  onBackToHub?: () => void;
  onGoToHub?: () => void;
  onOpenSettings?: () => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function App({
  onBackToHub,
  onGoToHub,
  onOpenSettings,
  pwaAction,
  onPwaActionConsumed,
}: FinykAppProps = {}) {
  const mono = useMonobank();
  const privat = usePrivatbank(PRIVAT_ENABLED);
  useMonoTokenMigration(true);
  const toast = useToast();
  const storage = useStorage({ toast });
  const [page, navigate] = useFinykRoute();
  const focusLimitCategoryId = useFinykQueryParam("cat");

  // First-run state
  const { firstRun: firstRunFinyk, markSeen: markFinykSeen } =
    useModuleFirstRun("finyk");
  const [firstRunFinykSurface, setFirstRunFinykSurface] =
    useState(firstRunFinyk);
  if (firstRunFinyk && !firstRunFinykSurface) {
    setFirstRunFinykSurface(true);
  }
  const firstRunFinykActive = firstRunFinykSurface && page === "budgets";

  // State
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const showBalance = storage.showBalance;
  const setShowBalance = storage.setShowBalance;
  const [showExpenseSheet, setShowExpenseSheet] = useState(false);
  const [showLoginOverlay, setShowLoginOverlay] = useState(false);
  const loginOverlayRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(showLoginOverlay, loginOverlayRef, {
    onEscape: () => setShowLoginOverlay(false),
    inertBackground: true,
  });
  const [editingManualExpenseId, setEditingManualExpenseId] = useState<
    string | null
  >(null);
  const [quickAddCategory, setQuickAddCategory] = useState<string | null>(null);
  const [quickAddDescription, setQuickAddDescription] = useState<string | null>(
    null,
  );
  const [manualOnly, setManualOnly] = useState(
    () => readRaw(FINYK_MANUAL_ONLY_KEY, "") === "1",
  );

  const syncHandledRef = useRef(false);
  useEffect(() => {
    if (syncHandledRef.current) return;
    syncHandledRef.current = true;
    if (window.location.search.includes("sync=")) {
      const ok = storage.loadFromUrl();
      if (ok) toast.success("Налаштування синхронізовано!");
      else toast.error("Не вдалось завантажити синк-даних");
    }
  }, [storage, toast]);

  const firstRunNavHandledRef = useRef(false);
  useEffect(() => {
    if (firstRunNavHandledRef.current) return;
    firstRunNavHandledRef.current = true;
    if (!firstRunFinyk) return;
    if (pwaAction === "add_expense") return;
    if (page !== "budgets") navigate("budgets");
  }, [firstRunFinyk, pwaAction, page, navigate]);

  // PWA action: open add-expense sheet when the OS deep-link fires.
  const prevPwaActionRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (pwaAction !== "add_expense") {
      prevPwaActionRef.current = pwaAction;
      return;
    }
    if (prevPwaActionRef.current === "add_expense") return;
    prevPwaActionRef.current = "add_expense";

    void Promise.resolve().then(() => {
      const prefill = consumePresetPrefill("finyk");
      navigate("transactions");
      setEditingManualExpenseId(null);
      setQuickAddCategory(
        typeof prefill?.["category"] === "string" ? prefill["category"] : null,
      );
      setQuickAddDescription(
        typeof prefill?.["description"] === "string"
          ? prefill["description"]
          : null,
      );
      setShowExpenseSheet(true);
      onPwaActionConsumed?.();
    });
  }, [
    pwaAction,
    navigate,
    setEditingManualExpenseId,
    setQuickAddCategory,
    setQuickAddDescription,
    setShowExpenseSheet,
    onPwaActionConsumed,
  ]);

  const { mergedMono } = useUnifiedFinanceData({ mono, privat });
  const { frequentCategories, frequentMerchants } = useFinykPersonalization({
    mono: mergedMono,
    storage,
  });

  const { clientInfo, connecting, error, authError, connect } = mono;
  const hasConnectedProvider = clientInfo != null || privat.connected;
  // Pass `connected` so the pill does not claim "ок" when no bank account
  // has ever been linked — clientInfo is null until the first successful sync.
  const syncTone = getSyncTone(mergedMono?.syncState, hasConnectedProvider);
  const showSyncPill =
    hasConnectedProvider &&
    ["loading", "partial", "error"].includes(
      String(mergedMono?.syncState?.status ?? ""),
    );

  // Swipe navigation
  const curPageIdx = NAV_IDS.indexOf(page);
  const swipe = useSwipeNavigation({
    onSwipeLeft: () => {
      const next = NAV_IDS[curPageIdx + 1];
      if (next !== undefined) navigate(next);
    },
    onSwipeRight: () => {
      const next = NAV_IDS[curPageIdx - 1];
      if (next !== undefined) navigate(next);
    },
    threshold: SWIPE_THRESHOLD_PX,
    atStart: curPageIdx === 0,
    atEnd: curPageIdx === NAV_IDS.length - 1,
  });
  const swipeDx = swipe.dragDx;

  // Auto-close login overlay on successful connect
  if (clientInfo && showLoginOverlay) {
    setShowLoginOverlay(false);
  }

  const showNoBankBanner = !hasConnectedProvider && !manualOnly;

  // Page render helpers
  const renderPage = () => {
    if (page === "overview") {
      return (
        <SectionErrorBoundary
          key="page-overview"
          title="Не вдалось показати «Огляд»"
        >
          <Overview
            mono={mergedMono}
            storage={storage}
            onNavigate={navigate}
            showBalance={showBalance}
          />
        </SectionErrorBoundary>
      );
    }
    if (page === "transactions") {
      return (
        <SectionErrorBoundary
          key="page-transactions"
          title="Не вдалось показати «Операції»"
        >
          <Transactions
            mono={mergedMono}
            storage={storage}
            showBalance={showBalance}
            categoryFilter={categoryFilter}
            onClearCategoryFilter={() => setCategoryFilter(null)}
            onEditManualExpense={(id) => {
              setEditingManualExpenseId(String(id));
              setShowExpenseSheet(true);
            }}
          />
        </SectionErrorBoundary>
      );
    }
    if (page === "budgets") {
      return (
        <SectionErrorBoundary
          key="page-budgets"
          title="Не вдалось показати «Планування»"
        >
          <Budgets
            mono={mergedMono}
            storage={storage}
            showBalance={showBalance}
            focusLimitCategoryId={focusLimitCategoryId}
            monthlyPlanFirstRunHint={firstRunFinykActive}
            onDismissMonthlyPlanFirstRunHint={() => {
              markFinykSeen();
              setFirstRunFinykSurface(false);
            }}
          />
        </SectionErrorBoundary>
      );
    }
    if (page === "analytics") {
      return (
        <SectionErrorBoundary
          key="page-analytics"
          title="Не вдалось показати «Аналітику»"
        >
          <Analytics mono={mergedMono} storage={storage} />
        </SectionErrorBoundary>
      );
    }
    if (page === "assets") {
      return (
        <SectionErrorBoundary
          key="page-assets"
          title="Не вдалось показати «Активи»"
        >
          <Assets
            mono={mergedMono}
            storage={storage}
            showBalance={showBalance}
          />
        </SectionErrorBoundary>
      );
    }
    return null;
  };

  // Show nutrition prompt after save (lines extracted for clarity)
  const handleExpenseSave = (expense?: { id?: string; category?: string }) => {
    if (expense?.id) {
      storage.editManualExpense?.(expense.id, expense);
      toast.success("Витрату оновлено.");
      return "updated";
    }
    storage.addManualExpense(expense ?? {});
    toast.success("Витрату додано.");
    return "added";
  };

  const handlePostSavePrompt = (expense?: { category?: string }) => {
    const cat = String(expense?.category || "");
    const promptId =
      cat === "cafe"
        ? "finyk-restaurant-to-meal"
        : cat === "food"
          ? "finyk-food-to-meal"
          : null;
    if (!promptId) return;
    const msg =
      promptId === "finyk-restaurant-to-meal"
        ? "Додати прийом їжі з кафе?"
        : "Додати прийом їжі з продуктів?";
    tryShowCrossModulePrompt(toast, {
      id: promptId,
      msg,
      acceptLabel: "Додати →",
      onAccept: () => openHubModuleWithAction("nutrition", "add_meal"),
    });
  };

  // Render
  return (
    <ModuleAccentProvider module="finyk" className="contents">
      <MeshBackground>
        <ModuleHeader
          module="finyk"
          left={
            typeof onBackToHub === "function" ? (
              <div className="flex items-center gap-1">
                <ModuleHeaderBackButton onClick={onBackToHub} />
                {typeof onGoToHub === "function" && (
                  <ModuleHeaderHubButton onClick={onGoToHub} />
                )}
              </div>
            ) : (
              <FinykHeaderIcon />
            )
          }
          title="Фінік"
          subtitle="Фінанси"
          right={
            <div className="flex items-center gap-2">
              {showSyncPill ? <SyncPill syncTone={syncTone} /> : null}
              <button
                type="button"
                onClick={() => setShowBalance(!showBalance)}
                className="focus-ring w-11 h-11 flex items-center justify-center rounded-full text-subtle hover:text-text hover:bg-panelHi transition-colors"
                aria-label={showBalance ? "Приховати суми" : "Показати суми"}
                title={showBalance ? "Приховати суми" : "Показати суми"}
              >
                <Icon name={showBalance ? "eye" : "eye-off"} size="lg" />
              </button>
              <ModuleHeaderAssistantButton />
              {onOpenSettings && (
                <ModuleHeaderSettingsButton onClick={onOpenSettings} />
              )}
            </div>
          }
        />

        {showNoBankBanner && (
          <NoBankBanner
            onConnect={() => setShowLoginOverlay(true)}
            onContinueManually={() => {
              enableFinykManualOnly();
              setManualOnly(true);
            }}
          />
        )}

        <FinykManualExpenseConflictBanner />

        <div
          className="flex-1 overflow-hidden flex flex-col min-h-0 touch-pan-y relative"
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <SwipeProgressBar swipeDx={swipeDx} threshold={SWIPE_THRESHOLD_PX} />
          <div
            key={`page-${page}`}
            className="flex-1 overflow-hidden flex flex-col min-h-0 motion-safe:animate-fade-in"
            style={getSwipeStyle(swipeDx)}
          >
            <Suspense fallback={<ModulePageLoader module="finyk" />}>
              {renderPage()}
            </Suspense>
          </div>
        </div>

        {!showLoginOverlay &&
          (page === "overview" ||
            page === "transactions" ||
            page === "budgets") && (
            <FloatingActionButton
              variant="v2-finyk"
              icon="plus"
              onClick={() => {
                setEditingManualExpenseId(null);
                setShowExpenseSheet(true);
              }}
              aria-label="Додати витрату"
            />
          )}

        {mono.authError && (
          <AuthErrorBanner
            authError={mono.authError}
            onBackToHub={onBackToHub}
            setAuthError={mono.setAuthError}
          />
        )}

        <ManualExpenseSheet
          open={showExpenseSheet}
          onClose={() => {
            setShowExpenseSheet(false);
            setEditingManualExpenseId(null);
            setQuickAddCategory(null);
            setQuickAddDescription(null);
          }}
          initialExpense={
            editingManualExpenseId
              ? (storage.manualExpenses || []).find(
                  (e) => String(e.id) === String(editingManualExpenseId),
                ) || null
              : null
          }
          initialCategory={quickAddCategory}
          initialDescription={quickAddDescription}
          frequentCategories={frequentCategories}
          frequentMerchants={frequentMerchants}
          onSave={(expense) => {
            handleExpenseSave(expense);
            handlePostSavePrompt(expense);
          }}
          onDelete={(id) => {
            // Capture the full expense BEFORE deleting so undo can
            // re-insert it faithfully. `addManualExpense` preserves the
            // original id when the snapshot carries one, so the restored
            // record keeps its id/amount/category/date.
            const snapshot = (storage.manualExpenses || []).find(
              (e) => String(e.id) === String(id),
            );
            storage.removeManualExpense(id);
            setEditingManualExpenseId(null);
            if (snapshot) {
              showUndoToast(toast, {
                msg: "Видалив витрату",
                onUndo: () => storage.addManualExpense(snapshot),
              });
            } else {
              toast.success("Видалив витрату");
            }
          }}
        />

        <ModuleBottomNav
          items={NAV_ITEMS.map((item) => ({
            id: item.id,
            label: item.label,
            icon: NAV_ICONS[item.id],
          }))}
          activeId={page}
          onChange={navigate}
          module="finyk"
          ariaLabel={messages.nav.finykSections}
        />

        {showLoginOverlay && (
          <div
            ref={loginOverlayRef}
            className="fixed inset-0 z-50 overflow-y-auto bg-bg"
            role="dialog"
            aria-modal="true"
            aria-label="Підключення Monobank"
          >
            <FinykLoginScreen
              authError={authError}
              error={error}
              connecting={connecting}
              onConnect={(token) => connect(token)}
              onContinueWithoutBank={() => {
                enableFinykManualOnly();
                setManualOnly(true);
                setShowLoginOverlay(false);
              }}
              onBackToHub={() => setShowLoginOverlay(false)}
              backLabel="Назад"
            />
          </div>
        )}
      </MeshBackground>
    </ModuleAccentProvider>
  );
}

// Extracted components for module accent containment (Rule #12)

function FinykHeaderIcon(): React.ReactElement {
  return (
    <div
      className="shrink-0 w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success-strong dark:text-success border border-success/15"
      aria-hidden
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    </div>
  );
}

interface SyncPillProps {
  syncTone: { dot: string; text: string; pill: string };
}

function SyncPill({ syncTone }: SyncPillProps): React.ReactElement {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 select-none",
        "text-style-caption px-2 py-0.5 rounded-full border",
        "transition-colors duration-200",
        syncTone.pill,
      )}
      role="status"
      aria-label={`Стан синхронізації: ${syncTone.text}`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", syncTone.dot)} />
      <span>{syncTone.text}</span>
    </div>
  );
}

interface AuthErrorBannerProps {
  authError: string;
  onBackToHub?: (() => void) | undefined;
  setAuthError: (msg: string) => void;
}

function AuthErrorBanner({
  authError,
  onBackToHub,
  setAuthError,
}: AuthErrorBannerProps): React.ReactElement {
  // Offset clears the in-flow ModuleHeader stack: safe-area-pt + 68px title
  // row (min-h-[68px], ModuleHeader.tsx) + ~40px ModuleSwitcher row.
  return (
    <div
      role="alert"
      className="fixed top-[calc(108px+env(safe-area-inset-top,0)+8px)] left-4 right-4 z-50 max-w-lg mx-auto"
    >
      <div className="bg-warning/15 border border-warning/40 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-card">
        <Icon
          name="alert-triangle"
          size={18}
          className="shrink-0 mt-0.5 text-warning-strong dark:text-warning"
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <p className="text-style-label text-text">Токен потребує оновлення</p>
          <p className="text-xs text-muted mt-0.5">{authError}</p>
          {onBackToHub && (
            <button
              type="button"
              onClick={onBackToHub}
              className="focus-ring rounded-xl text-style-caption text-primary mt-2 hover:underline"
            >
              Оновити токен у Налаштуваннях Hub
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAuthError("")}
          className="focus-ring rounded-xl text-muted hover:text-text transition-colors shrink-0"
          aria-label="Закрити"
        >
          <Icon name="close" size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// Swipe transform style helper
function getSwipeStyle(swipeDx: number): React.CSSProperties {
  if (swipeDx !== 0) {
    return {
      transform: `translate3d(${swipeDx * 0.45}px, 0, 0)`,
      transition: "none",
      willChange: "transform",
    };
  }
  return {
    transform: "translate3d(0, 0, 0)",
    transition: "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
  };
}
