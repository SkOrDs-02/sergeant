import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import {
  ApiError,
  isApiError,
  type BarcodeProduct,
} from "@sergeant/api-client";
import { apiQueryKeys, useApiClient } from "@sergeant/api-client/react";

const STALE_TIME = 24 * 60 * 60_000;
const GC_TIME = 7 * 24 * 60 * 60_000;

/**
 * Імперативний lookup штрихкоду з кешем React Query (паритет із web
 * `useBarcodeProduct` у `apps/web/.../useBarcodeProduct.ts`).
 */
export function useBarcodeProductLookup() {
  const queryClient = useQueryClient();
  const api = useApiClient();

  return useCallback(
    async (code: string): Promise<BarcodeProduct | null> => {
      const normalized = String(code).trim();
      if (!normalized) return null;

      const net = await NetInfo.fetch();
      if (net.isConnected === false) {
        throw new ApiError({
          kind: "network",
          message: "Немає підключення до інтернету. Спробуй пізніше.",
          url: "/api/barcode",
        });
      }

      return await queryClient.fetchQuery({
        queryKey: apiQueryKeys.barcode.lookup(normalized),
        queryFn: async () => {
          try {
            const res = await api.barcode.lookup(normalized);
            return res?.product ?? null;
          } catch (e) {
            if (isApiError(e) && e.status === 404) return null;
            throw e;
          }
        },
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
      });
    },
    [api, queryClient],
  );
}
