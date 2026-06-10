import { useState, useEffect } from "react";
import { useMonobank } from "./hooks/useMonobank";
import { usePrivatbank } from "./hooks/usePrivatbank";
import { useStorage } from "./hooks/useStorage";
import { useFinykRoute, useFinykQueryParam } from "./hooks/useFinykRoute";
import { useFinykPersonalization } from "./hooks/useFinykPersonalization";
import { useFinykTabSwipe } from "./hooks/useFinykTabSwipe";
import { useFinykSyncUrlImport } from "./hooks/useFinykSyncUrlImport";
import { useFinykAddExpensePwaAction } from "./hooks/useFinykAddExpensePwaAction";
import { useFinykFirstRunRedirect } from "./hooks/useFinykFirstRunRedirect";
import { useUnifiedFinanceData } from "./hooks/useUnifiedFinanceData";
import { useMonoTokenMigration } from "./hooks/useMonoTokenMigration";
import { useToast } from "@shared/hooks/useToast";
import { tryShowCrossModulePrompt } from "@shared/lib/modules/crossModulePrompt";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import {
  MeshBackground,
  ModuleAccentProvider,
  ModuleHeader,
  ModuleHeaderBackButton,
} from "@shared/components/layout";
import { ModuleBottomNav } from "@shared/components/ui/ModuleBottomNav";
import { AIPill } from "@shared/components/ui/AIPill";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import { NoBankBanner } from "./components/NoBankBanner";
import { FinykManualExpenseConflictBanner } from "./components/FinykManualExpenseConflictBanner";
import { FinykHeaderControls } from "./components/FinykHeaderControls";
import { FinykAuthErrorBanner } from "./components/FinykAuthErrorBanner";
import { FinykTabSwipeArea } from "./components/FinykTabSwipeArea";
import { FinykPageHost } from "./components/FinykPageHost";
import { ManualExpenseSheet } from "./components/ManualExpenseSheet";
import { FinykLoginScreen } from "./components/FinykLoginScreen";
import { NAV_ICONS, NAV_ITEMS } from "./components/finykNav";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";
import { readRaw } from "./lib/finykStorage";
import { FINYK_MANUAL_ONLY_KEY, enableFinykManualOnly } from "./lib/demoData";

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

  const { firstRun: firstRunFinyk, markSeen: markFinykSeen } =
    useModuleFirstRun("finyk");
  const [firstRunFinykSurface, setFirstRunFinykSurface] =
    useState(firstRunFinyk);
  useEffect(() => {
    if (firstRunFinyk) setFirstRunFinykSurface(true);
  }, [firstRunFinyk]);
  const firstRunFinykActive = firstRunFinykSurface && page === "budgets";

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const showBalance = storage.showBalance;
  const setShowBalance = storage.setShowBalance;
  const [showExpenseSheet, setShowExpenseSheet] = useState(false);
  const [showLoginOverlay, setShowLoginOverlay] = useState(false);
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

  useFinykSyncUrlImport({
    loadFromUrl: storage.loadFromUrl,
    toast,
  });
  useFinykFirstRunRedirect({
    enabled: firstRunFinykSurface,
    pwaAction,
    page,
    navigate,
  });
  useFinykAddExpensePwaAction({
    pwaAction,
    onPwaActionConsumed,
    navigate,
    setEditingManualExpenseId,
    setQuickAddCategory,
    setQuickAddDescription,
    setShowExpenseSheet,
  });

  const { mergedMono } = useUnifiedFinanceData({ mono, privat });
  const { frequentCategories, frequentMerchants } = useFinykPersonalization({
    mono: mergedMono,
    storage,
  });

  const { clientInfo, connecting, error, authError } = mono;
  const { swipe, threshold } = useFinykTabSwipe({ page, navigate });

  useEffect(() => {
    if (clientInfo && showLoginOverlay) {
      setShowLoginOverlay(false);
    }
  }, [clientInfo, showLoginOverlay]);

  const showNoBankBanner = !clientInfo && !manualOnly;

  return (
    <ModuleAccentProvider module="finyk">
      <MeshBackground>
        <ModuleHeader
          module="finyk"
          left={
            typeof onBackToHub === "function" ? (
              <ModuleHeaderBackButton onClick={onBackToHub} />
            ) : (
              <DefaultFinykLogo />
            )
          }
          title="ФІНІК"
          subtitle="Monobank · бюджети"
          right={
            <FinykHeaderControls
              onOpenSettings={onOpenSettings}
              showBalance={showBalance}
              setShowBalance={setShowBalance}
              syncStatus={mergedMono?.syncState?.status}
            />
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

        <FinykTabSwipeArea
          pageKey={page}
          dragDx={swipe.dragDx}
          threshold={threshold}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <FinykPageHost
            page={page}
            mono={mergedMono}
            storage={storage}
            navigate={navigate}
            showBalance={showBalance}
            categoryFilter={categoryFilter}
            onClearCategoryFilter={() => setCategoryFilter(null)}
            onEditManualExpense={(id) => {
              setEditingManualExpenseId(String(id));
              setShowExpenseSheet(true);
            }}
            focusLimitCategoryId={focusLimitCategoryId}
            monthlyPlanFirstRunHint={firstRunFinykActive}
            onDismissMonthlyPlanFirstRunHint={() => {
              markFinykSeen();
              setFirstRunFinykSurface(false);
            }}
          />
        </FinykTabSwipeArea>

        {(page === "overview" ||
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
          <FinykAuthErrorBanner
            message={mono.authError}
            onDismiss={() => mono.setAuthError("")}
            onOpenSettings={onBackToHub}
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
            if (expense?.id) {
              storage.editManualExpense?.(expense.id, expense);
              toast.success("Витрату оновлено.");
              return;
            }
            storage.addManualExpense(expense);
            toast.success("Витрату додано.");
            const cat = String(expense?.category || "");
            const promptId =
              cat === "cafe"
                ? "finyk-restaurant-to-meal"
                : cat === "food"
                  ? "finyk-food-to-meal"
                  : null;
            if (promptId) {
              const msg =
                promptId === "finyk-restaurant-to-meal"
                  ? "Додати прийом їжі з кафе?"
                  : "Додати прийом їжі з продуктів?";
              tryShowCrossModulePrompt(toast, {
                id: promptId,
                msg,
                acceptLabel: "Додати →",
                onAccept: () =>
                  openHubModuleWithAction("nutrition", "add_meal"),
              });
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
        />

        <AIPill module="finyk" />

        {showLoginOverlay && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-bg"
            role="dialog"
            aria-modal="true"
            aria-label="Підключення Monobank"
          >
            <FinykLoginScreen
              authError={authError}
              error={error}
              connecting={connecting}
              onConnect={(token) => mono.connect(token)}
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

function DefaultFinykLogo() {
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
