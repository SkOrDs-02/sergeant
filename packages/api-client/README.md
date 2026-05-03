# `@sergeant/api-client`

Єдиний HTTP-шар застосунку. Усі запити до нашого бекенду (`/api/*`) **мають** іти через цей пакет або через web-legacy барел `@shared/api`, який реекспортує `@sergeant/api-client`, щоб:

- ми мали **один** fetch-враппер з узгодженою поведінкою (credentials, timeout, парсинг, helper-методи);
- усі помилки приходили в одному форматі (`ApiError`), з яким уміють працювати React Query, UI-тости й offline-черга;
- ендпоінти були типізовані в одному місці й реюзилися хуками з різних модулів.

Якщо ти пишеш новий запит і думаєш "тут простіше зробити `fetch(...)` напряму" — майже завжди це не так. Див. розділ [Винятки](#винятки) нижче для двох випадків, де bypass справді виправданий.

---

## Зміст

1. [Архітектура](#архітектура)
2. [HTTP-клієнт](#http-клієнт)
3. [ApiError](#apierror)
4. [Конвенція ендпоінтів](#конвенція-ендпоінтів)
5. [Інтеграція з React Query](#інтеграція-з-react-query)
6. [Винятки (де можна не ходити через `@sergeant/api-client` / `@shared/api`)](#винятки)
7. [Додаємо новий ендпоінт: чек-лист](#додаємо-новий-ендпоінт-чек-лист)

---

## Архітектура

```
packages/api-client/src/
├── ApiError.ts        — клас помилки + type-guard isApiError
├── createApiClient.ts — збирає endpoint groups у один `ApiClient`
├── httpClient.ts      — createHttpClient(...) і http.{get,post,put,patch,del,raw}
├── types.ts           — RequestOptions / HttpMethod / ParseMode / QueryValue
├── index.ts           — публічний barrel: createApiClient, ApiError, endpoint factories, типи
├── react/
│   ├── context.tsx    — ApiClientProvider / useApiClient
│   ├── hooks.ts       — React Query hooks поверх ApiClient
│   ├── queryKeys.ts   — apiQueryKeys / apiMutationKeys для package hooks
│   └── index.ts       — `@sergeant/api-client/react`
└── endpoints/
    ├── barcode.ts
    ├── chat.ts
    ├── coach.ts
    ├── foodSearch.ts
    ├── me.ts
    ├── mono.ts
    ├── nutrition.ts
    ├── privat.ts
    ├── push.ts
    ├── sync.ts
    ├── syncV2.ts
    ├── transcribe.ts
    ├── waitlist.ts
    ├── webVitals.ts
    └── weeklyDigest.ts

apps/web/src/shared/api/index.ts — legacy web barrel `@shared/api`
```

Потік запиту:

```
component / hook
      │
      ▼
useQuery / useMutation   ← key з @sergeant/api-client/react або apps/web shared factories
      │
      ▼
api.nutrition.dayPlan(...) / nutritionApi.dayPlan(...)   ← endpoints/*.ts
      │
      ▼
HttpClient.get<T>("/api/...") / HttpClient.raw(...) / HttpClient.request<T>(...)
      │
      ▼
fetch(...) + uniform error → ApiError
```

Правила:

- Компоненти **не** імпортують `http`/`request` напряму. Вони викликають методи з `ApiClient` (`api.nutrition.dayPlan`, `api.monoWebhook.connect`) або legacy web aliases з `@shared/api` (`nutritionApi.dayPlan`, `monoWebhookApi.connect`).
- Ендпоінти **не** імпортують `fetch`/axios. Лише `http` / `request` з `../httpClient`.
- Package React-хуки використовують `packages/api-client/src/react/queryKeys.ts`; web module hooks використовують `apps/web/src/shared/lib/api/queryKeys.ts`. Інлайнові ключі в хуках — ні.

---

## HTTP-клієнт

Файл: `httpClient.ts`. Експортує `createHttpClient(config)`, `applyApiPrefix`, `parseRetryAfterMs`, `DEFAULT_API_PREFIX` і типи `HttpClient` / `HttpClientConfig`.

### `HttpClient.request<T>(path, opts): Promise<T>`

Низькорівнева точка входу повернутого `HttpClient`. Усе, що роблять обгортки `http.*`, під капотом проходить саме через `request`.

Ключові дефолти `createHttpClient()`:

| Опція                | Дефолт                              | Коментар                                                   |
| -------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `baseUrl`            | `""`                                | web ходить відносно origin; mobile може передати API URL   |
| `apiPrefix`          | `"/api/v1"`                         | `/api/*` переписується у `/api/v1/*`, крім `/api/auth/*`   |
| `defaultCredentials` | `"include"`                         | потрібно для better-auth cookie у web                      |
| `method`             | `"GET"`, або `"POST"` якщо є `body` |                                                            |
| `parse`              | `"json"`                            | `"text"` / `"raw"` доступні окремо                         |
| `timeoutMs`          | відсутній                           | свідомо — щоб не ламати SSE-стріми                         |
| `Accept`             | `application/json`                  | завжди                                                     |
| `Content-Type`       | `application/json` якщо body-об'єкт | для `FormData`/`Blob` не ставиться — браузер виставить сам |

Допоміжні трюки:

- `query?: Record<string, QueryValue>` автоматично сереалізується в query-string; `undefined`/`null` значення відкидаються.
- `body` — plain object → `JSON.stringify`; `FormData`/`Blob`/`ArrayBuffer`/`ReadableStream`/`string` → передаються як є.
- `getToken` додає `Authorization: Bearer <token>` до кожного запиту, якщо повернув токен.
- `signal` + `timeoutMs` об'єднуються в один `AbortSignal`; скасування `abort()` приходить з правильною причиною.
- `parse: "raw"` повертає `Response` без споживання body — використовується для SSE-стрімінгу (наприклад, `api.chat.stream`).

### `http.{get, post, put, patch, del, raw}`

Тонкі шорткати над `request` на інстансі `HttpClient`:

```ts
import { createHttpClient } from "@sergeant/api-client";

const http = createHttpClient({ baseUrl, getToken });

await http.get<User>("/api/me");
await http.post<Created>("/api/tasks", { title });
await http.patch<Updated>("/api/tasks/42", { done: true });
await http.del("/api/tasks/42");
await http.raw("/api/chat", { method: "POST", body: payload }); // SSE
```

`http.raw` — єдиний спосіб отримати сирий `Response`, усі інші методи вже розпарсили JSON і повернули типізоване значення або кинули `ApiError`.

---

## ApiError

Файл: `ApiError.ts`. Усі запити через `@sergeant/api-client` або web-барел `@shared/api` кидають `ApiError`, нічого іншого.

```ts
class ApiError extends Error {
  kind: "http" | "network" | "parse" | "aborted";
  status: number; // HTTP-статус; 0 для network/parse/aborted
  body: unknown; // розпарсене JSON-тіло, якщо вдалось
  bodyText: string; // сирий текст (для HTML-фолбеку)
  url: string; // URL запиту — логувати без токенів
  serverMessage?: string; // body.error, якщо сервер повернув стандартну форму

  get isAuth(): boolean; // 401 || 403
  get isOffline(): boolean; // kind === "network" && navigator.onLine === false
}
```

Розрізнення `kind` дозволяє компонентам і React Query реагувати без парсингу `message`:

| `kind`      | Коли                                                           | Що робити                                            |
| ----------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `"http"`    | Сервер відповів, але `!res.ok`                                 | перевір `status`: 401/403 → re-auth, 429/5xx → retry |
| `"network"` | `fetch` впав (DNS, TLS, offline, `TypeError: Failed to fetch`) | retry або offline-черга (`isOffline`)                |
| `"parse"`   | 2xx з не-JSON body коли ми чекаємо JSON                        | обов'язково логати, не retry                         |
| `"aborted"` | `AbortSignal` сигналізував abort (користувач або timeout)      | не показувати тост, скасовано навмисно               |

Type-guard:

```ts
import { createApiClient, isApiError } from "@sergeant/api-client";

const api = createApiClient();

try {
  await api.nutrition.dayPlan({ date: "2026-05-03" });
} catch (e) {
  if (isApiError(e) && e.isAuth) {
    // redirect to login
  }
  throw e; // не "зʼїдай" помилку — хай React Query її побачить
}
```

---

## Конвенція ендпоінтів

Файли в `endpoints/*.ts` експортують фабрику на домен, наприклад:

```ts
// endpoints/nutrition.ts
import type { HttpClient } from "../httpClient";

export interface NutritionDayPlanResponse {
  /* ... */
}

export interface NutritionEndpoints {
  dayPlan: (body: unknown) => Promise<NutritionDayPlanResponse>;
}

export function createNutritionEndpoints(http: HttpClient): NutritionEndpoints {
  return {
    dayPlan: (body) =>
      http.post<NutritionDayPlanResponse>("/api/nutrition/day-plan", body),
  };
}
```

Правила, яких просимо дотримуватись:

- Одна фабрика `create<Domain>Endpoints(http)` на файл, підключена в `createApiClient.ts`.
- Усі типи **запиту/відповіді** — в тому ж файлі, експортуються поіменно з `packages/api-client/src/index.ts`.
- Методи повертають `Promise<T>` з типом, який реально повертає бекенд. Якщо бекенд повертає щось "сирі-сирі" (SSE) — тип `Promise<Response>` через `http.raw`.
- Не треба власного try/catch "щоб показати зрозумілу помилку" — `ApiError.serverMessage` уже містить `body.error`. Якщо дуже треба — вертай **`ApiError`** далі, не `new Error(msg)` (інакше втрачається `status`, `kind`).

---

## Інтеграція з React Query

У web-додатку спільний `QueryClient` живе в `apps/web/src/shared/lib/api/queryClient.ts`. Важливі дефолти для цього проєкту:

```ts
queries: {
  retry: (failureCount, error) => failureCount < 2 && isRetriableError(error),
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  networkMode: "offlineFirst",
},
mutations: { retry: false }, // AI-виклики дорогі
```

`isRetriableError` читає `.status` з помилки:

- `408 / 429 / 5xx` → retry;
- відсутній `status` (тобто `kind: "network"` / `"parse"` / `"aborted"`) → retry (мережева помилка транзієнтна);
- `4xx крім 408/429` → **не** retry.

Саме тому критично, щоб ендпоінти кидали `ApiError` (який має `.status`), а не `new Error(msg)` — інакше React Query не зможе прийняти правильне рішення про retry.

Query keys тримаємо у `packages/api-client/src/react/queryKeys.ts` для package hooks і в `apps/web/src/shared/lib/api/queryKeys.ts` для web module hooks. Не інлайни.

### `authAwareRetry(maxAttempts?)` — retry, що поважає 401/403

Коли для конкретної query треба трохи інший retry-бюджет, ніж глобальний дефолт, використовуй фабрику замість інлайн-предиката:

```ts
import { authAwareRetry } from "@shared/lib/api/queryClient";

useQuery({
  queryKey: monoKeys.statements(month),
  queryFn: () => monoApi.getStatements(month),
  retry: authAwareRetry(1), // важка RQ — максимум 1 повтор
});
```

Правила всередині:

- `failureCount >= maxAttempts` → стоп.
- `isApiError(err) && err.isAuth` → стоп (401/403 не ретраяться, нового токена без юзера не буде).
- Інакше делегує у `isRetriableError(err)`, тобто той самий список, що й у глобальному дефолті (5xx/408/429/network/parse/aborted).

Не переписуй ці інваріанти інлайном у хуках — якщо треба варіація, ось єдина точка зміни.

### `formatApiError(err, { fallback, httpStatusToMessage? })` — текст помилки для UI

Замість розкиданого по мутаціях патерну `setErr(err?.message || "Fallback")` — який ігнорує `kind === "aborted"`, не розрізняє offline/parse, і показує в тості "HTTP 503" — використовуй:

```ts
import { formatApiError } from "@shared/lib/api/apiErrorFormat";

useMutation({
  mutationFn: () => weeklyDigestApi.generate(),
  onError: (err) => {
    setErr(formatApiError(err, { fallback: "Помилка генерації звіту" }));
  },
});
```

Поведінка:

- `kind: "aborted"` → повертає `""` (нічого не показуємо, користувач скасував сам).
- `kind: "network"` → `"Немає підключення до інтернету…"` якщо `navigator.onLine === false`, інакше `err.message` або дефолтний "Не вдалося зʼєднатися".
- `kind: "parse"` → розпізнає HTML-rewrite від Vercel і повертає спеціальний текст; інакше `err.message`/`err.bodyText`/`fallback`.
- `kind: "http"` → делегує в `httpStatusToMessage(status, serverMessage)`, дефолтно `friendlyApiError` з `@shared/lib`. Якщо сервер не дав свого тексту і мапер впав у загальний `"Помилка <status>"` — використовується caller-specific `fallback` (контекстний текст корисніший за голий код статусу).
- `err instanceof Error` → `err.message`.
- інакше → `fallback`.

Для nutrition-хуків є готова обгортка `formatNutritionError(err, fallback)` у `modules/nutrition/lib/nutritionErrors.ts` — вона прокидує доменний `friendlyApiError` (з обробкою 413 «велике фото» і 500 «ANTHROPIC key»).

Приклад хука:

```ts
import { useQuery } from "@tanstack/react-query";
import { foodSearchApi } from "@shared/api";
import { nutritionKeys } from "@shared/lib/api/queryKeys";

export function useFoodSearch(query: string) {
  return useQuery({
    queryKey: nutritionKeys.foodSearchLocal(query),
    queryFn: () => foodSearchApi.search(query),
    enabled: query.trim().length > 0,
  });
}
```

---

## Винятки

Є рівно два місця в web-коді, де ми **свідомо** не ходимо через `@sergeant/api-client` / `@shared/api`. Будь ласка, не "виправляйте" їх — вони існують з технічних причин, і кожне з них задокументоване на місці.

### 1. `apps/web/src/core/observability/webVitals.ts` — Core Web Vitals

- Відправляє батч метрик на `POST /api/metrics/web-vitals`.
- Використовує `navigator.sendBeacon(...)` з fallback на `fetch({ keepalive: true })`.
- **Чому не `http.post`:** `sendBeacon` — єдиний надійний спосіб доставити метрики на `visibilitychange=hidden` / `pagehide`. `http.post` з базовими `credentials: "include"` + без `keepalive` на unload не буде доставлено. Додавати це в `@sergeant/api-client` / `@shared/api` лише заради одного виклику — надмірна абстракція.
- Телеметрія не повинна ламати UX: модуль свідомо ковтає всі помилки.

### 2. `apps/web/src/core/auth/authClient.ts` — better-auth

- Імпортує `createAuthClient` з `better-auth/react`.
- Викликає `signIn`, `signUp`, `signOut`, `useSession`.
- **Чому не через `@sergeant/api-client` / `@shared/api`:** `better-auth` володіє власним транспортним шаром (cookies, PKCE, CSRF-токени, middleware-сумісність). Проксювати його запити через наш `request` нічого нам не дасть і зламає все, що покладається на session-лайфцикл. Це вендорний client, не наш HTTP-код.

Якщо додаєш щось, що теоретично могло б стати третім винятком — зупинись і проконсультуйся в PR. У 95% випадків цього можна уникнути.

---

## Додаємо новий ендпоінт: чек-лист

1. Створи/онови файл у `endpoints/<domain>.ts`. Імпортуй тільки тип `HttpClient` з `../httpClient`, а `http` отримуй аргументом фабрики `create<Domain>Endpoints(http)`.
2. Опиши типи запиту/відповіді поруч. Якщо тип використовується в UI — експортуй його.
3. Додай експорт об'єкта й типів у `packages/api-client/src/index.ts`; якщо legacy web import має лишатись доступним через `@shared/api`, додай реекспорт у `apps/web/src/shared/api/index.ts`.
4. Якщо запит буде через React Query — додай ключ у `packages/api-client/src/react/queryKeys.ts` для package hooks або в `apps/web/src/shared/lib/api/queryKeys.ts` для web module hooks. Не інлайни ключ у хуці.
5. Кидай `ApiError` далі, якщо треба обгорнути — використовуй `cause`, не прикривай `status`.
6. Не додавай `fetch(...)` або axios у модуль. Якщо `HttpClient` чогось не вміє — допиши це в `httpClient.ts`, а не обходь його.

Якщо сумніваєшся — глянь, як зроблено `endpoints/sync.ts` або `endpoints/nutrition.ts`: це живі референси.

---

## Me endpoints

Факторі: `createMeEndpoints(http)` у `endpoints/me.ts`. Експонує один метод для пошаренного «хто я» на всіх клієнтах (web cookie і mobile bearer).

```ts
import { createApiClient } from "@sergeant/api-client";

const api = createApiClient();
const { user } = await api.me.get();
//        ^? MeResponse["user"] з `@sergeant/shared`
```

- `api.me.get({ signal? })` → `Promise<MeResponse>`, де `MeResponse` — `z.infer` з `MeResponseSchema` (`@sergeant/shared/schemas/api.ts`). Runtime-парсинг через `MeResponseSchema.parse(...)`, тож будь-яка розбіжність форми ловиться одразу як `ZodError`.
- `apiPrefix` (default `/api/v1`) прикладається автоматично — метод звертається до `/api/me`, в http-клієнті шлях переписується у `/api/v1/me`.

React-шар (`@sergeant/api-client/react`):

```ts
import { useUser } from "@sergeant/api-client/react";

function Header() {
  const { data, isPending } = useUser();
  if (isPending) return <Skeleton />;
  return <span>{data?.user.name ?? "Guest"}</span>;
}
```

Ключ запиту — `apiQueryKeys.me.current()`; для ручної інвалідації всього піддомену — `queryClient.invalidateQueries({ queryKey: apiQueryKeys.me.all })`.

---

## Push endpoints

Факторі: `createPushEndpoints(http)` у `endpoints/push.ts`. Окрім трьох легасі web-push ендпоінтів (`getVapidPublic`, `subscribe`, `unsubscribe`), експонує уніфіковану реєстрацію пристрою для web / iOS / Android (контракт задокументований у `docs/mobile/overview.md` і `docs/architecture/api-v1.md`):

```ts
import { createApiClient } from "@sergeant/api-client";

const api = createApiClient();

// Web PWA (service-worker endpoint + keys):
await api.push.register({
  platform: "web",
  token: "https://fcm.googleapis.com/wp/xxx",
  keys: { p256dh: "…", auth: "…" },
});

// iOS (APNs device token):
await api.push.register({ platform: "ios", token: "<64-hex>" });

// Android (FCM registration token):
await api.push.register({ platform: "android", token: "<fcm>" });
```

- `api.push.register(body, { signal? })` → `Promise<PushRegisterResponse>` (`{ ok: true, platform }`). Runtime-валідація request'а відповідає `PushRegisterRequestSchema` (реекспорт `PushRegisterSchema` з `@sergeant/shared` — один discriminated union на `platform`, тож web без `keys` або native з `keys` зловлене ще до мережі). Відповідь валідується `PushRegisterResponseSchema`.
- Шлях `/api/push/register` автоматично перетворюється на `/api/v1/push/register` через `applyApiPrefix` (див. `httpClient.ts`). Не передавай `/api/v1/…` явно — ідемпотентно, але плутає ревью.

React-шар:

```ts
import { usePushRegister } from "@sergeant/api-client/react";

const register = usePushRegister();
register.mutate({ platform: "ios", token: deviceToken });
```

Ключ мутації — `apiMutationKeys.push.register()`; придатний для `useIsMutating` у UI (блокувати кнопку «Увімкнути нотифікації», поки мутація in-flight).
