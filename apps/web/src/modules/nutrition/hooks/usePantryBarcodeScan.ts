/**
 * Last validated: 2026-08-04
 * Status: Active
 */
import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { isApiError } from "@shared/api";
import { STATUS_AUTO_HIDE_MS } from "@shared/lib/ui/timeouts";
import { useBarcodeProductLookup } from "./useBarcodeProduct";

export interface PantryBarcodeScanApi {
  upsertItem: (label: string) => void;
}

export interface UsePantryBarcodeScanParams {
  pantry: PantryBarcodeScanApi;
  setPantryScannerOpen: Dispatch<SetStateAction<boolean>>;
  setPantryScanStatus: Dispatch<SetStateAction<string>>;
}

/**
 * Розрізняє "продукту немає" (404 → `null`) від "джерела не відповіли"
 * (503) — той самий контракт, що й meal-sheet `useBarcodeLookup`
 * (аудит nutrition E-6). Комора не має фото-розпізнавання, тож обидва
 * стани пропонують лише ручне введення (вже видно нижче на сторінці) —
 * "unavailable" додатково пропонує повтор без нового скану.
 */
export interface PantryBarcodeNotice {
  kind: "not-found" | "unavailable";
  code: string;
}

export interface UsePantryBarcodeScanResult {
  scan: (raw: string) => Promise<void>;
  notice: PantryBarcodeNotice | null;
  retry: () => void;
  dismissNotice: () => void;
}

export function usePantryBarcodeScan({
  pantry,
  setPantryScannerOpen,
  setPantryScanStatus,
}: UsePantryBarcodeScanParams): UsePantryBarcodeScanResult {
  const lookupProduct = useBarcodeProductLookup();
  const [notice, setNotice] = useState<PantryBarcodeNotice | null>(null);

  const scan = useCallback(
    async (raw: string) => {
      setPantryScannerOpen(false);
      setPantryScanStatus("Шукаю продукт…");
      setNotice(null);
      const code = String(raw || "")
        .trim()
        .replace(/\D/g, "");
      if (!code) {
        setPantryScanStatus("Некоректний штрих-код.");
        return;
      }

      let p;
      try {
        p = await lookupProduct(code);
      } catch (err) {
        if (isApiError(err) && err.isOffline) {
          setPantryScanStatus("Немає підключення до інтернету.");
          return;
        }
        // AI-DANGER: 503 = усі три upstream-и каскаду не відповіли (аудит
        // nutrition G5/E-6), не "продукту немає". Тримай цю гілку ПЕРЕД
        // загальним `kind === "http"`.
        if (isApiError(err) && err.status === 503) {
          setPantryScanStatus("");
          setNotice({ kind: "unavailable", code });
          return;
        }
        if (isApiError(err) && err.kind === "http") {
          setPantryScanStatus(err.serverMessage || "Помилка пошуку.");
          return;
        }
        setPantryScanStatus("Помилка пошуку. Перевір зʼєднання.");
        return;
      }

      if (!p) {
        setPantryScanStatus("");
        setNotice({ kind: "not-found", code });
        return;
      }
      if (!p.name) {
        setPantryScanStatus(
          "Продукт знайдено, але назва відсутня. Додай вручну.",
        );
        return;
      }

      const label = [p.name, p.brand].filter(Boolean).join(" ").trim();
      pantry.upsertItem(label);
      if (p.partial) {
        setPantryScanStatus(
          `Знайдено: ${label}. КБЖВ відсутнє в базі, за потреби додай вручну.`,
        );
      } else {
        setPantryScanStatus(`Додано: ${label}`);
      }
      setTimeout(() => setPantryScanStatus(""), STATUS_AUTO_HIDE_MS);
    },
    [lookupProduct, pantry, setPantryScanStatus, setPantryScannerOpen],
  );

  const retry = useCallback(() => {
    if (notice) void scan(notice.code);
  }, [notice, scan]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { scan, notice, retry, dismissNotice };
}
