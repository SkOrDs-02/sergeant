import { useQuery } from "@tanstack/react-query";
import { chatApi } from "@shared/api";
import { chatKeys } from "@shared/lib/api/queryKeys";

/**
 * Чи дизейблити чип «Спитати AI» на `InsightCard` через вичерпану денну
 * AI-квоту (Free). Читає той самий `GET /api/chat/usage`, що й
 * `ChatUsageCounter` — той самий RQ-ключ (`chatKeys.usage`) дедуплікує
 * запит між усіма поверхнями, що монтують хук одночасно (хаб + модуль).
 *
 * Fail-open (спека `insights-ask-ai-chip.md` §5): помилка/відсутність
 * відповіді → `false` (чип активний); `remaining: null` (Pro, без ліміту)
 * → `false`. Дизейблиться лише коли ліміт відомий і фактично вичерпаний.
 */
export function useAskAiQuotaExhausted(): boolean {
  const { data } = useQuery({
    queryKey: chatKeys.usage,
    queryFn: ({ signal }) => chatApi.usage({ signal }),
    staleTime: 30_000,
    retry: false,
  });
  return data ? data.remaining !== null && data.remaining <= 0 : false;
}
