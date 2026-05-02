# Sergeant - Детальний План Реалізації Покращень

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

> **Дата створення:** 2026-04-28
> **Автор:** v0 AI Assistant
> **Базується на:** `2026-04-28-sergeant-comprehensive-audit.md`, `2026-04-26-sergeant-audit-devin.md`
> **Статус:** Ready for execution

---

## Зміст

1. [Executive Summary](#1-executive-summary)
2. [Поточний Стан Проблем](#2-поточний-стан-проблем)
3. [Пріоритизація за Матрицею Impact/Effort](#3-пріоритизація-за-матрицею-impacteffort)
4. [Детальний План по Спринтах](#4-детальний-план-по-спринтах)
5. [Технічні Специфікації Виправлень](#5-технічні-специфікації-виправлень)
6. [Залежності та Порядок Виконання](#6-залежності-та-порядок-виконання)
7. [Метрики Успіху](#7-метрики-успіху)
8. [Ризики та Мітігації](#8-ризики-та-мітігації)

---

## 1. Коротко про план (Executive Summary)

### 1.1. Загальна Картина

Проект **Sergeant** — зріла платформа з оцінкою **7.5/10**. Основні проблеми зосереджені у:

| Категорія     | Критичних | Важливих | Nice-to-have |
| ------------- | --------- | -------- | ------------ |
| Type Safety   | 1         | 2        | 0            |
| Code Quality  | 2         | 4        | 2            |
| Testing       | 1         | 2        | 1            |
| Mobile        | 0         | 3        | 1            |
| Observability | 0         | 2        | 2            |
| **Всього**    | **4**     | **13**   | **6**        |

### 1.2. Ключові Виграші від Реалізації

1. **Type Safety** — зменшення runtime errors на ~40%
2. **localStorage migration** — усунення quota/sync bugs
3. **Code decomposition** — покращення review time на ~25%
4. **Mobile stability** — 0 flaky tests у CI

---

## 2. Поточний Стан Проблем

### 2.1. Критичні (P0) — блокують production-якість

| ID       | Проблема                       | Файлів                                                    | Поточний Прогрес                                                                                                                            |
| -------- | ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-1** | `apps/web` strict: false       | ~374 TS errors (full `strict: true` baseline, 2026-05-02) | Phases 1–3.1 done (`tsconfig.strict.json` покриває `src/{shared,test,core/*,modules/*}`); Phase 4 (`strict: true` + зняти `allowJs`) — TODO |
| **P0-2** | localStorage без safe wrappers | 52 файли                                                  | 3 файли мігровано                                                                                                                           |
| **P0-3** | Mobile flaky tests             | 2 тести                                                   | 1 з 3 виправлено                                                                                                                            |
| **P0-4** | Mobile APM відсутній           | 0% coverage                                               | Не почато                                                                                                                                   |

### 2.2. Високі (P1) — значний tech-debt

| ID       | Проблема                       | Деталі           | Статус          |
| -------- | ------------------------------ | ---------------- | --------------- |
| **P1-1** | Великі файли (>600 LOC)        | 25 файлів        | 2 decomposed    |
| **P1-2** | TypeScript 6.0.3 bleeding edge | Tooling ризики   | Monitoring      |
| **P1-3** | Capacitor без boundary tests   | 0 тестів         | Не почато       |
| **P1-4** | Prompt cache не активовано     | $$ waste         | Ready to enable |
| **P1-5** | Немає distributed tracing      | Debug складність | Не почато       |

### 2.3. Середні (P2) — DX-покращення

| ID       | Проблема                    | Деталі               |
| -------- | --------------------------- | -------------------- |
| **P2-1** | TODO/FIXME без трекінгу     | 10 файлів            |
| **P2-2** | No Sentry integration       | Error context loss   |
| **P2-3** | Mobile debt tracker missing | Hidden accumulation  |
| **P2-4** | `as unknown as X` patterns  | 9 файлів в allowlist |

---

## 3. Пріоритизація за Матрицею Impact/Effort

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │   P0-1 (TS)       │   P1-1 (files)    │
    │   P0-2 (storage)  │   P1-5 (tracing)  │
    │   P0-3 (flaky)    │                   │
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT                  │                   EFFORT
    │                   │                   │
    │   P1-4 (cache)    │   P0-4 (APM)      │
    │   P2-1 (TODO)     │   P1-3 (Capacitor)│
    │   P2-4 (as any)   │                   │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                   LOW IMPACT
```

**Рекомендований порядок:**

1. Quick Wins: P1-4, P2-1, P0-3
2. High Impact/Low Effort: P0-1, P0-2
3. High Impact/High Effort: P1-1, P1-5
4. Strategic: P0-4, P1-3

---

## 4. Детальний План по Спринтах

### Спринт 1 (тижні 1–2): стабілізація

**Мета:** Усунути критичні блокери, стабілізувати CI

#### Завдання 1.1: TypeScript strict, Phase 4 (повний `strict: true`)

**Scope:** `apps/web/tsconfig.json` — зняти `allowJs: true`, ввімкнути `strict: true`, починити залишкові implicit-any.

**Статус фаз (див. `docs/tech-debt/frontend.md` §11):**

```
Phase 1   — strictNullChecks: src/shared/**                              ✅ done (PR #870)
Phase 2   — strictNullChecks: + src/test, core/{auth,cloudSync,components,
             hints,hooks,observability,pricing,profile}                   ✅ done
Phase 2.1 — strictNullChecks: + core/{hub,settings}                       ✅ done
Phase 3   — strictNullChecks: + modules/{routine,nutrition,finyk,fizruk}
             + core/{app,hub,insights,onboarding,settings,lib}             ✅ done
Phase 3.1 — strictNullChecks: + core/{designShowcase,stories}             ✅ done
Phase 4   — strict: true + remove allowJs (весь apps/web)              ⏳ todo
```

**Заміряний скоуп Phase 4 (2026-05-02 re-measure через діагностичний `tsconfig.strict-full.json`):** **374 помилки в 46 файлах**.

```
TS error breakdown:
├── TS7006 parameter implicit-any         — 162
├── TS7031 binding element implicit-any   — 114
├── TS7053 element implicit-any           —  23
├── TS2345 argument type                  —  17
├── TS2339 property does not exist        —  15
├── TS2322 type assignability             —  10
├── TS7005 var without type               —   9
├── TS2307 cannot find module             —   7
└── інші                                  —  17

Top blockers (одиничний фікс розблокує найбільше):
├── sw.ts                                                    — 27
├── core/onboarding/presetApply.ts                           — 23
├── modules/fizruk/components/workouts/AddExerciseSheet      — 21
├── modules/fizruk/components/WorkoutTemplatesSection        — 21
├── modules/fizruk/components/workouts/WorkoutItemCard       — 20
├── modules/fizruk/components/workouts/WorkoutCatalogSection — 20
├── modules/fizruk/components/workouts/ExerciseDetailSheet   — 19
├── modules/fizruk/pages/Workouts                            — 18
├── modules/fizruk/pages/Exercise                            — 18
└── core/insights/WeeklyDigestCard                           — 15
```

**Виконання (орієнтовно):**

| Day | Задача                                                          | Файлів | Effort |
| --- | --------------------------------------------------------------- | ------ | ------ |
| 1   | sw.ts + core/onboarding/presetApply (top-2 blockers, 50 errors) | 2      | 4h     |
| 2-3 | modules/fizruk top-7 (AddExerciseSheet, WorkoutItemCard, …)     | 7      | 10h    |
| 4   | core/insights/WeeklyDigestCard + залишкові fizruk               | ~10    | 6h     |
| 5   | Зріз `allowJs: true` + ввімкнути `strict: true` + cleanup       | ~27    | 6h     |

> **Чому Phase 4 не дробиться через `tsconfig.noimplicitany.json`-include:** TypeScript застосовує `noImplicitAny` ко всій програмі (всі transitively reached файли), не тільки до `include`-списку. Спроба додати `core/{lib,hub,insights,onboarding,settings,stories,designShowcase}` дає 801 помилку бо вони імпортують з `modules/{finyk,fizruk}`. Рухатись треба per-file (top blockers першими), без проміжної "Phase 3.2".

**Definition of Done:**

- [ ] `apps/web/tsconfig.json` має `"strict": true`
- [ ] `apps/web/tsconfig.json` не має `allowJs: true`
- [ ] `pnpm typecheck` проходить без помилок
- [ ] CI strict-coverage metric рапортує `apps/web` як strict

---

#### Завдання 1.2: міграція localStorage (батч 1)

**Scope:** Top-10 найкритичніших файлів

**Файли для міграції (за частотою використання):**

| #   | Файл                     | Виклики | Пріоритет |
| --- | ------------------------ | ------- | --------- |
| 1   | `useOfflineQueue.ts`     | 12      | Critical  |
| 2   | `useCloudSync.ts`        | 8       | Critical  |
| 3   | `useTypedStore.ts`       | 6       | High      |
| 4   | `SettingsPage.tsx`       | 5       | High      |
| 5   | `OnboardingWizard.tsx`   | 4       | Medium    |
| 6   | `HubDashboard.tsx`       | 4       | Medium    |
| 7   | `useFinykCategories.ts`  | 3       | Medium    |
| 8   | `useRoutineReminders.ts` | 3       | Medium    |
| 9   | `useFizrukProgress.ts`   | 3       | Medium    |
| 10  | `useNutritionHistory.ts` | 3       | Medium    |

**Патерн міграції:**

```typescript
// BEFORE (unsafe)
const value = localStorage.getItem("key");
localStorage.setItem("key", JSON.stringify(data));

// AFTER (safe)
import { safeReadLS, safeWriteLS } from "@/shared/storage";
const value = safeReadLS<MyType>("key", defaultValue);
safeWriteLS("key", data);

// OR for typed stores
import { typedStore } from "@/shared/typedStore";
const store = typedStore("myFeature", schema, defaults);
```

**Definition of Done:**

- [ ] 10 файлів мігровано на safe wrappers
- [ ] ESLint allowlist зменшено з 52 до 42
- [ ] Жодних нових localStorage.\* викликів у PR

---

#### Завдання 1.3: фікс flaky-тестів на mobile

**Scope:** 2 залишкові flaky тести

**Файли:**

1. `apps/mobile/src/core/dashboard/WeeklyDigestFooter.test.tsx`
2. `apps/mobile/src/core/settings/HubSettingsPage.test.tsx`

**Root Cause Analysis:**

```typescript
// Problem: AccessibilityInfo.isReduceMotionEnabled never resolves
jest.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(), // Missing mockResolvedValue
  },
}));

// Solution (from OnboardingWizard fix - commit 53853e00):
jest.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
  },
}));
```

**Definition of Done:**

- [ ] 0 flaky tests на main branch
- [ ] CI mobile job має 100% pass rate (last 20 runs)

---

#### Завдання 1.4: розбити ProfilePage.tsx

**Scope:** `apps/web/src/core/profile/ProfilePage.tsx` (1060 LOC) — файл уже переїхав у підпапку `profile/`

**Запропонована структура:**

```
apps/web/src/core/profile/
├── ProfilePage.tsx           # Container (~150 LOC)
├── ProfileHeader.tsx         # Avatar + name (~120 LOC)
├── ProfileStats.tsx          # Usage statistics (~180 LOC)
├── ProfileSettings.tsx       # Preferences form (~200 LOC)
├── ProfileDangerZone.tsx     # Delete account etc (~150 LOC)
├── useProfileData.ts         # Data fetching hook (~100 LOC)
└── profile.types.ts          # TypeScript types (~50 LOC)
```

**Definition of Done:**

- [ ] ProfilePage.tsx < 200 LOC
- [ ] Усі тести проходять
- [ ] Жодних circular dependencies

---

### Спринт 2 (тижні 3–4): зменшення tech-debt

#### Завдання 2.1: міграція localStorage (батч 2)

**Scope:** Наступні 20 файлів із allowlist

| Batch | Файли    | Module       |
| ----- | -------- | ------------ |
| 2a    | 5 файлів | finyk/\*     |
| 2b    | 5 файлів | fizruk/\*    |
| 2c    | 5 файлів | nutrition/\* |
| 2d    | 5 файлів | routine/\*   |

**Definition of Done:**

- [ ] ESLint allowlist зменшено з 42 до 22
- [ ] Жодних quota exceeded помилок у Sentry

---

#### Завдання 2.2: розбити HubDashboard.tsx

**Scope:** `apps/web/src/core/hub/HubDashboard.tsx` (902 LOC)

**Запропонована структура:**

```
apps/web/src/core/hub/
├── HubDashboard.tsx          # Container (~100 LOC)
├── HubHeader.tsx             # Navigation + greeting (~80 LOC)
├── TodayFocusCard.tsx        # Recommendation engine widget (~150 LOC)
├── ModuleQuickActions.tsx    # 4 module shortcuts (~120 LOC)
├── WeeklyProgressChart.tsx   # Cross-module chart (~180 LOC)
├── RecentActivityFeed.tsx    # Activity timeline (~150 LOC)
├── useHubAggregation.ts      # Data aggregation hook (~100 LOC)
└── hub.types.ts              # TypeScript types (~40 LOC)
```

---

#### Завдання 2.3: тести для HubReports.tsx

**Scope:** `apps/web/src/core/hub/HubReports.tsx` (638 LOC)

**Test Coverage Plan:**

```typescript
describe("HubReports", () => {
  describe("Data Aggregation", () => {
    it("aggregates finyk transactions correctly");
    it("aggregates fizruk workouts correctly");
    it("aggregates routine completions correctly");
    it("aggregates nutrition entries correctly");
    it("handles missing module data gracefully");
  });

  describe("Date Range Filtering", () => {
    it("filters by week correctly");
    it("filters by month correctly");
    it("filters by custom range correctly");
  });

  describe("Export Functionality", () => {
    it("exports to CSV with correct format");
    it("exports to PDF with correct layout");
  });

  describe("Edge Cases", () => {
    it("handles empty data state");
    it("handles loading state");
    it("handles error state");
  });
});
```

---

#### Завдання 2.4: boundary-тести mobile-shell

**Scope:** `apps/mobile-shell` (Capacitor wrapper)

**Test Plan:**

```typescript
// apps/mobile-shell/tests/boundary.test.ts
describe("Capacitor Boundary Tests", () => {
  describe("Web Compatibility", () => {
    it("web bundle loads without errors");
    it("no unsupported APIs are called");
    it("service worker registration works");
  });

  describe("Native Bridge", () => {
    it("Filesystem plugin accessible");
    it("Storage plugin accessible");
    it("Network plugin accessible");
  });

  describe("Deep Links", () => {
    it("handles sergeant:// scheme");
    it("handles universal links");
  });
});
```

---

### Спринт 3 (тижні 5–6): оптимізація

#### Завдання 3.1: міграція localStorage (фінальний батч)

**Scope:** Залишкові 22 файли

**Definition of Done:**

- [ ] ESLint allowlist = 0 файлів
- [ ] `no-raw-local-storage` rule enforcement = error (not warn)

---

#### Завдання 3.2: прибрати дублювання коду (backend)

**Scope:** `apps/server/src/`

**Дублікати для усунення:**

| Pattern              | Файли                      | Рішення                             |
| -------------------- | -------------------------- | ----------------------------------- |
| `elapsedMs(start)`   | 4+ файли                   | Extract to `lib/timing.ts`          |
| OFF/USDA normalizers | barcode.ts, food-search.ts | Already done (PR #882)              |
| `pantry → prompt`    | 3 файли                    | Extract to `lib/prompt-builders.ts` |
| FNV-1a hashing       | 2 файли                    | Extract to `lib/hash.ts`            |

---

#### Завдання 3.3: переписати патерни `as unknown as X`

**Scope:** 9 файлів у ESLint allowlist

| Файл                         | Кількість | Причина             | Рішення                |
| ---------------------------- | --------- | ------------------- | ---------------------- |
| `useFinykPersonalization.ts` | 6         | API response typing | Add proper Zod schemas |
| `App.tsx`                    | 3         | Router typing       | Use typed router       |
| `VoiceMicButton.tsx`         | 2         | Web Audio API       | Add proper types       |
| `hubChatUtils.ts`            | 2         | Tool definitions    | Type guard functions   |
| Server files (5)             | 1 each    | Various             | Case-by-case           |

---

#### Завдання 3.4: розбити великі файли (батч 2)

**Файли:**

| Файл                     | LOC  | Структура                               |
| ------------------------ | ---- | --------------------------------------- |
| `ActiveWorkoutPanel.tsx` | 949  | Split by phase (warmup/main/cooldown)   |
| `HubChat.tsx`            | ~800 | Split by concern (input/messages/tools) |
| `Overview.tsx`           | ~750 | Split by section                        |
| `Workouts.tsx`           | 894  | Split by view (list/detail/create)      |
| `DesignShowcase.tsx`     | 1064 | Split by component category             |

---

### Спринт 4+ (continuous): постійне покращення

#### Завдання 4.1: увімкнути prompt-cache

**Scope:** HubChat SYSTEM_PREFIX

**Implementation:**

```typescript
// apps/server/src/hubchat/system-prompt.ts
export const SYSTEM_PREFIX = {
  content: `...`, // Current system prompt
  cacheControl: { type: 'ephemeral' }, // Enable caching
};

// Usage in chat handler
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: [SYSTEM_PREFIX],
  messages: [...],
});
```

**Expected Savings:** ~$50-100/month at current usage

---

#### Завдання 4.2: додати Sentry-інтеграцію

**Scope:** `apps/web`, `apps/mobile`

**Implementation:**

```typescript
// apps/web/src/lib/sentry.ts
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
});
```

---

#### Завдання 4.3: налаштувати APM на mobile

**Scope:** `apps/mobile`

**Implementation:**

```typescript
// apps/mobile/src/lib/monitoring.ts
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableNative: true,
  enableAutoSessionTracking: true,
});
```

---

#### Завдання 4.4: оптимізація розміру bundle-у

**Current:** 615 KB (brotli)
**Target:** 550 KB (brotli)

**Strategies:**

| Strategy            | Potential Savings |
| ------------------- | ----------------- |
| Lazy load Recharts  | ~30 KB            |
| Tree-shake date-fns | ~15 KB            |
| Split code by route | ~20 KB            |
| Remove unused icons | ~10 KB            |

---

#### Завдання 4.5: інтеграція Lighthouse CI

**Implementation:**

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on: [pull_request]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: "./lighthouserc.json"
          uploadArtifacts: true
```

---

## 5. Технічні специфікації виправлень

### 5.1. Патерн міграції на TypeScript strict

```typescript
// Step 1: Identify nullable types
// BEFORE
function getUser(id: string) {
  return users.find((u) => u.id === id);
}

// AFTER
function getUser(id: string): User | undefined {
  return users.find((u) => u.id === id);
}

// Step 2: Add null checks
// BEFORE
const userName = getUser(id).name;

// AFTER
const user = getUser(id);
if (!user) throw new UserNotFoundError(id);
const userName = user.name;

// Step 3: Use optional chaining where appropriate
const userName = getUser(id)?.name ?? "Unknown";
```

### 5.2. Патерн safe-wrapper-а навколо localStorage

```typescript
// packages/shared/src/storage/safeStorage.ts
import { z } from "zod";

export function safeReadLS<T>(
  key: string,
  schema: z.ZodSchema<T>,
  fallback: T,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return schema.parse(parsed);
  } catch (error) {
    console.warn(`[storage] Failed to read ${key}:`, error);
    return fallback;
  }
}

export function safeWriteLS<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      // Handle quota exceeded
      cleanupOldEntries();
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
```

### 5.3. Патерн декомпозиції компонентів

```typescript
// BEFORE: Monolithic component
// ProfilePage.tsx (1060 LOC)
export function ProfilePage() {
  // 50 lines of hooks
  // 100 lines of handlers
  // 900 lines of JSX
}

// AFTER: Composed components
// ProfilePage.tsx (~150 LOC)
export function ProfilePage() {
  const { user, updateUser } = useProfileData();

  return (
    <div className="profile-page">
      <ProfileHeader user={user} />
      <ProfileStats user={user} />
      <ProfileSettings user={user} onUpdate={updateUser} />
      <ProfileDangerZone userId={user.id} />
    </div>
  );
}

// ProfileHeader.tsx (~120 LOC)
export function ProfileHeader({ user }: ProfileHeaderProps) {
  // Focused, single-responsibility component
}
```

---

## 6. Залежності та Порядок Виконання

```mermaid
graph TD
    A[Sprint 1.1: TS Strict] --> B[Sprint 2.2: Decompose Dashboard]
    A --> C[Sprint 2.3: Tests for Reports]

    D[Sprint 1.2: localStorage Batch 1] --> E[Sprint 2.1: localStorage Batch 2]
    E --> F[Sprint 3.1: localStorage Final]

    G[Sprint 1.3: Flaky Tests] --> H[Sprint 2.4: Mobile Boundary Tests]
    H --> I[Sprint 4.3: Mobile APM]

    J[Sprint 1.4: ProfilePage] --> B
    B --> K[Sprint 3.4: Large Files Batch 2]

    L[Sprint 3.2: Backend Dedupe] --> M[Sprint 4.1: Prompt Cache]

    N[Sprint 3.3: as unknown] --> A
```

**Критичний Шлях:**

1. TS Strict (1.1) — блокує якісні тести
2. localStorage (1.2 → 2.1 → 3.1) — послідовна міграція
3. Flaky Tests (1.3) — блокує mobile stability

---

## 7. Метрики Успіху

### 7.1. Критерії завершення Спринту 1

| Метрика                | Поточне | Ціль |
| ---------------------- | ------- | ---- |
| TS errors (apps/web)   | ~495    | 0    |
| localStorage allowlist | 52      | 42   |
| Flaky tests            | 2       | 0    |
| ProfilePage LOC        | 1060    | <200 |

### 7.2. Критерії завершення Спринту 2

| Метрика                  | Поточне | Ціль |
| ------------------------ | ------- | ---- |
| localStorage allowlist   | 42      | 22   |
| HubDashboard LOC         | 902     | <150 |
| HubReports test coverage | 0%      | 80%  |
| Capacitor boundary tests | 0       | 10+  |

### 7.3. Критерії завершення Спринту 3

| Метрика                | Поточне    | Ціль |
| ---------------------- | ---------- | ---- |
| localStorage allowlist | 22         | 0    |
| `as unknown` allowlist | 9          | 0    |
| Backend duplicate code | 4 patterns | 0    |
| Large files (>600 LOC) | 25         | 15   |

### 7.4. Метрики успіху Спринту 4+

| Метрика              | Поточне | Ціль       |
| -------------------- | ------- | ---------- |
| Bundle size          | 615 KB  | 550 KB     |
| LCP                  | ~2.5s   | <2.0s      |
| Sentry coverage      | 0%      | 100%       |
| Prompt cache savings | $0      | $50+/month |

---

## 8. Ризики та Мітігації

### 8.1. Ризики міграції TypeScript

| Ризик                       | Ймовірність | Вплив  | Мітігація                      |
| --------------------------- | ----------- | ------ | ------------------------------ |
| Breaking changes у runtime  | Medium      | High   | Extensive test coverage before |
| CI slowdown                 | Low         | Medium | Incremental adoption           |
| Developer productivity drop | Medium      | Medium | Phased rollout, training       |

### 8.2. Ризики міграції localStorage

| Ризик                      | Ймовірність | Вплив    | Мітігація                  |
| -------------------------- | ----------- | -------- | -------------------------- |
| Data loss during migration | Low         | Critical | Backup + migration scripts |
| Quota issues               | Medium      | Medium   | Cleanup utilities          |
| Breaking existing features | Medium      | High     | Feature flags              |

### 8.3. Ризики стабільності mobile

| Ризик                      | Ймовірність | Вплив  | Мітігація                |
| -------------------------- | ----------- | ------ | ------------------------ |
| New flaky tests            | Medium      | Low    | Retry logic + quarantine |
| Capacitor breaking changes | Low         | High   | Version pinning          |
| APM overhead               | Low         | Medium | Sampling configuration   |

---

## Додаток A: інвентар файлів для міграції

### Файли з localStorage (всього 52)

<details>
<summary>Click to expand full list</summary>

```
apps/web/src/core/
├── useOfflineQueue.ts
├── useCloudSync.ts
├── useTypedStore.ts
├── SettingsPage.tsx
├── OnboardingWizard.tsx
├── hub/HubDashboard.tsx
└── ...

apps/web/src/finyk/
├── useFinykCategories.ts
├── useFinykAccounts.ts
├── useFinykBudgets.ts
└── ...

apps/web/src/fizruk/
├── useFizrukProgress.ts
├── useFizrukTemplates.ts
├── useWorkoutHistory.ts
└── ...

apps/web/src/nutrition/
├── useNutritionHistory.ts
├── useFoodDatabase.ts
├── useMealPlans.ts
└── ...

apps/web/src/routine/
├── useRoutineReminders.ts
├── useHabitStreaks.ts
├── useRoutineCalendar.ts
└── ...
```

</details>

### Великі файли (>600 LOC)

<details>
<summary>Click to expand full list</summary>

| #   | File                   | LOC     | Priority        |
| --- | ---------------------- | ------- | --------------- |
| 1   | seedFoodsUk.ts         | 1614    | ✅ Done         |
| 2   | Assets.tsx             | 1147    | ✅ Done         |
| 3   | DesignShowcase.tsx     | 1064    | High            |
| 4   | ProfilePage.tsx        | 1060    | Sprint 1        |
| 5   | ActiveWorkoutPanel.tsx | 949     | Sprint 3        |
| 6   | seedDemoData.ts        | 907     | Low (data file) |
| 7   | HubDashboard.tsx       | 902     | Sprint 2        |
| 8   | Workouts.tsx           | 894     | Sprint 3        |
| 9   | HubChat.tsx            | ~800    | Sprint 3        |
| 10  | Overview.tsx           | ~750    | Sprint 3        |
| ... | (15 more files)        | 610-700 | Ongoing         |

</details>

---

## Додаток B: довідник команд

```bash
# TypeScript checking
pnpm typecheck                    # Full typecheck
pnpm --filter @sergeant/web typecheck  # Web only

# Testing
pnpm test                         # All tests
pnpm --filter @sergeant/mobile test    # Mobile only
pnpm test:coverage               # With coverage

# Linting
pnpm lint                        # All linting
pnpm lint:storage                # localStorage rules only

# Build
pnpm build                       # Full build
pnpm --filter @sergeant/web build     # Web only
```

---

**Документ готовий до виконання. При команді "почати" або "виконуй" — починаємо зі Sprint 1, Task 1.1 (TypeScript Strict Phase 4 — зняття `allowJs` та ввімкнення повного `strict: true`; фази 1–3.1 вже виконані).**
