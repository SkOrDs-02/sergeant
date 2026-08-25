/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * «У кошик Сільпо» зі списку покупок (Silpo integration трек G, спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` §
 * «Cart (MCP write path)»).
 *
 * Флоу: `cartPreview(items)` — search-only, ніколи не пише в кошик —
 * повертає по одному result на позицію запиту (топ-матч + до 2
 * альтернатив, або `unmatched: true`). Локальний стан (`rowState`) тримає
 * те, що користувач ще МІГ змінити: увімк/вимк рядка, обрана альтернатива,
 * кількість — усе це seed-иться з preview-відповіді один раз (render-phase
 * adjustment, той самий idiom, що `useSilpoPantryReplenish`) і далі живе
 * незалежно від рефетчів. `apply()` пише в зовнішній кошик РІВНО відмічені
 * позиції — нічого мовчки (той самий інваріант, що й pantry-replenish).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError, silpoApi } from "@shared/api";
import type {
  SilpoCartDto,
  SilpoCartMatchDto,
  SilpoCartPreviewItem,
  SilpoCartPreviewResponse,
} from "@shared/api";
import { silpoKeys } from "@shared/lib/api/queryKeys";

export interface SilpoCartRow {
  /** Оригінальний рядок запиту (назва позиції списку покупок). */
  query: string;
  matches: SilpoCartMatchDto[];
  /** `true` — жодного придатного кандидата (порожні `matches`). */
  unmatched: boolean;
  /** Увімкнено = піде в `cartApply()` при підтвердженні. */
  checked: boolean;
  qty: number;
  /** `lagerId` обраного матчу (топ або альтернатива). `null` для `unmatched`. */
  selectedLagerId: string | null;
}

/** Категорії помилок Silpo cart API — банер підказує різну дію під кожну. */
export type SilpoCartErrorKind =
  "not_connected" | "reauth_required" | "unavailable" | "unknown" | null;

function silpoCartErrorKind(error: unknown): SilpoCartErrorKind {
  if (error == null) return null;
  if (!isApiError(error)) return "unknown";
  const body = error.body;
  const code =
    body && typeof body === "object" && "code" in body
      ? (body as { code?: unknown }).code
      : undefined;
  switch (code) {
    case "SILPO_NOT_CONNECTED":
      return "not_connected";
    case "SILPO_REAUTH_REQUIRED":
      return "reauth_required";
    case "SILPO_RATE_LIMITED":
    case "SILPO_UPSTREAM_ERROR":
    case "SILPO_SCHEMA_DRIFT":
    case "SILPO_DISABLED":
    case "SILPO_CONFIG_MISSING":
      return "unavailable";
    default:
      return "unknown";
  }
}

interface RowLocalState {
  checked: boolean;
  qty: number;
  selectedLagerId: string | null;
}

export interface UseSilpoCartParams {
  /** Хук фетчить preview лише поки `true` — керує викликач (відкритий sheet). */
  enabled: boolean;
  items: SilpoCartPreviewItem[];
}

export function useSilpoCart({ enabled, items }: UseSilpoCartParams) {
  const queryClient = useQueryClient();

  const previewQuery = useQuery<SilpoCartPreviewResponse>({
    queryKey: silpoKeys.cartPreview(items),
    queryFn: ({ signal }) => silpoApi.cartPreview(items, { signal }),
    enabled: enabled && items.length > 0,
    // Кожне відкриття шіта мусить бачити свіжі ціни/наявність каталогу —
    // preview не той стан, який варто тримати "stale, але ок".
    staleTime: 0,
    // Рейт-ліміт/апстрім-збій показуємо явним банером із кнопкою "Повторити",
    // а не мовчазними фоновими ретраями, які просто спалюють квоту.
    retry: false,
  });

  const [rowState, setRowState] = useState<Record<number, RowLocalState>>({});
  // Seed рівно один раз на нову відповідь preview — порівнюємо з референсом
  // самого об'єкта відповіді, не з `rows` (які вже похідні від
  // `rowState`+`data` і тому завжди "змінились" би).
  const [seededData, setSeededData] = useState<SilpoCartPreviewResponse | null>(
    null,
  );
  if (previewQuery.data && previewQuery.data !== seededData) {
    const next: Record<number, RowLocalState> = {};
    previewQuery.data.results.forEach((r, i) => {
      const top = r.matches[0];
      const seedQty = items[i]?.quantity;
      next[i] = {
        checked: !r.unmatched,
        qty:
          seedQty != null && seedQty > 0 ? Math.max(1, Math.round(seedQty)) : 1,
        selectedLagerId: top ? top.lagerId : null,
      };
    });
    setSeededData(previewQuery.data);
    setRowState(next);
  }

  const rows: SilpoCartRow[] = useMemo(() => {
    const results = previewQuery.data?.results ?? [];
    return results.map((r, i) => {
      const local = rowState[i];
      return {
        query: r.query,
        matches: r.matches,
        unmatched: r.unmatched,
        checked: local?.checked ?? !r.unmatched,
        qty: local?.qty ?? 1,
        selectedLagerId:
          local?.selectedLagerId ??
          (r.matches[0] ? r.matches[0].lagerId : null),
      };
    });
  }, [previewQuery.data, rowState]);

  const selectedRows = useMemo(
    () => rows.filter((r) => r.checked && r.selectedLagerId != null),
    [rows],
  );

  const totalKop = useMemo(
    () =>
      selectedRows.reduce((sum, r) => {
        const match = r.matches.find((m) => m.lagerId === r.selectedLagerId);
        return sum + (match ? match.priceKop * r.qty : 0);
      }, 0),
    [selectedRows],
  );

  function patchRow(index: number, patch: Partial<RowLocalState>) {
    setRowState((cur) => {
      const row = rows[index];
      const base: RowLocalState = cur[index] ?? {
        checked: row?.checked ?? false,
        qty: row?.qty ?? 1,
        selectedLagerId: row?.selectedLagerId ?? null,
      };
      return { ...cur, [index]: { ...base, ...patch } };
    });
  }

  function toggleRow(index: number) {
    const row = rows[index];
    if (!row) return;
    patchRow(index, { checked: !row.checked });
  }

  function setQty(index: number, qty: number) {
    if (!Number.isFinite(qty) || qty < 1) return;
    patchRow(index, { qty: Math.round(qty) });
  }

  function selectMatch(index: number, lagerId: string) {
    patchRow(index, { selectedLagerId: lagerId });
  }

  const applyMutation = useMutation<SilpoCartDto, unknown, void>({
    mutationFn: () => {
      const selections = selectedRows
        .filter(
          (r): r is SilpoCartRow & { selectedLagerId: string } =>
            r.selectedLagerId != null,
        )
        .map((r) => ({ lagerId: r.selectedLagerId, quantity: r.qty }));
      return silpoApi.cartApply(selections);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: silpoKeys.cart() });
    },
  });

  /** Скидає локальний вибір і результат apply — виклик при закритті шіта. */
  function reset() {
    setRowState({});
    setSeededData(null);
    applyMutation.reset();
  }

  return {
    isLoading: previewQuery.isLoading,
    previewErrorKind: silpoCartErrorKind(previewQuery.error),
    refetchPreview: () => void previewQuery.refetch(),
    rows,
    checkedCount: selectedRows.length,
    totalKop,
    toggleRow,
    setQty,
    selectMatch,
    apply: () => applyMutation.mutate(),
    applyResult: applyMutation.data ?? null,
    applyPending: applyMutation.isPending,
    applyErrorKind: silpoCartErrorKind(applyMutation.error),
    reset,
  };
}
