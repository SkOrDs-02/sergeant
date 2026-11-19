import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { manualAccessConflictCode } from "@sergeant/api-client";
import type { PaywallSurface } from "@sergeant/shared";
import { billingApi } from "@shared/api";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { buildPageContext } from "../feedback/pageContext";
import { usePlan } from "./usePlan";

/**
 * Запит ручного Premium з пейволу (спека
 * `docs/work/specs/manual-premium-request.md`).
 *
 * Стан бере зі знімка доступу (`access.manualAccess`): поля немає (старий
 * сервер, анонім) або `available: false` - кнопки немає, пейвол як раніше.
 * Після запиту інвалідує `billingKeys.status` (Hard Rule #2), тож
 * `requestedAt` приходить із сервера, а не лише з локального стану.
 *
 * 409 `MANUAL_ACCESS_ALREADY_REQUESTED` - це теж «надіслано»: запит із цього
 * акаунта вже лежить у founder-а, повідомляти про помилку нема про що.
 */
export interface ManualAccessRequestState {
  /** Показувати кнопку «Попросити доступ». */
  available: boolean;
  /** Запит уже є (із сервера або щойно надісланий). */
  sent: boolean;
  busy: boolean;
  failed: boolean;
  request: () => void;
}

const PAGE_MAX = 2048;

export function useManualAccessRequest(
  surface: PaywallSurface,
): ManualAccessRequestState {
  const { access } = usePlan();
  const queryClient = useQueryClient();
  const [sentLocally, setSentLocally] = useState(false);
  // Синхронний замок: `isPending` оновлюється лише з наступним рендером,
  // тож подвійний тап встигав би відправити два POST-и.
  const inFlight = useRef(false);

  const mutation = useMutation({
    mutationFn: () => {
      const ctx = buildPageContext();
      return billingApi.requestManualAccess({
        surface,
        ...(ctx
          ? { page: ctx.page.slice(0, PAGE_MAX), viewport: ctx.viewport }
          : {}),
      });
    },
    onSettled: () => {
      inFlight.current = false;
    },
    onSuccess: () => {
      setSentLocally(true);
      void queryClient.invalidateQueries({ queryKey: billingKeys.status });
    },
    onError: (err) => {
      const code = manualAccessConflictCode(err);
      if (code === "MANUAL_ACCESS_ALREADY_REQUESTED") setSentLocally(true);
      // CLOSED / NOT_NEEDED: знімок застарів, свіжий прибере кнопку.
      if (code !== null) {
        void queryClient.invalidateQueries({ queryKey: billingKeys.status });
      }
    },
  });

  const manual = access?.manualAccess;
  const sent = sentLocally || (manual?.requestedAt ?? null) !== null;
  const alreadyRequested =
    manualAccessConflictCode(mutation.error) ===
    "MANUAL_ACCESS_ALREADY_REQUESTED";

  return {
    available: manual?.available === true,
    sent,
    busy: mutation.isPending,
    failed: mutation.isError && !alreadyRequested && !sent,
    request: () => {
      if (sent || inFlight.current) return;
      inFlight.current = true;
      mutation.mutate();
    },
  };
}
