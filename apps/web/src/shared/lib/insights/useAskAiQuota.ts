import { useContext } from "react";
import {
  QueryClient,
  QueryClientContext,
  useQuery,
} from "@tanstack/react-query";
import { chatApi } from "@shared/api";
import { chatKeys } from "@shared/lib/api/queryKeys";

/**
 * Порожній клієнт на випадок, коли хук змонтований поза `QueryClientProvider`.
 * Такий рендер існує лише в тестах, які піднімають одну картку без обвʼязки
 * застосунку — без цього `useQuery` кидав би «No QueryClient set» і валив
 * тест, який до квоти AI не має жодного стосунку. Запити тут не летять:
 * `enabled` вимкнено, коли контексту немає, тож клієнт лишається порожній,
 * `data` — `undefined`, і хук віддає fail-open `false`.
 */
const detachedClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

/**
 * Чи дизейблити чип «AI» на `InsightCard` через вичерпану денну
 * AI-квоту (Free). Читає той самий `GET /api/chat/usage`, що й
 * `ChatUsageCounter` — той самий RQ-ключ (`chatKeys.usage`) дедуплікує
 * запит між усіма поверхнями, що монтують хук одночасно (хаб + модуль).
 *
 * Fail-open (спека `insights-ask-ai-chip.md` §5): помилка/відсутність
 * відповіді → `false` (чип активний); `remaining: null` (Pro, без ліміту)
 * → `false`. Дизейблиться лише коли ліміт відомий і фактично вичерпаний.
 */
export function useAskAiQuotaExhausted(): boolean {
  const client = useContext(QueryClientContext);
  const { data } = useQuery(
    {
      queryKey: chatKeys.usage,
      queryFn: ({ signal }) => chatApi.usage({ signal }),
      staleTime: 30_000,
      retry: false,
      enabled: client !== undefined,
    },
    client ?? detachedClient,
  );
  return data ? data.remaining !== null && data.remaining <= 0 : false;
}
