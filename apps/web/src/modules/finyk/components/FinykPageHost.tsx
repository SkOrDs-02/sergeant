import { Suspense } from "react";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { Overview } from "../pages/Overview";
import {
  Transactions,
  type TransactionsProps,
} from "../pages/transactions/Transactions";
import { Budgets, type BudgetsProps } from "../pages/budgets/Budgets";
import { Analytics } from "../pages/Analytics";
import { Assets } from "../pages/Assets";
import type { AssetsProps } from "../pages/useAssetsState";
import type { FinykPage } from "../lib/finykRouter";
import type { useUnifiedFinanceData } from "../hooks/useUnifiedFinanceData";
import type { useStorage } from "../hooks/useStorage";
import type { useFinykRoute } from "../hooks/useFinykRoute";

type MergedMono = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];
type Storage = ReturnType<typeof useStorage>;
type Navigate = ReturnType<typeof useFinykRoute>[1];

export interface FinykPageHostArgs {
  page: FinykPage;
  mono: MergedMono;
  storage: Storage;
  navigate: Navigate;
  showBalance: boolean;
  categoryFilter: string | null;
  onClearCategoryFilter: () => void;
  onEditManualExpense: (id: string | number) => void;
  focusLimitCategoryId: string | null;
  monthlyPlanFirstRunHint: boolean;
  onDismissMonthlyPlanFirstRunHint: () => void;
}

export function FinykPageHost({
  page,
  mono,
  storage,
  navigate,
  showBalance,
  categoryFilter,
  onClearCategoryFilter,
  onEditManualExpense,
  focusLimitCategoryId,
  monthlyPlanFirstRunHint,
  onDismissMonthlyPlanFirstRunHint,
}: FinykPageHostArgs) {
  return (
    <Suspense fallback={<ModulePageLoader module="finyk" />}>
      {page === "overview" && (
        <SectionErrorBoundary
          key="page-overview"
          title="Не вдалось показати «Огляд»"
        >
          <Overview
            mono={mono}
            storage={storage}
            onNavigate={navigate as (p: string) => void}
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
            mono={mono as TransactionsProps["mono"]}
            storage={storage as TransactionsProps["storage"]}
            showBalance={showBalance}
            categoryFilter={categoryFilter}
            onClearCategoryFilter={onClearCategoryFilter}
            onEditManualExpense={(id: string) => onEditManualExpense(id)}
          />
        </SectionErrorBoundary>
      )}
      {page === "budgets" && (
        <SectionErrorBoundary
          key="page-budgets"
          title="Не вдалось показати «Планування»"
        >
          <Budgets
            mono={mono as BudgetsProps["mono"]}
            storage={storage as BudgetsProps["storage"]}
            showBalance={showBalance}
            focusLimitCategoryId={focusLimitCategoryId}
            monthlyPlanFirstRunHint={monthlyPlanFirstRunHint}
            onDismissMonthlyPlanFirstRunHint={onDismissMonthlyPlanFirstRunHint}
          />
        </SectionErrorBoundary>
      )}
      {page === "analytics" && (
        <SectionErrorBoundary
          key="page-analytics"
          title="Не вдалось показати «Аналітику»"
        >
          <Analytics mono={mono as never} storage={storage as never} />
        </SectionErrorBoundary>
      )}
      {page === "assets" && (
        <SectionErrorBoundary
          key="page-assets"
          title="Не вдалось показати «Активи»"
        >
          <Assets
            mono={mono as AssetsProps["mono"]}
            storage={storage as AssetsProps["storage"]}
            showBalance={showBalance}
          />
        </SectionErrorBoundary>
      )}
    </Suspense>
  );
}
