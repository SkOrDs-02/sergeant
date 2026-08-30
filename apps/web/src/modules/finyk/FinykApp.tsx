import { useState, useEffect, useRef, Suspense } from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useMonobank } from "./hooks/useMonobank";
import { usePrivatbank } from "./hooks/usePrivatbank";
import { useStorage } from "./hooks/useStorage";
import { readRaw } from "./lib/finykStorage";
import { FINYK_MANUAL_ONLY_KEY, enableFinykManualOnly } from "./lib/demoData";
import { ModuleBottomNav } from "@shared/components/ui/ModuleBottomNav";
import { messages } from "@shared/i18n/uk";
import {
  MeshBackground,
  ModuleAccentProvider,
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
  ModuleHeaderHubButton,
  ModuleHeaderSettingsButton,
  SwipePages,
} from "@shared/components/layout";
import { NoBankBanner } from "./components/NoBankBanner";
import { FinykManualExpenseConflictBanner } from "./components/FinykManualExpenseConflictBanner";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { tryShowCrossModulePrompt } from "@shared/lib/modules/crossModulePrompt";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import { Overview } from "./pages/Overview";
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";

import {
  Analytics,
  Assets,
  Budgets,
  Transactions,
  preloadFinykPage,
  useWarmFinykPages,
} from "./pages/lazyPages";

