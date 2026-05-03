# ADR-0008: Feature flags — client-only registry over typedStore

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/web/src/core/lib/featureFlags.ts`](../../apps/web/src/core/lib/featureFlags.ts) — реєстр + API (`getFlag` / `setFlag` / `useFlag`).
  - [`apps/web/src/shared/lib/storage/typedStore.ts`](../../apps/web/src/shared/lib/storage/typedStore.ts) — нижній шар сховища (LS-backed, Zod-validated, sync-між-табами).
  - [`docs/playbooks/add-feature-flag.md`](../playbooks/add-feature-flag.md) — операційний how-to.
  - [`docs/playbooks/cleanup-dead-code.md`](../playbooks/cleanup-dead-code.md) — гартування flag-у при graduating.

---

## 0. TL;DR

Feature-flags у Sergeant — **client-only**, без мережевого шару. Реєстр живе у `apps/web/src/core/lib/featureFlags.ts` як читай-онлі масив `FlagDefinition[]`. Сховище — `typedStore({ key: "hub_flags_v1" })` поверх localStorage із Zod-валідацією і автоматичним sync-ом між tab-ами через `storage` event. API: `getFlag(id)`, `setFlag(id, val)`, `useFlag(id)`, `resetFlags()`. Експериментальні флаги (`experimental: true`) показуються в Settings → "Експериментальне".

| Поле                    | Призначення                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `id`                    | snake*case з префіксом модуля (`finyk*\_`, `hub\_\_`); один flag — один id. |
| `label` / `description` | Українською, видимі юзеру в Settings.                                       |
| `defaultValue: boolean` | Без user override — повертається `useFlag()`.                               |
| `experimental?: true`   | Показати в розділі «Експериментальне» з ярликом _beta_.                     |

```ts
export const FLAG_REGISTRY: readonly FlagDefinition[] = [
  {
    id: "hub_command_palette",
    label: "...",
    description: "...",
    defaultValue: false,
    experimental: true,
  },
  { id: "mono_webhook", label: "...", description: "...", defaultValue: true },
] as const;
```

Серверних flag-ів на цій фазі немає. Якщо знадобляться — окремий ADR (live override via `/api/flags`).

---

## ADR-8.1 — Чому client-only, а не сервер-керовано

### Status

accepted.

### Context

Дві категорії flag-use-cases у Sergeant:

1. **Експерименти UI/UX.** «Show command palette to users that opted-in via Settings.» «Use new ManualExpenseSheet category.» Це зміни клієнтської behavior, які потрібні **per-device**, не per-user. Юзер у браузері може ввімкнути command-palette, у мобільному PWA — лишити вимкненим.
2. **Server-side rollout.** «Increase prompt-cache TTL з 5 до 60 хв.» «Use new search index for nutrition.» Це не feature flag, це **config**. Деплоїться через env-var на Railway (`PROMPT_CACHE_TTL_MIN=60`), не через клієнтський toggle.

Тобто всі flag-and-toggle-cases, які реально виникали — клієнтські. Серверних бінарних toggle-ів, які потрібно змінювати без redeploy-у і без пере-логіну юзера, поки нема (моностак Railway → redeploy секунди, не години).

### Decision

**Феча-флаги — клієнтські.** Реалізація в `apps/web/src/core/lib/featureFlags.ts`:

- **Реєстр-as-data:** `FLAG_REGISTRY: readonly FlagDefinition[]`. Додавання/видалення флагу — TS-зміна, не SDK-сервіс.
- **Сховище:** `createTypedStore({ key: "hub_flags_v1", version: 1, schema: z.record(z.string(), z.boolean()), defaultValue: {} })`. typedStore обгортає localStorage із:
  - Zod-валідацією (битий JSON у LS не падає в runtime — повертає defaultValue).
  - Версією схеми (для future migrations: `version: 2 + migrate(v1 → v2)`).
  - Pub/sub між tab-ами через `window.addEventListener("storage", ...)`.
- **API:**
  - `getFlag(id): boolean` — синхронне читання, fallback на `defaultValue`.
  - `setFlag(id, value): boolean` — write-through у LS + emit subscriber-ам.
  - `useFlag(id)` — `useSyncExternalStore` wrapper, реактивне читання у React-компонентах. Стабільний для concurrent-rendering (snapshot повертається від кешованого `getSnapshot`, інакше React попереджає про невідповідність).
  - `resetFlags()` — для test cleanup (`afterEach(() => resetFlags())`).

- **Експериментальні** — лише ті, що мають `experimental: true`. Settings-UI показує їх у окремій секції з beta-ярликом + warning-текстом.

### Consequences

**Позитивні:**

- 0 мережевих залежностей: працює offline, у анонімному режимі, до login-у. Жодного запиту не блокує initial render.
- Тестування тривіальне: `setFlag(id, true) → render → assert; resetFlags() в afterEach`.
- Sync між табами «з коробки» через `storage` event у typedStore.
- Cleanup при graduating — звичайне видалення FLAG_REGISTRY entry + grep по `getFlag/useFlag` (playbook `cleanup-dead-code.md`).

**Негативні:**

- Не можна **примусово** вимкнути експеримент у поточних юзерів без deploy-у. Якщо knowing-issue в продакшні — треба випустити патч, що знімає `experimental: true` чи перевизначає `defaultValue`. Acceptable trade-off для current scale (sub-1k DAU).
- A/B тестування за %-ом аудиторії неможливе без сервера (немає `bucketing(userId)` без сервер-side seed-у). Поки не на той phase — у roadmap після growing user-base.

### Alternatives considered

1. **PostHog / GrowthBook / LaunchDarkly.** Зовнішній SDK з мережевою evaluation, A/B-segments, %-rollout. Відхилено: $$$ (LaunchDarkly), додатковий vendor (GDPR-data flow), мережа → flicker initial render. Повернемося до цього після PostHog roll-out (PR #13 у roadmap → ⏳pending).
2. **Server-side flags за `/api/flags?ids=…`.** Технічно тривіально (один SQL-table), але **жоден поточний use-case цього не вимагає** (див. Context). Не будуємо інфру передчасно.
3. **Vercel Flags SDK (як натхнення взяли).** Хороша API-форма, але зайва залежність на boundary. У нас стиль такий же (`useFlag(id)`), без SDK.

---

## ADR-8.2 — Чому реєстр-as-array, а не string-based dynamic

### Status

accepted.

### Context

Альтернатива `FLAG_REGISTRY` — динамічно-string-key API:

```ts
getFlag("any_random_string"); // повертає false, бо нема в LS — без помилок
```

З першого погляду — гнучкіше. Реальність: ламає cleanup, ламає типи, ламає Settings-UI.

### Decision

**Кожен flag має explicit-entry у `FLAG_REGISTRY`.** Python-style "ducktyping" не вітається. Конкретно:

- `FlagId = (typeof FLAG_REGISTRY)[number]["id"]` — TS-літерал-тип. Викликаючи `getFlag("typo_in_id")`, TS не зловить (бо `getFlag(id: FlagId | string)`), але в runtime отримаєш `false` + warning у логах. Це consensus від ревʼю — fully-strict `id: FlagId only` ламав би legacy-strings у тестах.
- `getFlagDefinition(id)` — джерело істини для Settings-UI. Без entry в реєстрі — flag не з'являється у Settings, юзер не може його ввімкнути.
- При видаленні fla-у з реєстру (graduated → продакшн без override): значення лишається в LS поточних юзерів, але `getFlag(id)` повертає `defaultValue` (оскільки `getFlagDefinition(id)` → undefined → return false). LS-cleanup не потрібний — typedStore просто ігнорує неіснуючі ключі.

### Consequences

**Позитивні:**

- Реєстр — single source of truth. Cleanup тривіальний: видалив entry + grep по callsites.
- Settings-UI — це rendering `FLAG_REGISTRY.map(...)`, не SDK-fetch.
- TS-літеральні типи — autocomplete у IDE.

**Негативні:**

- При додаванні flag-у потрібен PR. Не можна toggle-ити без deploy-у. Це фіча, а не баг — кожен expеримент має review-trail.

### Alternatives considered

— **Reflection через `localStorage.keys()`.** Працює для diagnostic-tooling, але не для Settings-UI (порядок неконтрольований, locale-string-и — не з LS-ключа).

---

## ADR-8.3 — Лайфцикл flag-у: `experimental → graduated → removed`

### Status

accepted.

### Context

Без guardrail-ів flag-и накопичуються. Через рік маєш 50 entrі-в, з яких 30 — graduated-але-нечеплени, 5 — orphaned (юзери є, але код перестав читати), і ніхто не пам'ятає чому `mono_webhook` все ще `experimental: true`.

### Decision

**Лайфцикл явно описаний у playbook `add-feature-flag.md`:**

1. **Створення.** Новий flag → `defaultValue: false`, `experimental: true`. PR має містити `Expires: YYYY-MM-DD` у `docs/feature-flags.md` (або в PR-description) — дата, до якої flag має graduate-нути або бути видалений.
2. **Rollout-моніторинг.** Якщо flag вмикає server-call (наприклад, `mono_webhook`), додай метрику `feature_flag_enabled_total{flag, value}` у Pino-лог — для подальшого product-аналізу частоти увімкнення (PostHog-replacement, поки PostHog не інтегровано).
3. **Graduation.** Коли експеримент стабільний:
   - Якщо feature просто стає default-on → `defaultValue: true`, `experimental` зняти. Flag живе ще ~1 sprint як kill-switch.
   - Якщо feature стає **always-on** → видалити entry + всі call-sites через playbook `cleanup-dead-code.md` (codemod `pnpm exec jscodeshift … --transform=remove-flag.cjs --flag=foo` + ручна перевірка).
4. **Killswitch.** При production-incident-і — переводимо `defaultValue: false` через hot-fix, повідомляємо юзерам, що зараз їх toggle-ів зважено. Це не cancel юзерських override-ів (LS на їхньому пристрої), але новий код повертається до safe-default.

### Consequences

**Позитивні:**

- Дата `Expires` змушує review раз на N тижнів — flag-и не накопичуються до 50.
- Cleanup-playbook робить graduation-PR детермінованим.
- Killswitch — реальна ручка для incident-response, не теоретична.

**Негативні:**

- `Expires`-дата — best-effort; не enforced автоматично. Можна додати CI-job, що фейлить, якщо у `docs/feature-flags.md` є entrі з минулою датою — поки не зробили (low ROI; з 3 поточних flag-ів усі under control).

### Alternatives considered

— **`expiresAt: Date` поле у `FlagDefinition` + runtime warning у dev mode.** Працює, але потребує доступу до годинника на клієнті (часозмінний чи timezone-залежний). Прийняли markdown-табличку як простіше.

---

## Implementation status

- ✅ `featureFlags.ts` (~250 LOC) — реєстр + API + хуки.
- ✅ `typedStore.ts` — нижній шар із Zod-валідацією, LS-backed, sync між табами.
- ✅ Тести: `featureFlags.test.ts` (флаги), `typedStore.test.ts` (LS sync, validation).
- ✅ Settings-UI рендерить `experimental: true`-flag-и в окремій секції.
- ✅ Playbook `add-feature-flag.md` — крок-за-кроком з чек-лістом верифікації.
- ⏳ `docs/feature-flags.md` як централізована таблиця (Owner / Default / Expires / Rollout) — поки писалося ad-hoc у PR-описах.

## Open questions

- **PostHog інтеграція** (PR #13 з roadmap) додасть аналітику використання flag-ів автоматично (event `flag_enabled`/`flag_disabled` per user). Перепишемо ADR-8.3 з PostHog-метриками тоді.
- **Mobile (`apps/mobile/**`).** MMKV-store-варіант реєстру на NativeWind-stack — порт `featureFlags.ts`на MMKV-backed`typedStore`. У черзі після стабілізації mobile тестового стеку (3 flaky tests залишилось — `apps/mobile/src/core/\*\*`).
- **Server flags.** Якщо stand-up A/B test-у потребує сервер-keroоване rollout — окремий ADR (table `feature_flags`, GET `/api/flags?userId=…`, race-condition-safe write через GitOps або admin-endpoint).
