# Playbook: Add React Query Hook

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** «Дай хук який тягне X з API» / новий useQuery або useMutation у `apps/web` / нова server-state дата.

---

## Контекст

Усі RQ-ключі в Sergeant централізовані в `apps/web/src/shared/lib/queryKeys.ts` (AGENTS.md hard rule #2). Це гарантує, що `invalidateQueries({ queryKey: xxxKeys.all })` дійсно знижує всі дочірні запити, і що ключі type-safe. **Hardcoded keys заборонені** — ESLint ще не ловить, але код-рев'ю ловить.

---

## Steps

### 1. Зареєструвати ключ у factory

Знайти або створити factory у `apps/web/src/shared/lib/queryKeys.ts`. Конвенція: `[domain, resource, ...params] as const`, домен = назва модуля.

```ts
// apps/web/src/shared/lib/queryKeys.ts
export const finykKeys = {
  all: ["finyk"] as const,

  // ... існуючі ключі ...

  // ➕ новий ключ
  monoBudgetForecast: (monthKey: string) =>
    ["finyk", "mono", "budget-forecast", monthKey] as const,
};
```

Правила:

- Перший елемент tuple — домен (= перша частина `all`).
- Параметри — від найширшого до найвужчого (місяць → категорія → юзер). Це підтримує bulk-invalidate.
- **Секрети** (Mono token, API ключі) — ніколи в ключ. Хешуй через `hashToken()` у тому ж файлі.
- Експорт `as const`, щоб TypeScript виводив літеральні tuples.

### 2. Endpoint у `@sergeant/api-client`

Якщо це новий endpoint — додай функцію у `packages/api-client/src/endpoints/<module>.ts`:

```ts
// packages/api-client/src/endpoints/finyk.ts
export interface MonoBudgetForecast {
  monthKey: string;
  projected: number; // minor units (kopiykas)
  confidence: number; // 0..1
}

export async function getMonoBudgetForecast(
  monthKey: string,
): Promise<MonoBudgetForecast> {
  return httpClient.get(`/api/finyk/mono/budget-forecast?month=${monthKey}`);
}
```

Pешта endpoint-у (handler, route, zod-schema) — див. [add-api-endpoint.md](add-api-endpoint.md).

### 3. Хук

Створити в `apps/web/src/modules/<module>/hooks/use<Name>.ts` (для модульних) або `apps/web/src/core/hooks/use<Name>.ts` (для крос-модульних).

```ts
// apps/web/src/modules/finyk/hooks/useMonoBudgetForecast.ts
import { useQuery } from "@tanstack/react-query";
import { getMonoBudgetForecast } from "@sergeant/api-client";
import { finykKeys } from "@shared/lib/queryKeys";

export function useMonoBudgetForecast(monthKey: string) {
  return useQuery({
    queryKey: finykKeys.monoBudgetForecast(monthKey),
    queryFn: () => getMonoBudgetForecast(monthKey),
    staleTime: 60_000, // 1 хв — прогноз не змінюється часто
    enabled: Boolean(monthKey),
  });
}
```

Конвенції:

- Один хук — один factory call. Не `queryKey: ["finyk", ...]` навіть «тимчасово».
- `staleTime` обери осмислено. Webhook-pushed дані — низький; статичні (категорії, налаштування) — високий.
- `enabled` — для умовних ключів (`monthKey ? ... : skip`).
- Mutation — `useMutation` з `onSuccess` що викликає `queryClient.invalidateQueries({ queryKey: finykKeys.all })` або вузький підрозділ.

### 4. MSW handler для тестів

Додай handler у `apps/web/src/test/msw/handlers/<module>.ts`:

```ts
// apps/web/src/test/msw/handlers/finyk.ts
import { http, HttpResponse } from "msw";

export const finykHandlers = [
  // ...
  http.get("*/api/finyk/mono/budget-forecast", ({ request }) => {
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    return HttpResponse.json({
      monthKey: month,
      projected: 1234500, // 12 345 ₴ у копійках
      confidence: 0.82,
    });
  }),
];
```

Якщо в репо ще нема `apps/web/src/test/msw/handlers/<module>.ts` — глянь сусідній модуль; всі handlers агрегуються у `setupServer()` у `apps/web/src/test/setup.ts` (MSW landed у [#729](https://github.com/Skords-01/Sergeant/pull/729)).

### 5. Тест хука

```ts
// apps/web/src/modules/finyk/hooks/useMonoBudgetForecast.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMonoBudgetForecast } from "./useMonoBudgetForecast";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

it("повертає прогноз для місяця", async () => {
  const { result } = renderHook(() => useMonoBudgetForecast("2026-04"), {
    wrapper: makeWrapper(),
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.projected).toBe(1234500);
});
```

### 6. Optional: prefetch у Server-Side або at-route-level

Якщо хук критичний для first paint — додай prefetch у `apps/web/src/core/App.tsx` або у відповідному route-level loader-і:

```ts
queryClient.prefetchQuery({
  queryKey: finykKeys.monoBudgetForecast(currentMonth),
  queryFn: () => getMonoBudgetForecast(currentMonth),
});
```

### 7. PR

Branch: `devin/<unix-ts>-feat-<module>-<hook-name>`. Commit example:

```
feat(web): add useMonoBudgetForecast hook

- finykKeys.monoBudgetForecast factory
- api-client endpoint getMonoBudgetForecast
- MSW handler + unit test
```

---

## Verification

- [ ] Ключ у `queryKeys.ts` factory (НЕ hardcoded).
- [ ] Параметри в правильному порядку (від широкого до вузького).
- [ ] Endpoint у `@sergeant/api-client` з типами, що збігаються із серверним response shape (AGENTS.md rule #3).
- [ ] MSW handler в `apps/web/src/test/msw/handlers/<module>.ts`.
- [ ] Unit test для хука (минaute success path як мінімум).
- [ ] `pnpm lint` + `pnpm typecheck` — green.
- [ ] Якщо змінив API shape — оновлено snapshot-тест на сервері.

## Notes

- Don't put fetch logic in the component. Завжди через хук.
- Mutation `onSuccess` має invalidate-ити **і** широкий ключ (для списків), **і** конкретний (для деталей):
  ```ts
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: finykKeys.monoTransactionsDb(undefined, undefined, undefined),
    });
    queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState });
  };
  ```
- Не плутай **`queryKey`** і **`mutationKey`** — для `useMutation` ключ зазвичай не потрібен (RQ використовує функцію).
- Якщо хук тягне ту ж саму дату двома різними способами (DB-backed + webhook-backed) — зроби 2 ключі (`monoTransactionsDb` vs `monoWebhookTransactions`), не один з прапорцем.

## See also

- [add-api-endpoint.md](add-api-endpoint.md) — як зробити endpoint, який потім тягне цей хук
- [AGENTS.md](../../AGENTS.md) — hard rule #2 (RQ keys), rule #3 (API contract)
- `apps/web/src/shared/lib/queryKeys.ts` — приклади existing factories
- [#729](https://github.com/Skords-01/Sergeant/pull/729) — MSW setup
