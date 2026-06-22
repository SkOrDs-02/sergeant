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
import { AIPill } from "@shared/components/ui/AIPill";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import {
  MeshBackground,
  ModuleAccentProvider,
  ModuleHeader,
  ModuleHeaderBackButton,
  ModuleHeaderSettingsButton,
} from "@shared/components/layout";
import { NoBankBanner } from "./components/NoBankBanner";
import { FinykManualExpenseConflictBanner } from "./components/FinykManualExpenseConflictBanner";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { cn } from "@shared/lib/ui/cn";
import { useToast } from "@shared/hooks/useToast";
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
  onOpenSettings?: () => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function App({
  onBackToHub,
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
  useEffect(() => {
    if (firstRunFinyk) setFirstRunFinykSurface(true);
  }, [firstRunFinyk]);
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

  // Mount-only URL sync effect
  useEffect(() => {
    if (window.location.search.includes("sync=")) {
      const ok = storage.loadFromUrl();
      if (ok) toast.success("Налаштування синхронізовано!");
      else toast.error("Не вдалось завантажити синк-даних");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount-only first-run navigation
  useEffect(() => {
    if (!firstRunFinyk) return;
    if (pwaAction === "add_expense") return;
    if (page !== "budgets") navigate("budgets");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // PWA action effect (navigate is stable)
  useEffect(() => {
    if (pwaAction !== "add_expense") return;
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
  }, [
    navigate,
    pwaAction,
    onPwaActionConsumed,
    setEditingManualExpenseId,
    setQuickAddCategory,
    setQuickAddDescription,
    setShowExpenseSheet,
  ]);

  const { mergedMono } = useUnifiedFinanceData({ mono, privat });
  const { frequentCategories, frequentMerchants } = useFinykPersonalization({
    mono: mergedMono,
    storage,
  });

  const { clientInfo, connecting, error, authError, connect } = mono;
  // Pass `connected` so the pill does not claim "ок" when no bank account
  // has ever been linked — clientInfo is null until the first successful sync.
  const syncTone = getSyncTone(mergedMono?.syncState, clientInfo != null);

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
  useEffect(() => {
    if (clientInfo && showLoginOverlay) {
      setShowLoginOverlay(false);
    }
  }, [clientInfo, showLoginOverlay]);

  const showNoBankBanner = !clientInfo && !manualOnly;

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
    <ModuleAccentProvider module="finyk">
      <MeshBackground>
        <ModuleHeader
          module="finyk"
          left={
            typeof onBackToHub === "function" ? (
              <ModuleHeaderBackButton onClick={onBackToHub} />
            ) : (
              <FinykHeaderIcon />
            )
          }
          title="ФІНІК"
          subtitle="Monobank · бюджети"
          right={
            <div className="flex items-center gap-2">
              <SyncPill
                syncTone={syncTone}
                showBalance={showBalance}
                setShowBalance={setShowBalance}
              />
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
            storage.removeManualExpense(id);
            setEditingManualExpenseId(null);
            toast.success("Витрату видалено.");
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

        {!showLoginOverlay && <AIPill module="finyk" />}

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
  showBalance: boolean;
  setShowBalance: (v: boolean) => void;
}

function SyncPill({
  syncTone,
  showBalance,
  setShowBalance,
}: SyncPillProps): React.ReactElement {
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
      <span className="sr-only sm:not-sr-only">{syncTone.text}</span>
      <button
        type="button"
        onClick={() => setShowBalance(!showBalance)}
        className="focus-ring w-11 h-11 flex items-center justify-center rounded-xl text-subtle hover:text-text hover:bg-panelHi transition-colors"
        aria-label={showBalance ? "Приховати суми" : "Показати суми"}
        title={showBalance ? "Приховати суми" : "Показати суми"}
      >
        {showBalance ? <EyeOpenIcon /> : <EyeClosedIcon />}
      </button>
    </div>
  );
}

function EyeOpenIcon(): React.ReactElement {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosedIcon(): React.ReactElement {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
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
        <span className="text-lg shrink-0 mt-0.5">⚠️</span>
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
          ✕
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
