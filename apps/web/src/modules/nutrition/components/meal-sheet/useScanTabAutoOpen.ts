import { useEffect, useRef } from "react";
import type { SourceTabId } from "./SourceTabs";

/**
 * Вхід у вкладку «Скан» — це вже жест «хочу сканувати», тож сканер
 * відкривається сам. Той самий принцип, що й у кроці фото, який сам
 * відкриває піккер: обрана вкладка — це вже намір, і просити ще один
 * тап означає пропонувати дію, яку людина щойно зробила. Кнопка в
 * секції лишається, але як «Сканувати ще раз» — повтор після невдалого
 * кадру, а не основний шлях.
 *
 * Ref, а не стан: один запуск на активацію вкладки. Без нього закритий
 * сканер відкривався б назад на кожному ре-рендері, і вийти з вкладки
 * стало б неможливо. Винесено з `AddMealSheet` (Hard Rule #18).
 */
export function useScanTabAutoOpen(
  open: boolean,
  step: "source" | "fill",
  sourceTab: SourceTabId,
  setScannerOpen: (v: boolean) => void,
): void {
  const scanAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!open || step !== "source" || sourceTab !== "scan") {
      scanAutoOpenedRef.current = false;
      return;
    }
    if (scanAutoOpenedRef.current) return;
    scanAutoOpenedRef.current = true;
    setScannerOpen(true);
  }, [open, step, sourceTab, setScannerOpen]);
}
