# Sergeant — Комплексний Генеральний Аудит

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> **Дата аудиту:** 2026-04-28
> **Аудитор:** v0 AI Assistant
> **Скоуп:** Повний репозиторій `Skords-01/Sergeant`
> **Наступна ревалідація:** 2026-07-28
> **План реалізації:** [2026-04-28-implementation-roadmap.md](./2026-04-28-implementation-roadmap.md)

---

## Зміст

1. [Виконавчий підсумок](#1-executive-summary)
2. [Поточна Оцінка Системи](#2-поточна-оцінка-системи)
3. [Виявлені Недоліки та Зони Ризику](#3-виявлені-недоліки-та-зони-ризику)
4. [Структурований План Виправлень](#4-структурований-план-виправлень)
5. [Пріоритети та Терміни](#5-пріоритети-та-терміни)
6. [KPI та Метрики Успіху](#6-kpi-та-метрики-успіху)

---

## 1. Виконавчий підсумок

### 1.1. Загальна Оцінка

| Категорія                | Оцінка | Тренд                    |
| ------------------------ | ------ | ------------------------ |
| **Архітектура монорепи** | 8.5/10 | ↗ стабільна              |
| **Якість коду**          | 7.5/10 | ↗ покращується           |
| **Type Safety**          | 6.5/10 | ⚠️ потребує уваги        |
| **Тестове покриття**     | 7.0/10 | ↗ покращується           |
| **Безпека**              | 8.0/10 | ↗ сильна                 |
| **Документація**         | 9.0/10 | ✅ відмінна              |
| **CI/CD Pipeline**       | 8.5/10 | ✅ зріла                 |
| **Observability**        | 7.0/10 | ⚠️ потребує розвитку     |
| **Mobile Platform**      | 6.0/10 | ⚠️ потребує стабілізації |
| **Tech Debt**            | 6.5/10 | ⚠️ накопичується         |

**Загальний бал: 7.5/10** — Зріла платформа з сильними guardrails, але з накопиченим технічним боргом у кількох критичних зонах.

### 1.2. Ключові Сильні Сторони

1. **Формалізована архітектура** — 4 apps + 10 packages з чіткими межами
2. **Виняткова документація** — AGENTS.md, CONTRIBUTING.md, 23+ playbooks
3. **Custom ESLint plugin** — 10+ правил для domain-specific guardrails
4. **AI-інтеграція** — HubChat з 65 tools, prompt-cache ready
5. **Conventional Commits** — commitlint + husky enforcement

### 1.3. Критичні Зони для Покращення

1. **TypeScript strictness** — `apps/web` ще на `strict: false`
2. **localStorage migration** — 52 файли потребують міграції на safe wrappers
3. **Mobile platform** — 3 flaky tests, відсутність e2e coverage
4. **Observability gaps** — відсутність APM для mobile

---

## 2. Поточна Оцінка Системи

### 2.1. Архітектура Монорепи

```
sergeant/
├── apps/
│   ├── web/           # @sergeant/web — Vite + React 18 PWA (ACTIVE)
│   ├── server/        # @sergeant/server — Express + PostgreSQL (ACTIVE)
│   ├── mobile/        # @sergeant/mobile — Expo 52 + RN 0.76 (ACTIVE)
│   └── mobile-shell/  # @sergeant/mobile-shell — Capacitor wrapper (STABILIZE)
├── packages/
│   ├── shared/           # Zod schemas, types, utils (ACTIVE)
│   ├── api-client/       # Typed HTTP client (STABILIZE)
│   ├── design-tokens/    # Tailwind preset (STABILIZE)
│   ├── insights/         # Analytics engine (ACTIVE)
│   ├── config/           # Shared tsconfig/eslint (STABILIZE)
│   ├── finyk-domain/     # Finance logic (ACTIVE)
│   ├── fizruk-domain/    # Workout logic (ACTIVE)
│   ├── routine-domain/   # Habits logic (ACTIVE)
│   ├── nutrition-domain/ # Nutrition logic (ACTIVE)
│   └── eslint-plugin-sergeant-design/ # Custom rules (ACTIVE)
└── docs/                 # ADR, playbooks, tech-debt, design
```

**Оцінка: 8.5/10**

| ✅ Сильні сторони                  | ⚠️ Зони ризику                      |
| ---------------------------------- | ----------------------------------- |
| Чітка доменна ізоляція             | `mobile-shell` без test coverage    |
| Turborepo з правильним `dependsOn` | Cross-package type inference issues |
| Module ownership map в AGENTS.md   | Немає boundary tests для Capacitor  |

### 2.2. Стек Технологій

| Компонент    | Версія | Статус           |
| ------------ | ------ | ---------------- |
| Node.js      | 20.x   | ✅ LTS           |
| TypeScript   | 6.0.3  | ⚠️ Bleeding edge |
| React        | 18.x   | ✅ Stable        |
| Vite         | Latest | ✅ Stable        |
| Express      | 4.x    | ✅ Stable        |
| PostgreSQL   | 16     | ✅ Stable        |
| Better Auth  | Latest | ✅ Active        |
| Expo SDK     | 52     | ✅ Latest        |
| React Native | 0.76   | ✅ Latest        |
| Capacitor    | 7      | ✅ Latest        |

**Ризик:** TypeScript 6.0.3 — bleeding edge версія може викликати несумісності з tooling (vitest/eslint-typescript).

### 2.3. Якість Коду

#### Великі файли (>600 LOC)

```
25 файлів > 600 LOC
├── seedFoodsUk.ts (1614 LOC) — ✅ Split у PR #898
├── Assets.tsx (1147 LOC) — ✅ Decomposed у PR #887
├── HubChat.tsx (~800 LOC) — ⚠️ Потребує рефакторингу
├── Overview.tsx (~750 LOC) — ⚠️ Потребує рефакторингу
└── ... (21 інших файлів)
```

#### TODO/FIXME коментарі

```
10 файлів з TODO/FIXME
├── eslint.config.js (1)
├── apps/mobile/* (8)
└── apps/server/* (1)
```

### 2.4. Type Safety

| Пакет         | strict       | strictNullChecks | noImplicitAny |
| ------------- | ------------ | ---------------- | ------------- |
| `apps/server` | ✅ true      | ✅               | ✅            |
| `apps/web`    | ❌ false     | ❌               | ❌            |
| `apps/mobile` | ⚠️ partial   | ⚠️               | ⚠️            |
| `packages/*`  | ✅ inherited | ✅               | ✅            |

**Критичний недолік:** `apps/web/tsconfig.json` явно перевизначає `strict: false`, що дозволяє type-unsafe код у найбільшій частині codebase.

### 2.5. Тестове Покриття

| App/Package         | Unit Tests      | Integration       | E2E           | Coverage |
| ------------------- | --------------- | ----------------- | ------------- | -------- |
| `apps/web`          | ✅ Vitest+RTL   | ✅ MSW            | ✅ Playwright | ~65%     |
| `apps/server`       | ✅ Vitest       | ✅ Testcontainers | ⚠️ smoke only | ~70%     |
| `apps/mobile`       | ⚠️ Jest (flaky) | ❌                | ⚠️ Detox      | ~45%     |
| `apps/mobile-shell` | ❌ none         | ❌                | ❌            | 0%       |
| `packages/*`        | ✅ Vitest       | ✅                | N/A           | ~80%     |

**Flaky Tests (known):**

1. `apps/mobile/src/core/dashboard/WeeklyDigestFooter.test.tsx`
2. `apps/mobile/src/core/settings/HubSettingsPage.test.tsx`

### 2.6. CI/CD Pipeline

```yaml
Workflows:
├── ci.yml (push/PR)
│   ├── commitlint      # Conventional commits enforcement
│   ├── check           # lint + typecheck + test + build + audit
│   ├── coverage        # Test coverage artifacts
│   ├── a11y            # Playwright + axe-core
│   └── smoke-e2e       # Real Postgres + Playwright
├── nightly-audit.yml   # Security scanning
├── security-sla-reminder.yml
└── posthog-release-annotation.yml
```

**Performance Budgets:**

- JS total (brotli): ≤ 615 kB ✅
- CSS (brotli): ≤ 18 kB ✅

### 2.7. Безпека

| Аспект            | Статус                   | Деталі                              |
| ----------------- | ------------------------ | ----------------------------------- |
| `pnpm audit`      | ✅ Blocking (high+)      | PR-9.A merged                       |
| gitleaks          | ✅ SHA-pinned            | PR-9.B merged                       |
| Vulnerability SLA | ✅ Defined               | PR-9.C merged                       |
| Audit exceptions  | ✅ Documented            | `docs/security/audit-exceptions.md` |
| Session security  | ✅ HTTP-only cookies     | Better Auth                         |
| SQL injection     | ✅ Parameterized queries | pg driver                           |

### 2.8. Observability

| Рівень             | Покриття                 | Деталі                   |
| ------------------ | ------------------------ | ------------------------ |
| Server metrics     | ✅ Prometheus `/metrics` | PR-8.B                   |
| Frontend analytics | ⚠️ PostHog basic         | Release annotations only |
| Mobile APM         | ❌ None                  | Critical gap             |
| Error tracking     | ⚠️ Console logs          | No Sentry integration    |
| Tracing            | ❌ None                  | No distributed tracing   |

---

## 3. Виявлені Недоліки та Зони Ризику

### 3.1. Критичні (P0) — Блокують Production Quality

| ID       | Недолік                           | Вплив                              | Поточний стан              |
| -------- | --------------------------------- | ---------------------------------- | -------------------------- |
| **P0-1** | `apps/web` strict: false          | Type errors проходять CI           | 52 файли з unsafe patterns |
| **P0-2** | localStorage migration incomplete | Quota errors, sync race conditions | 52 файли в allowlist       |
| **P0-3** | Mobile flaky tests                | CI unreliable                      | 2 tests на main            |
| **P0-4** | No mobile APM                     | Production blindness               | Zero observability         |

### 3.2. Високі (P1) — Значний Tech Debt

| ID       | Недолік                    | Вплив                       | Рекомендація              |
| -------- | -------------------------- | --------------------------- | ------------------------- |
| **P1-1** | Великі файли (>600 LOC)    | Maintainability             | Decompose поступово       |
| **P1-2** | TypeScript 6.0.3           | Tooling instability         | Monitor + document issues |
| **P1-3** | Capacitor без tests        | Breaking changes undetected | Add boundary tests        |
| **P1-4** | Prompt cache not activated | $$$ waste                   | Enable per AGENTS.md      |
| **P1-5** | No distributed tracing     | Debug complexity            | Add OpenTelemetry         |

### 3.3. Середні (P2) — Покращення DX

| ID       | Недолік                            | Вплив               | Рекомендація                      |
| -------- | ---------------------------------- | ------------------- | --------------------------------- |
| **P2-1** | 10 TODO/FIXME comments             | Unclear ownership   | Triage + create issues            |
| **P2-2** | No Sentry integration              | Error context loss  | Add Sentry SDK                    |
| **P2-3** | Mobile debt tracker missing        | Hidden accumulation | Create `docs/tech-debt/mobile.md` |
| **P2-4** | Decision-tree playbooks incomplete | Onboarding friction | Complete top-5                    |

### 3.4. Низькі (P3) — Nice-to-Have

| ID       | Недолік                    | Вплив            | Рекомендація             |
| -------- | -------------------------- | ---------------- | ------------------------ |
| **P3-1** | No visual regression tests | UI drift         | Add Chromatic/Percy      |
| **P3-2** | Manual release notes       | Process overhead | Automate with changesets |
| **P3-3** | No PR size limits          | Review fatigue   | Add probot/pr-size       |

---

## 4. Структурований План Виправлень

### Етап 1: Стабілізація (Тиждень 1-2)

**Мета:** Усунути критичні блокери та стабілізувати CI

#### 4.1.1. Type Safety Web App (P0-1)

```diff
# apps/web/tsconfig.json
{
  "compilerOptions": {
-   "strict": false,
-   "allowJs": true,
-   "checkJs": false
+   "strict": true,
+   "strictNullChecks": true,
+   "noImplicitAny": true
  }
}
```

**План впровадження:**

1. **Phase 1 (Day 1-3):** Enable `strictNullChecks` only
   - Run `pnpm typecheck`, collect errors
   - Fix errors in `apps/web/src/shared/**` (вже done: PR #870)
   - Batch fix remaining by module priority

2. **Phase 2 (Day 4-7):** Enable `noImplicitAny`
   - Focus on `apps/web/src/core/**`
   - Add explicit types to function parameters

3. **Phase 3 (Day 8-14):** Enable full `strict: true`
   - Final cleanup of edge cases
   - Update CI strict-coverage metric

**Метрики:**

- TypeScript errors: 0 → target
- Strict-covered files: 65% → 100%

#### 4.1.2. Mobile Flaky Tests (P0-3)

**Файли для фіксу:**

1. `apps/mobile/src/core/dashboard/WeeklyDigestFooter.test.tsx`
2. `apps/mobile/src/core/settings/HubSettingsPage.test.tsx`

**Підхід:**

```typescript
// Pattern from OnboardingWizard fix (commit 53853e00)
// Replace:
jest.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(), // Never resolves
  },
}));

// With:
jest.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
  },
}));
```

**Очікуваний результат:** 0 flaky tests на main

#### 4.1.3. localStorage Migration (P0-2)

**Поточний стан:** 52 файли в ESLint allowlist

**План міграції по модулях:**
| Модуль | Файлів | Пріоритет | Wrapper |
|--------|--------|-----------|---------|
| `core/onboarding/*` | 8 | High | `createModuleStorage` |
| `core/insights/*` | 4 | High | `useLocalStorageState` |
| `core/hub/*` | 5 | High | `createModuleStorage` |
| `modules/finyk/*` | 6 | Medium | `finykStorage` |
| `modules/fizruk/*` | 8 | Medium | `createModuleStorage` |
| `modules/nutrition/*` | 4 | Medium | `createModuleStorage` |
| `modules/routine/*` | 2 | Low | `createModuleStorage` |
| Інші | 15 | Low | case-by-case |

**Приклад міграції:**

```typescript
// Before (unsafe):
const saved = localStorage.getItem("onboarding_step");
const step = saved ? JSON.parse(saved) : 0;

// After (safe):
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
const [step, setStep] = useLocalStorageState("onboarding_step", 0);
```

### Етап 2: Покращення Observability (Тиждень 3-4)

#### 4.2.1. Mobile APM (P0-4)

**Рекомендований стек:**

- **Sentry React Native SDK** — crash reporting + performance
- **PostHog RN SDK** — analytics + feature flags

**Імплементація:**

```typescript
// apps/mobile/src/lib/sentry.ts
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? "development" : "production",
  tracesSampleRate: 0.2,
  integrations: [Sentry.reactNativeTracingIntegration()],
});

export { Sentry };
```

**Метрики:**

- Crash-free sessions: baseline → 99.5%
- P95 app start time: measure → optimize

#### 4.2.2. Distributed Tracing (P1-5)

**Рекомендований стек:**

- **OpenTelemetry** — vendor-agnostic
- **Export to:** Grafana Tempo (free tier) або Jaeger

**Імплементація:**

```typescript
// apps/server/src/lib/tracing.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

### Етап 3: Рефакторинг Коду (Тиждень 5-8)

#### 4.3.1. Великі Файли Decomposition

| Файл                     | LOC  | План                                                        |
| ------------------------ | ---- | ----------------------------------------------------------- |
| `HubChat.tsx`            | ~800 | Split: `HubChatInput`, `HubChatMessages`, `HubChatToolCard` |
| `Overview.tsx` (Finyk)   | ~750 | Extract: `AccountsPanel`, `SpendingChart`, `BudgetSummary`  |
| `Dashboard.tsx` (Fizruk) | ~650 | Extract: `WorkoutSummary`, `ProgressChart`                  |

**Checklist для кожного split:**

- [ ] Identify cohesive units (by responsibility)
- [ ] Extract to separate file
- [ ] Update imports
- [ ] Add unit tests for extracted component
- [ ] Verify no regression in parent

#### 4.3.2. Capacitor Boundary Tests (P1-3)

```typescript
// apps/mobile-shell/src/__tests__/webBridge.test.ts
import { Capacitor } from "@capacitor/core";

describe("Web-Native Bridge", () => {
  it("should detect native platform", () => {
    expect(Capacitor.isNativePlatform()).toBe(true);
  });

  it("should handle deep links", async () => {
    const result = await AppUrlListener.addListener("appUrlOpen", callback);
    expect(result).toBeDefined();
  });

  it("should access secure storage", async () => {
    const { SecureStoragePlugin } =
      await import("@nickvdh/capacitor-secure-storage-plugin");
    await SecureStoragePlugin.set({ key: "test", value: "value" });
    const { value } = await SecureStoragePlugin.get({ key: "test" });
    expect(value).toBe("value");
  });
});
```

### Етап 4: Prompt Cache Activation (Тиждень 9-10)

#### 4.4.1. Enable Anthropic Prompt Caching (P1-4)

**Поточний стан:** `SYSTEM_PREFIX` готовий до кешування (AGENTS.md)

**Імплементація:**

```typescript
// apps/server/src/modules/chat/chat.ts
const systemMessages = [
  {
    type: "text",
    text: SYSTEM_PREFIX,
    cache_control: { type: "ephemeral" }, // Enable caching
  },
  {
    type: "text",
    text: context, // Dynamic per-user context (not cached)
  },
];
```

**Очікувана економія:**

- Cache hit rate: 0% → ~70-80%
- Cost reduction: ~40-50% на Anthropic bills

**Monitoring:**

```typescript
// Track cache metrics (already prepared in PR #864)
const cacheMetrics = {
  cache_creation_input_tokens: response.usage?.cache_creation_input_tokens,
  cache_read_input_tokens: response.usage?.cache_read_input_tokens,
};
logger.info("anthropic_cache_metrics", cacheMetrics);
```

---

## 5. Пріоритети та Терміни

### Матриця Пріоритетів

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │  P0-1 TypeScript  │  P1-4 Prompt Cache│
    │  P0-2 localStorage│                   │
    │  P0-4 Mobile APM  │                   │
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT│                   │                   │ EFFORT
    │  P0-3 Flaky Tests │  P1-5 Tracing     │
    │  P2-3 Mobile Debt │  P1-1 Large Files │
    │                   │  P1-3 Capacitor   │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                   LOW IMPACT
```

### Детальний Timeline

```
Week 1-2: СТАБІЛІЗАЦІЯ
├── Day 1-3:  P0-3 Fix flaky mobile tests
├── Day 4-7:  P0-1 Phase 1 (strictNullChecks)
├── Day 8-10: P0-2 localStorage migration (core/*)
└── Day 11-14: P0-1 Phase 2 (noImplicitAny)

Week 3-4: OBSERVABILITY
├── Day 15-18: P0-4 Sentry React Native setup
├── Day 19-21: P0-4 PostHog RN integration
├── Day 22-24: P2-2 Sentry Web/Server integration
└── Day 25-28: P1-5 OpenTelemetry basic setup

Week 5-8: REFACTORING
├── Week 5: HubChat.tsx decomposition
├── Week 6: Finyk Overview.tsx decomposition
├── Week 7: P0-2 localStorage migration (modules/*)
└── Week 8: P1-3 Capacitor boundary tests

Week 9-10: OPTIMIZATION
├── Day 57-60: P1-4 Prompt cache activation
├── Day 61-64: P1-4 Cache metrics dashboard
├── Day 65-68: Final P0-1 strict: true rollout
└── Day 69-70: Documentation update

BUFFER: Week 11-12
└── Contingency for blockers, regression fixes
```

### Ресурси

| Етап          | Зусилля (люд.-дні) | Ризик  | Dependencies        |
| ------------- | ------------------ | ------ | ------------------- |
| Стабілізація  | 14                 | Medium | None                |
| Observability | 14                 | Low    | Sentry account      |
| Refactoring   | 28                 | High   | Code freeze windows |
| Optimization  | 10                 | Low    | Anthropic cache API |
| **Total**     | **66**             | —      | —                   |

---

## 6. KPI та метрики успіху

### 6.1. Технічні Метрики

| Метрика                      | Baseline | Target | Deadline |
| ---------------------------- | -------- | ------ | -------- |
| TypeScript strict coverage   | 65%      | 100%   | Week 10  |
| localStorage allowlist files | 52       | 0      | Week 8   |
| Flaky tests on main          | 2        | 0      | Week 2   |
| Mobile crash-free sessions   | N/A      | 99.5%  | Week 4   |
| Prompt cache hit rate        | 0%       | 70%+   | Week 10  |
| Files > 600 LOC              | 25       | 15     | Week 8   |

### 6.2. Процесні метрики

| Метрика                 | Baseline | Target  | Deadline |
| ----------------------- | -------- | ------- | -------- |
| CI pipeline p95         | ~8 min   | < 6 min | Week 12  |
| PR review time p50      | N/A      | < 24h   | Ongoing  |
| Tech debt items closed  | 30/31    | 31/31   | Week 10  |
| Documentation freshness | 90%      | 100%    | Week 12  |

### 6.3. Бізнес-метрики

| Метрика                   | Baseline | Target   | Impact         |
| ------------------------- | -------- | -------- | -------------- |
| Anthropic monthly cost    | $X       | $X × 0.5 | Prompt caching |
| Production incidents      | N/A      | Measure  | Observability  |
| Developer onboarding time | N/A      | < 1 day  | Documentation  |

---

## Додаток A: Чек-лист для review

### Перед кожним PR:

- [ ] Зміни не вводять нові файли в ESLint allowlist
- [ ] Якщо додано новий пакет — оновлено `apps-status-matrix.md`
- [ ] Якщо змінено API — оновлено `packages/api-client`
- [ ] Якщо додано HubChat tool — оновлено `SYSTEM_PREFIX`
- [ ] Commit message відповідає Conventional Commits
- [ ] Немає нових `@ts-expect-error` без justification

### Квартальний review:

- [ ] Всі `AI-LEGACY: expires` маркери перевірено
- [ ] Performance budgets актуальні
- [ ] Security audit exceptions reviewed
- [ ] Tech debt документи оновлено
- [ ] AGENTS.md validated

---

## Додаток B: Корисні команди

```bash
# Type safety metrics
pnpm strict:coverage

# Find large files
find apps packages -name "*.tsx" -o -name "*.ts" | xargs wc -l | sort -rn | head -30

# Check localStorage allowlist
grep -A 100 "no-raw-local-storage" eslint.config.js | grep "apps/web"

# Run specific module tests
pnpm --filter @sergeant/web exec vitest run src/core/

# Check prompt cache metrics
grep "anthropic_cache_metrics" apps/server/logs/*.log

# Audit security
pnpm audit --audit-level=high
```

---

**Автор:** v0 AI Assistant
**Ревьюери:** @Skords-01
**Статус:** Draft → Pending Review
