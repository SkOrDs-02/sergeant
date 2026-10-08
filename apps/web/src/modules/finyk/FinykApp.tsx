import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useMonobank } from "./hooks/useMonobank";
import { usePrivatbank } from "./hooks/usePrivatbank";
import { useStorage } from "./hooks/useStorage";
import { readRaw, writeRaw } from "./lib/finykStorage";
import { FINYK_BANK_BANNER_DISMISSED_AT_KEY } from "@sergeant/finyk-domain/storage-keys";
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
import { shouldShowNoBankBanner } from "./components/NoBankBanner.visibility";
import { useBankBannerClock } from "./hooks/useBankBannerClock";
import { FinykManualExpenseConflictBanner } from "./components/FinykManualExpenseConflictBanner";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { useToast } from "@shared/hooks/useToast";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { formatMoney } from "@sergeant/shared";
import type { TxSplit } from "@sergeant/finyk-domain/domain/types";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { tryShowCrossModulePrompt } from "@shared/lib/modules/crossModulePrompt";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import { Overview } from "./pages/Overview";
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";

import {
  Analytics,
  Assets,
  Budgets,
  PlanningSubscriptions,
  Transactions,
  preloadFinykPage,
  useWarmFinykPages,
} from "./pages/lazyPages";

import { ManualExpenseSheet } from "./components/ManualExpenseSheet";
import { FinykLoginScreen } from "./components/FinykLoginScreen";
import { FinykScanEntryPoints } from "./components/FinykScanEntryPoints";
import { NAV_ICONS, NAV_IDS, NAV_ITEMS } from "./components/finykNav";
import { useFinykRoute, useFinykQueryParam } from "./hooks/useFinykRoute";
import { useStorageWarmGate } from "./hooks/useStorageWarmGate";
import { useUnifiedFinanceData } from "./hooks/useUnifiedFinanceData";
import { useFinykQuickStatsWriter } from "./hooks/useFinykQuickStatsWriter";
import { useFinykPersonalization } from "./hooks/useFinykPersonalization";
import { useFinykReceiptLinks } from "./hooks/useFinykReceiptLinks";
import { useMonoTokenMigration } from "./hooks/useMonoTokenMigration";
import { useDebtPaymentSplitSync } from "./hooks/useDebtPaymentSplitSync";
import { consumePresetPrefill } from "../../core/onboarding/presetPrefill";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";
import { getSyncTone } from "./components/SyncIndicator";
import { AuthErrorBanner, FinykHeaderIcon, SyncPill } from "./FinykAppChrome";

// AI-NOTE: інтеграцію ПриватБанку сховано рішенням власника 2026-09-30, поки
// у Привата немає API-токенів для користувачів. Код і дані не видаляти.
const PRIVAT_ENABLED = false;

