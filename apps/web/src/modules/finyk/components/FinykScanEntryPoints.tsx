/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Точка входу в чек-скан v1 і масове ведення (Фаза 2) — спека
 * `docs/work/specs/receipt-scan.md` § Флоу v1 / § Фаза 2.
 *
 * Мова H (redesign v3, поправка власника 2026-10-10): чорна кнопка
 * «+ Додати» в куті над tab bar відкриває аркуш джерел «Вручну», «Чек»,
 * «Документи»; усі три доступні з будь-якої сторінки модуля, як і раніше.
 *
 * Обидва sheet-и — ліниві (`lazyReceiptSheets.ts`, той самий
 * `lazyImport` патерн, що `pages/lazyPages.ts`) і монтуються лише коли
 * користувач реально тапнув дію — жоден зайвий байт не йде в eager-бандл
 * (280 kB gate), і `vendor-zxing` (камерний QR-сканер) довантажується
 * лише в момент відкриття `ReceiptScanSheet`.
 *
 * Suspense fallback — легкий Spinner, не `null` (CodeRabbit round 5, PR
 * #818): користувач щойно тапнув джерело в аркуші «Додати» — свідомий жест, а не
 * фонове preload. `null` під час завантаження чанка (JS цього sheet-а +
 * `vendor-zxing` для сканера) на повільному звʼязку виглядав би так, ніби
 * тап взагалі нічого не зробив.
 */
import { Suspense, useState } from "react";
import { AddAction } from "@shared/components/ui/CornerAction";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { Spinner } from "@shared/components/ui/Spinner";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import type { ManualExpenseWriteThroughStorage } from "../hooks/manualExpenseWriteThrough";
import { BulkImportSheet, ReceiptScanSheet } from "./lazyReceiptSheets";
import { useAuthOptional } from "../../../core/auth/AuthContext";

/** Shared between both lazy sheets below — matches `Sheet`'s own backdrop
 * treatment (`bg-black/40`, `Sheet.tsx`) so the fallback
 * reads as "the sheet is opening", not a separate flash of UI. */
function SheetOpeningFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Відкриваю…"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <Spinner size="lg" />
    </div>
  );
}

export interface FinykScanEntryPointsProps {
  onAddExpense: () => void;
  storage: ManualExpenseWriteThroughStorage;
  onReceiptLinked: (txRef: string, receiptId: number) => void;
  customCategories?: readonly CustomCategoryInput[] | undefined;
  /**
   * Аркуш масового імпорту КОНТРОЛЬОВАНИЙ ззовні, на відміну від сканера
   * чеків поруч. Причина: його відкриває не лише аркуш «Додати», а й плашка
   * нагадування в Огляді (`ImportReminderBanner`), і обидва входи мають
   * вести в один і той самий аркуш. Тримати стан тут означало б або
   * другий екземпляр аркуша, або сигнальний проп-костиль.
   */
  bulkImportOpen: boolean;
  onBulkImportOpenChange: (open: boolean) => void;
  /**
   * Opens account sign-in for the receipt-scan / bulk-import gate below.
   * Required (A1, аудит 2026-09-11 хвиля 2): опційність тут ховала
   * мовчазний no-op — `onOpenAuth?.()` нічого не робив, коли shell
   * забував передати обробник, і анонім тапав дію, яка виглядала
   * робочою, але нічого не відкривала.
   */
  onOpenAuth: () => void;
}

export function FinykScanEntryPoints({
  onAddExpense,
  storage,
  onReceiptLinked,
  customCategories,
  bulkImportOpen,
  onBulkImportOpenChange,
  onOpenAuth,
}: FinykScanEntryPointsProps) {
  const toast = useToast();
  const auth = useAuthOptional();
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const requireAccount = (open: () => void) => {
    // `null` is possible only in isolated component tests; the production
    // tree always mounts AuthProvider, where a missing user means anonymous.
    if (auth === null || auth.user) {
      open();
      return;
    }
    toast.info("Для сканування чеків і документів увійди в акаунт.");
    onOpenAuth();
  };
  const src = messages.finyk.addSources;

  return (
    <>
      <AddAction
        sources={[
          { id: "manual", ...src.manual, onSelect: onAddExpense },
          {
            id: "receipt",
            ...src.receipt,
            onSelect: () => requireAccount(() => setShowReceiptScan(true)),
          },
          {
            id: "import",
            ...src.import,
            onSelect: () => requireAccount(() => onBulkImportOpenChange(true)),
          },
        ]}
      />

      {showReceiptScan && (
        <SectionErrorBoundary title="Не вдалось відкрити сканер чеків">
          <Suspense fallback={<SheetOpeningFallback />}>
            <ReceiptScanSheet
              open={showReceiptScan}
              onClose={() => setShowReceiptScan(false)}
              storage={storage}
              onReceiptLinked={onReceiptLinked}
              onSaved={(alreadyExists) => {
                if (alreadyExists) {
                  toast.info("Цей чек уже збережено.");
                } else {
                  toast.success("Чек збережено.");
                }
              }}
              customCategories={customCategories}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {bulkImportOpen && (
        <SectionErrorBoundary title="Не вдалось відкрити масовий імпорт">
          <Suspense fallback={<SheetOpeningFallback />}>
            <BulkImportSheet
              open={bulkImportOpen}
              onClose={() => onBulkImportOpenChange(false)}
              storage={storage}
              customCategories={customCategories}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}
    </>
  );
}