import { ManualExpenseSheet } from "./components/ManualExpenseSheet";
import { FinykLoginScreen } from "./components/FinykLoginScreen";
import { FinykScanEntryPoints } from "./components/FinykScanEntryPoints";
import { NAV_ICONS, NAV_IDS, NAV_ITEMS } from "./components/finykNav";
import { useFinykRoute, useFinykQueryParam } from "./hooks/useFinykRoute";
import { useUnifiedFinanceData } from "./hooks/useUnifiedFinanceData";
import { useFinykQuickStatsWriter } from "./hooks/useFinykQuickStatsWriter";
import { useFinykPersonalization } from "./hooks/useFinykPersonalization";
import { useFinykReceiptLinks } from "./hooks/useFinykReceiptLinks";
import { useMonoTokenMigration } from "./hooks/useMonoTokenMigration";
import { consumePresetPrefill } from "../../core/onboarding/presetPrefill";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";
import { getSyncTone } from "./components/SyncIndicator";
import { AuthErrorBanner, FinykHeaderIcon, SyncPill } from "./FinykAppChrome";

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
  // Device-local чек↔транзакція лінки (спека § Розгортка) — одне джерело
  // для індикатора в списку транзакцій І для write-through записувача
  // ReceiptScanSheet/BulkImportSheet (`FinykScanEntryPoints`).
  const receiptLinks = useFinykReceiptLinks();
  const [page, navigate] = useFinykRoute();
  const focusLimitCategoryId = useFinykQueryParam("cat");
  const focusAssetSection = useFinykQueryParam("section");
  const focusTransactionDate = useFinykQueryParam("date");

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
  // Аркуш масового імпорту живе тут, а не в `FinykScanEntryPoints`: його
  // відкривають два входи — FAB і плашка нагадування в Огляді.
  const [showBulkImport, setShowBulkImport] = useState(false);
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
      const loadSync = () => {
        if (storage.loadFromUrl()) {
          toast.success("Налаштування синхронізовано!");
          return;
        }
        // Читання з URL чисте — повтор безпечний. Без кнопки користувач,
        // що прийшов саме по sync-лінку, лишався ні з чим і без підказки.
        toast.error("Не вдалось завантажити синк-дані", undefined, {
          label: "Повторити",
          onClick: loadSync,
        });
      };
      loadSync();
    }
  }, [storage, toast]);

  // AI-CONTEXT: тут БУВ одноразовий ефект, що з `/finyk` кидав першого
  // користувача на `/finyk/budgets` (фінплан). Аудит зафіксував це як
  // розбіжність A2 — канон finyk §8 каже, що bank-connected і manual-only
  // рівноправні, а редірект навʼязував третій сценарій, якого не обирав
  // ніхто. Founder ухвалив 2026-07-25: перший вхід — **порожній екран
  // finyk із ненавʼязливими підказками**, ні budgets-first, ні екран
  // вибору режиму. Тому редіректу більше немає: користувач лишається на
  // default-сторінці `overview`, яка при нульових даних показує
  // `ModuleEmptyState`. Прапорець first-run НЕ видалено — він і далі
  // живить підказку у Плануванні, коли юзер дійде туди сам.

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

  // Warm sibling page chunks at idle (see `pages/lazyPages`).
  useWarmFinykPages(NAV_IDS);

  const { mergedMono } = useUnifiedFinanceData({
    mono,
    privat,
    hiddenAccountIds: storage.hiddenAccounts,
  });
  // Keep the Hub finyk bento card's quick-stats snapshot in sync with real
  // data (manual expenses + Monobank), not just the onboarding demo seed.
  useFinykQuickStatsWriter({ mono: mergedMono, storage });
  const { frequentCategories, frequentMerchants } = useFinykPersonalization({
    mono: mergedMono,
    storage,
  });

  const { clientInfo, connecting, error, authError, connect } = mono;
  const hasConnectedProvider = clientInfo != null || privat.connected;
  // Pass `connected` so the pill does not claim "ок" when no bank account
  // has ever been linked — clientInfo is null until the first successful sync.
  const syncTone = getSyncTone(mergedMono?.syncState, hasConnectedProvider);
  const showSyncPill = hasConnectedProvider;

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
            onOpenBulkImport={() => setShowBulkImport(true)}
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
            receiptLinks={receiptLinks}
            categoryFilter={categoryFilter}
            onClearCategoryFilter={() => setCategoryFilter(null)}
            dayFilter={focusTransactionDate}
            onClearDayFilter={() => navigate("transactions")}
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
          <Analytics
            mono={mergedMono}
            storage={storage}
            onSelectCategory={(categoryId) => {
              // Порядок важливий: спершу кладемо категорію, тоді
              // переходимо. `Transactions` монтується вже з нею й одразу
              // показує звужений список — інакше був би кадр із повним.
              setCategoryFilter(categoryId);
              navigate("transactions");
            }}
          />
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
            initialOpenSubscriptions={focusAssetSection === "subscriptions"}
          />
        </SectionErrorBoundary>
      );
    }
    return null;
  };

  // Show nutrition prompt after save (lines extracted for clarity)
  const handleExpenseSave = (expense?: {
    id?: string;
    category?: string;
    kind?: "expense" | "income";
  }) => {
    const isIncome = expense?.kind === "income";
    if (expense?.id) {
      storage.editManualExpense?.(expense.id, expense);
      toast.success(isIncome ? "Надходження оновлено." : "Витрату оновлено.");
      return "updated";
    }
    storage.addManualExpense(expense ?? {});
    toast.success(isIncome ? "Надходження додано." : "Витрату додано.");
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
      {/* `bottom-nav-height-var` — модуль малює власний `ModuleBottomNav`,
          тож змінну для портальованих `Sheet` має виставити саме він:
          маршрутна оболонка (`core/app/ModuleShell`) навігації не володіє. */}
      <MeshBackground className="bottom-nav-height-var">
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
            <div className="flex items-center gap-2 shrink-0">
              {showSyncPill ? <SyncPill syncTone={syncTone} /> : null}
              <button
                type="button"
                onClick={() => setShowBalance(!showBalance)}
                className="focus-ring shrink-0 w-11 h-11 flex items-center justify-center rounded-full text-subtle hover:text-text hover:bg-panelHi transition-colors"
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

        <SwipePages
          ids={NAV_IDS}
          activeId={page}
          onChange={(next) => {
            preloadFinykPage(next);
            navigate(next);
          }}
        >
          <Suspense fallback={<ModulePageLoader module="finyk" />}>
            {renderPage()}
          </Suspense>
        </SwipePages>

        {!showLoginOverlay && (
          <FinykScanEntryPoints
            onAddExpense={() => {
              setEditingManualExpenseId(null);
              setShowExpenseSheet(true);
            }}
            storage={storage}
            onReceiptLinked={receiptLinks.recordReceiptLink}
            customCategories={storage.customCategories}
            bulkImportOpen={showBulkImport}
            onBulkImportOpenChange={setShowBulkImport}
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
          receiptId={
            editingManualExpenseId
              ? receiptLinks.getReceiptId(editingManualExpenseId)
              : null
          }
          txSplits={storage.txSplits}
          onSplitChange={storage.setSplitTx}
          frequentCategories={frequentCategories}
          frequentMerchants={frequentMerchants}
          customCategories={storage.customCategories}
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
            const isIncome = snapshot?.kind === "income";
            storage.removeManualExpense(id);
            setEditingManualExpenseId(null);
            if (snapshot) {
              showUndoToast(toast, {
                msg: isIncome ? "Видалив надходження" : "Видалив витрату",
                onUndo: () => storage.restoreManualExpense(snapshot),
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
          onPrefetch={preloadFinykPage}
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

// FinykHeaderIcon / SyncPill / AuthErrorBanner extracted to
// `./FinykAppChrome` (Hard Rule #18 headroom — see that file's docstring).
