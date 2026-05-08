import { useState, useEffect, Suspense } from "react";
import { lazyImport } from "../../core/lib/lazyImport";
import { useSwipeNavigation } from "@shared/hooks/useSwipeNavigation";
import { useMonobank } from "./hooks/useMonobank";
import { usePrivatbank } from "./hooks/usePrivatbank";
import { useStorage } from "./hooks/useStorage";
import { readRaw, writeRaw } from "./lib/finykStorage";
import { FINYK_MANUAL_ONLY_KEY, enableFinykManualOnly } from "./lib/demoData";
import { ModuleBottomNav } from "@shared/components/ui/ModuleBottomNav";
import {
  ModuleAccentProvider,
  ModuleHeader,
  ModuleHeaderAssistantButton,
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

// Heavy sub-pages are lazy-loaded so navigating into them for the first
// time shows the finyk-branded ModulePageLoader skeleton instead of a
// blank flash. Overview stays eager because it is the landing page and
// must not add a waterfall to cold module navigation.
//
// `lazyImport` (instead of bare `React.lazy()`) keeps Suspense from
// crashing when `chunkReload.ts` swallows a `vite:preloadError` after a
// fresh Vercel deploy — same Sentry-noise pattern that hit AuthPage as
// `e.AuthPage` (issue 116945546). See core/lib/lazyImport.ts.
const Transactions = lazyImport(
  () => import("./pages/transactions"),
  "Transactions",
);
const Budgets = lazyImport(() => import("./pages/budgets"), "Budgets");
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
  // One-time migration of legacy browser tokens to server-side webhook
  useMonoTokenMigration(/* isLoggedIn */ true);
  const toast = useToast();
  // Pass the full toast API to storage so it can dispatch `success`/`error`
  // variants directly — the old `showToast(msg, type)` wrapper silently
  // collapsed everything except `error` to `success`, which blocked any
  // `warning`/`info`/`action` usage from the shared Toast module.
  const storage = useStorage({ toast });
  const [page, navigate] = useFinykRoute();
  // Підтримка глибоких лінків на конкретний ліміт із Hub-інсайту
  // (`/finyk/budgets?cat=smoking`, або legacy `#budgets?cat=smoking`,
  // який `useFinykRoute` піднімає у URL search-params на mount).
  // Передається у Budgets, щоб одразу підсвітити та проскролити
  // потрібну картку.
  const focusLimitCategoryId = useFinykQueryParam("cat");

  // Per-module first-run handoff. On the user's very first Finyk
  // entry route them straight to «Планування» so the canonical
  // monthly-plan editor (`MonthlyPlanCard`) is what they see — see
  // `core/onboarding/useModuleFirstRun.ts` for the rationale and
  // legacy storage-key contract.
  const { firstRun: firstRunFinyk, markSeen: markFinykSeen } =
    useModuleFirstRun("finyk");
  // Latch the initial `firstRun` so `markSeen()` (or any cross-tab
  // edit to the seen flag) doesn't yank `Budgets` back to its
  // default closed state mid-session — `MonthlyPlanCard`'s lazy
  // `useState` initializer reads the prop on first mount only.
  const [firstRunFinykSurface, setFirstRunFinykSurface] =
    useState(firstRunFinyk);
  useEffect(() => {
    if (firstRunFinyk) setFirstRunFinykSurface(true);
  }, [firstRunFinyk]);
  const firstRunFinykActive = firstRunFinykSurface && page === "budgets";
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showBalance, setShowBalance] = useState(
    () => readRaw("finyk_show_balance_v1", "1") !== "0",
  );
  const [showExpenseSheet, setShowExpenseSheet] = useState(false);
  // Inline Mono-token entry overlay. Triggered from the no-bank banner —
  // replaces the previous full-screen `FinykLoginScreen` gate so users
  // who land in Finyk without going through the FTUX preset path can
  // still see the empty Finyk UI immediately and add expenses manually,
  // without being forced to dismiss a connect-or-skip prompt first.
  const [showLoginOverlay, setShowLoginOverlay] = useState(false);
  const [editingManualExpenseId, setEditingManualExpenseId] = useState<
    string | null
  >(null);
  // Для prefill категорії при кліку на quick-add картку з Overview.
  const [quickAddCategory, setQuickAddCategory] = useState<string | null>(null);
  // Prefill опису з FTUX preset sheet («Кава», «Таксі», «Обід»). Окрема
  // стейт-клітинка, бо quick-add з Overview задає лише категорію —
  // description лишається порожнім і поповнюється користувачем.
  const [quickAddDescription, setQuickAddDescription] = useState<string | null>(
    null,
  );
  // "Manual only" bypass: user completed onboarding without Monobank or
  // pressed «Далі без банку» on the login screen. When set, we render the
  // normal Finyk UI populated from manual expenses even if `clientInfo` is
  // still null — the bank can still be connected later from settings.
  const [manualOnly, setManualOnly] = useState(
    () => readRaw(FINYK_MANUAL_ONLY_KEY, "") === "1",
  );

  useEffect(() => {
    writeRaw("finyk_show_balance_v1", showBalance ? "1" : "0");
  }, [showBalance]);

  useEffect(() => {
    if (window.location.search.includes("sync=")) {
      const ok = storage.loadFromUrl();
      if (ok) toast.success("Налаштування синхронізовано!");
      else toast.error("Не вдалось завантажити синк-дані");
    }
    // Одноразово при монтуванні: ?sync= у URL
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storage/toast не повинні перезапускати імпорт з URL
  }, []);

  // First-run jump to the canonical goal surface. Runs once after
  // mount so a user mid-session who happens to clear the seen flag
  // does not get re-routed away from whatever page they were on.
  // Skipped when a `pwaAction` is already routing the user (e.g.
  // `add_expense` deep-link) so the action target wins.
  useEffect(() => {
    if (!firstRunFinyk) return;
    if (pwaAction === "add_expense") return;
    if (page !== "budgets") navigate("budgets");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount; subsequent edits to firstRun must not retrigger
  }, []);

  useEffect(() => {
    if (pwaAction === "add_expense") {
      // FTUX preset sheet може стешити `item.data` у sessionStorage
      // (див. `writePresetPrefill`), щоб плитки «Кава» / «Таксі» / «Обід»
      // не деградували до трьох ідентичних порожніх форм. Споживаємо
      // prefill ТІЛЬКИ для нового запису — без `editingManualExpenseId`,
      // щоб випадковий stale prefill не перезаписав категорію під час
      // редагування існуючої витрати.
      const prefill = consumePresetPrefill("finyk");
      navigate("transactions");
      setEditingManualExpenseId(null);
      setQuickAddCategory(
        typeof prefill?.category === "string" ? prefill.category : null,
      );
      setQuickAddDescription(
        typeof prefill?.description === "string" ? prefill.description : null,
      );
      setShowExpenseSheet(true);
      onPwaActionConsumed?.();
    }
    // `navigate` — стабільна локальна функція useFinykRoute, не ре-створюється між рендерами.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwaAction, onPwaActionConsumed]);

  // Legacy `#payments` → `#budgets` redirect був перенесений у
  // `useFinykRoute` як частина `parseLegacyFinykHash` → `LEGACY_REDIRECTS`
  // у `lib/finykRouter.ts` (initiative 0006 §Phase 2.b).

  const { mergedMono } = useUnifiedFinanceData({ mono, privat });

  // Частотна персоналізація: топ-категорії/мерчанти користувача.
  // Використовуються у quick add, dashboard-картці та підказках.
  const { frequentCategories, frequentMerchants } = useFinykPersonalization({
    mono: mergedMono,
    storage,
  });

  const { clientInfo, connecting, error, authError, connect } = mono;
  const syncTone =
    mergedMono?.syncState?.status === "error"
      ? {
          dot: "bg-danger",
          text: "помилка",
          pill: "bg-danger-soft  text-danger  border-danger/20",
        }
      : mergedMono?.syncState?.status === "partial"
        ? {
            dot: "bg-warning",
            text: "частково",
            pill: "bg-warning/10   text-warning border-warning/20",
          }
        : mergedMono?.syncState?.status === "loading"
          ? {
              dot: "bg-muted",
              text: "оновлення",
              pill: "bg-panelHi     text-muted   border-line",
            }
          : {
              dot: "bg-success",
              text: "ок",
              pill: "bg-success/10  text-success border-success/20",
            };

  // Свайп між вкладками (без pull-to-refresh: скрол живе всередині сторінок, зовнішній scrollTop завжди 0).
  // Logic shared with other module shells via useSwipeNavigation.
  const SWIPE_THRESHOLD_PX = 60;
  const curPageIdx = NAV_IDS.indexOf(page);
  const swipe = useSwipeNavigation({
    onSwipeLeft: () => {
      const next = curPageIdx + 1;
      if (next >= 0 && next < NAV_IDS.length) navigate(NAV_IDS[next]!);
    },
    onSwipeRight: () => {
      const next = curPageIdx - 1;
      if (next >= 0 && next < NAV_IDS.length) navigate(NAV_IDS[next]!);
    },
    threshold: SWIPE_THRESHOLD_PX,
    atStart: curPageIdx === 0,
    atEnd: curPageIdx === NAV_IDS.length - 1,
  });
  const swipeDx = swipe.dragDx;

  // Auto-close the connect overlay once the user successfully connects
  // a Monobank token — `clientInfo` flips from null to populated inside
  // `useMonobank` after a successful handshake.
  useEffect(() => {
    if (clientInfo && showLoginOverlay) {
      setShowLoginOverlay(false);
    }
  }, [clientInfo, showLoginOverlay]);

  const showNoBankBanner = !clientInfo && !manualOnly;

  // ── Main app ──────────────────────────────────────────────────────────
  return (
    <ModuleAccentProvider module="finyk" asShellRoot>
      <ModuleHeader
        module="finyk"
        left={
          typeof onBackToHub === "function" ? (
            <ModuleHeaderBackButton onClick={onBackToHub} />
          ) : (
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
          )
        }
        title="ФІНІК"
        subtitle="Monobank · бюджети"
        right={
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 select-none",
                "text-style-caption px-2 py-0.5 rounded-full border",
                "transition-colors duration-200",
                syncTone.pill,
              )}
              aria-label={`Стан синхронізації: ${syncTone.text}`}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  syncTone.dot,
                )}
              />
              <span className="hidden sm:inline">{syncTone.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowBalance((v) => !v)}
              className="focus-ring w-11 h-11 flex items-center justify-center rounded-xl text-subtle hover:text-text hover:bg-panelHi transition-colors"
              aria-label={showBalance ? "Приховати суми" : "Показати суми"}
              title={showBalance ? "Приховати суми" : "Показати суми"}
            >
              {showBalance ? (
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
              ) : (
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
              )}
            </button>
            {onOpenSettings && (
              <ModuleHeaderSettingsButton onClick={onOpenSettings} />
            )}
            <ModuleHeaderAssistantButton />
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

      {/*
        Sync-v2 LWW-conflict banner для `finyk_manual_expenses` (Stage 5
        PR #044, `docs/planning/storage-roadmap.md`). Self-renders як
        no-op коли черга у `conflicts/store.ts` порожня — тому жодного
        feature-flag-у тут не треба, гілка дешева. Розташований нижче
        no-bank банера, щоб «налаштуй банк» залишався primary CTA для
        свіжих юзерів, а conflict-warning спливав поверх для тих, хто
        вже має data + race з іншого пристрою.
      */}
      <FinykManualExpenseConflictBanner />

      {/* Page content */}
      <div
        className="flex-1 overflow-hidden flex flex-col min-h-0 touch-pan-y relative"
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        {/*
          Swipe progress bar — surfaces an in-progress tab swipe so
          the gesture isn't a black box anymore. Sits at the top of
          the page wrapper, fills toward the threshold (60 px), then
          tints fully on commit. Hidden when the user isn't dragging
          to keep the chrome clean.
        */}
        {swipeDx !== 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 inset-x-0 h-0.5 z-20 overflow-hidden"
          >
            <div
              className={cn(
                "h-full",
                Math.abs(swipeDx) >= SWIPE_THRESHOLD_PX
                  ? "bg-finyk"
                  : "bg-finyk/40",
              )}
              style={{
                width: `${Math.min(100, (Math.abs(swipeDx) / SWIPE_THRESHOLD_PX) * 100)}%`,
                marginLeft: swipeDx < 0 ? "auto" : 0,
                transition: "background-color 120ms linear",
              }}
            />
          </div>
        )}
        <div
          key={`page-${page}`}
          className="flex-1 overflow-hidden flex flex-col min-h-0 motion-safe:animate-fade-in"
          style={
            swipeDx !== 0
              ? {
                  // 0.45 follow-coefficient mirrors iOS' "rubber band"
                  // feel — the page tracks the finger but lags behind
                  // it, so the dominant motion stays in the user's
                  // hand, not the screen. No transition while dragging
                  // so there's no rubber-banding lag.
                  transform: `translate3d(${swipeDx * 0.45}px, 0, 0)`,
                  transition: "none",
                  willChange: "transform",
                }
              : {
                  transform: "translate3d(0, 0, 0)",
                  transition: "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
                }
          }
        >
          <Suspense fallback={<ModulePageLoader module="finyk" />}>
            {page === "overview" && (
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
            )}
            {page === "transactions" && (
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
            )}
            {page === "budgets" && (
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
            )}
            {page === "analytics" && (
              <SectionErrorBoundary
                key="page-analytics"
                title="Не вдалось показати «Аналітику»"
              >
                <Analytics mono={mergedMono} storage={storage} />
              </SectionErrorBoundary>
            )}
            {page === "assets" && (
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
            )}
          </Suspense>
        </div>
      </div>

      {(page === "overview" ||
        page === "transactions" ||
        page === "budgets") && (
        <button
          onClick={() => {
            setEditingManualExpenseId(null);
            setShowExpenseSheet(true);
          }}
          className="fixed bottom-[calc(60px+env(safe-area-inset-bottom,0)+16px)] right-4 w-12 h-12 rounded-full bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-float flex items-center justify-center text-2xl hover:from-brand-500 hover:to-brand-700 hover:shadow-glow hover:scale-105 active:scale-95 transition-[background-color,box-shadow,opacity,transform] duration-200 ease-smooth z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          aria-label="Додати витрату"
        >
          +
        </button>
      )}

      {mono.authError && (
        <div className="fixed top-[calc(56px+env(safe-area-inset-top,0)+8px)] left-4 right-4 z-50 max-w-lg mx-auto">
          <div className="bg-warning/15 border border-warning/40 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-card">
            <span className="text-lg shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-style-label text-text">
                Токен потребує оновлення
              </p>
              <p className="text-xs text-muted mt-0.5">{mono.authError}</p>
              {onBackToHub && (
                <button
                  onClick={onBackToHub}
                  className="text-xs font-semibold text-primary mt-2 hover:underline"
                >
                  Оновити токен у Налаштуваннях Hub
                </button>
              )}
            </div>
            <button
              onClick={() => mono.setAuthError("")}
              className="text-muted hover:text-text transition-colors shrink-0"
              aria-label="Закрити"
            >
              ✕
            </button>
          </div>
        </div>
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

          // Cross-module nudge (UX wave-4 #4):
          // After a Кафе/Ресторан/Продукти save, suggest logging the
          // matching meal in Nutrition. Suppressed automatically after
          // ≥3 dismissals in 14 days or 12 h after the user accepts —
          // see `docs/design/cross-module-prompts.md`.
          const cat = String(expense?.category || "");
          const promptId =
            cat === "restaurant"
              ? "finyk-restaurant-to-meal"
              : cat === "food"
                ? "finyk-food-to-meal"
                : null;
          if (promptId) {
            const msg =
              promptId === "finyk-restaurant-to-meal"
                ? "Додати прийом їжі з ресторану?"
                : "Додати прийом їжі з продуктів?";
            tryShowCrossModulePrompt(toast, {
              id: promptId,
              msg,
              acceptLabel: "Додати →",
              onAccept: () => openHubModuleWithAction("nutrition", "add_meal"),
            });
          }
        }}
      />

      {/* Bottom navigation */}
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

      {showLoginOverlay && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-bg"
          role="dialog"
          aria-modal="true"
          aria-label="Підключення Monobank"
        >
          <FinykLoginScreen
            tokenInput={tokenInput}
            onTokenInputChange={setTokenInput}
            showToken={showToken}
            onToggleShowToken={() => setShowToken((v) => !v)}
            authError={authError}
            error={error}
            connecting={connecting}
            onConnect={() => connect(tokenInput.trim())}
            onContinueWithoutBank={() => {
              enableFinykManualOnly();
              setManualOnly(true);
              setShowLoginOverlay(false);
            }}
            toast={toast}
            onBackToHub={() => setShowLoginOverlay(false)}
            backLabel="Назад"
          />
        </div>
      )}
    </ModuleAccentProvider>
  );
}