interface FinykAppProps {
  onBackToHub?: () => void;
  onGoToHub?: () => void;
  onOpenSettings?: () => void;
  /**
   * Opens the account sign-in flow from the local-data durability banner
   * (`Overview`) and the anonymous receipt-scan / bulk-import gate
   * (`FinykScanEntryPoints`). Required (A1, аудит 2026-09-11 хвиля 2):
   * раніше опційний пропс давав два call-site-и мовчазний фолбек
   * (`onOpenAuth ?? (() => navigate("/auth"))` в `Overview`,
   * `onOpenAuth?.()` no-op в `FinykScanEntryPoints`) — обидва зникають,
   * коли shell зобов'язаний передати справжній обробник. Канонічне
   * джерело — `useOpenSignIn()`, підключене через `route.tsx` →
   * `useHubShell().onOpenAuth`.
   */
  onOpenAuth: () => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

const FINYK_PWA_ACTIONS: ReadonlySet<string> = new Set([
  "add_expense",
  "set_budget",
  "view_analytics",
  "connect_bank",
]);

export default function App({
  onBackToHub,
  onGoToHub,
  onOpenSettings,
  onOpenAuth,
  pwaAction,
  onPwaActionConsumed,
}: FinykAppProps) {
  const mono = useMonobank();
  const privat = usePrivatbank(PRIVAT_ENABLED);
  useMonoTokenMigration(true);
  const toast = useToast();
  const storage = useStorage({ toast });
  // Холодний старт: до прогріву SQLite-кешу форма запису не надсилається
  // (data-13), щоб тост «додано» не з'являвся над ще не прогрітим сховищем.
  const storageWarming = useStorageWarmGate(storage.storageReady);
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
  // Місяць дрил-дауну з Аналітики (month 1-based); одноразовий, як і категорія.
  const [categoryMonth, setCategoryMonth] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const showBalance = storage.showBalance;
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
  // Закриття банера «підключити банк» ховає його на 7 днів, а не назавжди
  // (рішення власника 2026-09-30); `manualOnly` лишається постійним вибором.
  const [bankBannerDismissedAt, setBankBannerDismissedAt] = useState<
    number | null
  >(() => {
    const n = Number(readRaw(FINYK_BANK_BANNER_DISMISSED_AT_KEY, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  // Комбінований пікер «Запланувати» на Плануванні (founder-UX audit
  // round 2, F2): `Budgets` і `PlanningSubscriptions` мають КОЖЕН свій
  // `useAssetsState`-інстанс, тож пункт «Підписка» з пікера в `Budgets` не
  // може викликати `openSubscriptionForm` з ІНШОГО інстансу напряму.
  // Лічильник-сигнал — найдешевший міст: інкремент у `Budgets`, ефект у
  // `PlanningSubscriptions` відкриває форму на кожній зміні значення.
  const [subscriptionFormSignal, setSubscriptionFormSignal] = useState(0);

  // AI-DANGER: приймача `?sync=…` тут більше немає (аудит 2026-10-01, data-26).
  // Він на маунті без підтвердження підміняв бюджети, план, категорії й
  // приховані рахунки даними з URL (а на холодному старті ще й хибно звітував
  // «синхронізовано»), хоча генератора посилань в UI давно нема. Не повертай
  // його без прев'ю з ConfirmDialog, застосування лише після `storageReady`,
  // валідації елементів і передачі payload у `#fragment`.

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

  // PWA/checklist action: the OS deep-link opens the add-expense sheet; the
  // Hub checklist steps land on the page where the step is done. Without the
  // three checklist cases every step opened Огляд, where «Підключити
  // Monobank» had nothing to tap once the no-bank banner hid itself.
  const prevPwaActionRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    if (!pwaAction || !FINYK_PWA_ACTIONS.has(pwaAction)) {
      prevPwaActionRef.current = pwaAction;
      return;
    }
    if (prevPwaActionRef.current === pwaAction) return;
    prevPwaActionRef.current = pwaAction;

    void Promise.resolve().then(() => {
      if (pwaAction !== "add_expense") {
        if (pwaAction === "connect_bank") setShowLoginOverlay(true);
        else navigate(pwaAction === "set_budget" ? "budgets" : "analytics");
        onPwaActionConsumed?.();
        return;
      }
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

  // Умова живе окремою чистою функцією поруч із самим банером — розбір
  // чому саме там, і що означає `inDemo`, у її докстрінгу (PR-F5).
  const bankBannerNow = useBankBannerClock(page, bankBannerDismissedAt);
  const showNoBankBanner = shouldShowNoBankBanner({
    hasConnectedProvider,
    manualOnly,
    manualExpenseCount: (storage.manualExpenses || []).length,
    dismissedAt: bankBannerDismissedAt,
    now: bankBannerNow,
    page,
  });

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
            onOpenAuth={onOpenAuth}
            showBalance={showBalance}
            onOpenBulkImport={() => setShowBulkImport(true)}
            onOpenSettings={onOpenSettings}
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
            categoryMonth={categoryMonth}
            onClearCategoryFilter={() => {
              setCategoryFilter(null);
              setCategoryMonth(null);
            }}
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
            planningSlot={
              <PlanningSubscriptions
                mono={mergedMono}
                storage={storage}
                showBalance={showBalance}
                initialOpen={focusAssetSection === "subscriptions"}
                initialOpenRecurring={focusAssetSection === "recurring"}
                openSubscriptionSignal={subscriptionFormSignal}
              />
            }
            onAddSubscription={() => setSubscriptionFormSignal((n) => n + 1)}
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
            showBalance={showBalance}
            onSelectCategory={(categoryId, period) => {
              // Порядок важливий: спершу кладемо категорію, тоді
              // переходимо. `Transactions` монтується вже з нею й одразу
              // показує звужений список — інакше був би кадр із повним.
              setCategoryFilter(categoryId);
              setCategoryMonth(period);
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
      acceptLabel: "Додати",
      onAccept: () => openHubModuleWithAction("nutrition", "add_meal"),
    });
  };

  // Запис, який зараз редагується. Піднято з JSX, бо його потребує і
  // аркуш, і звірка суми привʼязки нижче — а шукати двічі означало б
  // ризикнути тим, що дві гілки бачать різні записи.
  const editingManualExpense = editingManualExpenseId
    ? (storage.manualExpenses || []).find(
        (e) => String(e.id) === String(editingManualExpenseId),
      ) || null
    : null;

  // Рівень 3 для РУЧНОГО запису. Розподіл може змінитись уже ПІСЛЯ
  // привʼязки платежу — в аркуші ручної витрати такий шлях один
  // (розбивка за чеком Сільпо), але наслідок той самий, що й на
  // банківській операції: сума привʼязки лишається знімком і залишок
  // пасиву розходиться з фактом. Обгортка стоїть тут, бо мутатор сховища
  // сирої суми запису не бачить.
  //
  // **Гривні, не копійки.** `Transactions.tsx` ділить суму на 100, бо
  // банківська транзакція зберігає копійки; ручний запис зберігає
  // гривні (`domain-invariants.md` § Money — локальний блоб Фініка).
  // Поділити тут удруге означало б занизити погашення в сто разів.
  const splitSync = useDebtPaymentSplitSync(
    storage.manualDebts,
    storage.setLinkedTxRole,
    toast.success,
  );
  const handleManualSplitChange = useCallback(
    (id: string, splits: TxSplit[] | null) => {
      storage.setSplitTx(id, splits);
      const amountUAH = Math.abs(Number(editingManualExpense?.amount) || 0);
      if (String(editingManualExpense?.id ?? "") === id && amountUAH > 0) {
        splitSync.reconcile(id, splits, amountUAH);
      }
    },
    [storage, splitSync, editingManualExpense],
  );

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
              {/* «Приховати суми» переїхало в Налаштування → Фінік
                  (`core/settings/FinykSection.tsx`, рішення власника
                  2026-10-08, анти-слоп раунд 4, Q5): шість контролів у
                  шапці на 375px лишали назві модуля 27px, і «Фінік /
                  Фінанси» різалось до «Фі… / Фіна…». */}
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
              const now = Date.now();
              writeRaw(FINYK_BANK_BANNER_DISMISSED_AT_KEY, String(now));
              setBankBannerDismissedAt(now);
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
            onOpenAuth={onOpenAuth}
          />
        )}

        {mono.authError && (
          <AuthErrorBanner
            authError={mono.authError}
            onOpenSettings={onOpenSettings}
            onOpenAuth={onOpenAuth}
            setAuthError={mono.setAuthError}
          />
        )}

        <ManualExpenseSheet
          open={showExpenseSheet}
          storageLoading={storageWarming}
          onClose={() => {
            setShowExpenseSheet(false);
            setEditingManualExpenseId(null);
            setQuickAddCategory(null);
            setQuickAddDescription(null);
          }}
          initialExpense={editingManualExpense}
          initialCategory={quickAddCategory}
          initialDescription={quickAddDescription}
          receiptId={
            editingManualExpenseId
              ? receiptLinks.getReceiptId(editingManualExpenseId)
              : null
          }
          txSplits={storage.txSplits}
          onSplitChange={handleManualSplitChange}
          manualDebts={storage.manualDebts}
          setManualDebts={storage.setManualDebts}
          setLinkedTxRole={storage.setLinkedTxRole}
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
            const removedLinks = storage.removeManualExpense(id);
            setEditingManualExpenseId(null);
            if (snapshot) {
              showUndoToast(toast, {
                msg: isIncome ? "Надходження видалено" : "Витрату видалено",
                onUndo: () =>
                  storage.restoreManualExpense(snapshot, removedLinks),
              });
            } else {
              toast.success("Витрату видалено");
            }
          }}
        />

        <ModuleBottomNav
          items={NAV_ITEMS.map((item) => ({
            id: item.id,
            label: item.label,
            // Умовний спред, а не `visibleLabel: item.visibleLabel`:
            // під `exactOptionalPropertyTypes` явний `undefined` не те саме,
            // що відсутнє поле.
            ...(item.visibleLabel ? { visibleLabel: item.visibleLabel } : {}),
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
              onOpenAuth={onOpenAuth}
              backLabel="Назад"
            />
          </div>
        )}
        {/* Рівень 3: частки боргу в розподілі не лишилось. Питаємо, а не
            відвʼязуємо самі — людина може бути посеред редагування. */}
        {splitSync.pendingUnlink && (
          <ConfirmDialog
            open
            title={messages.finyk.debtSplitSync.unlinkTitle}
            description={messages.finyk.debtSplitSync.unlinkQuestion
              .replace("{debt}", splitSync.pendingUnlink.debtName)
              .replace(
                "{amount}",
                formatMoney(splitSync.pendingUnlink.previousAmountUAH, {
                  maxFractionDigits: 2,
                }),
              )}
            confirmLabel={messages.finyk.debtSplitSync.unlinkConfirm}
            cancelLabel={messages.finyk.debtSplitSync.unlinkKeep}
            onConfirm={splitSync.confirmUnlink}
            onCancel={splitSync.dismissUnlink}
          />
        )}
      </MeshBackground>
    </ModuleAccentProvider>
  );
}

// FinykHeaderIcon / SyncPill / AuthErrorBanner extracted to
// `./FinykAppChrome` (Hard Rule #18 headroom — see that file's docstring).
