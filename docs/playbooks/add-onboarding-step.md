# Playbook: Add Onboarding Step

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** «Додай новий крок в онбординг» / зміна послідовності перших кроків нового юзера / новий FTUX-етап.

---

## Контекст

Onboarding wizard є двох видів:

- **Web** — `apps/web/src/core/onboarding/OnboardingWizard.tsx` (production, стабільний).
- **Mobile** — `apps/mobile/src/core/OnboardingWizard.tsx` (v2, **з 3 known flaky тестами** — див. AGENTS.md).

Послідовність кроків — single source of truth у `packages/shared/src/lib/onboarding.ts`:

```ts
export type OnboardingStepId = "welcome" | "modules" | "goals";
export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [...];
```

Обидва wizard-и читають цей масив; додавання кроку = змінити масив + додати UI-блок у обох wizard-ах.

**Обережно:** уже-онбоджені юзери мають `markOnboardingDone()` у localStorage/MMKV. Новий крок для них **не з'явиться** — це by design (не хочемо повторно мучити). Якщо крок настільки важливий, що треба показати всім — окрема логіка через `shouldShowOnboarding()` override, обговорити окремо.

---

## Steps

### 1. Оновити enum + ORDER

Додай `id` у `packages/shared/src/lib/onboarding.ts`:

```ts
export type OnboardingStepId =
  | "welcome"
  | "modules"
  | "goals"
  | "your_new_step"; // ➕

export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [
  "welcome",
  "modules",
  "goals",
  "your_new_step", // ➕ додай у потрібну позицію
] as const;
```

Тест `onboarding.test.ts` зразу впаде — це нормально, оновлюй очікувану довжину/порядок:

```ts
expect(ONBOARDING_STEPS).toHaveLength(4);
expect(ONBOARDING_STEPS).toEqual([
  "welcome",
  "modules",
  "goals",
  "your_new_step",
]);
```

### 2. Локалізація / описи

Якщо крок має заголовок, підзаголовок чи іконку — додай поля у відповідні мапи в `packages/shared/src/lib/onboarding.ts`:

```ts
// якщо потрібен опис
export const ONBOARDING_STEP_DESCRIPTIONS: Record<OnboardingStepId, string> = {
  welcome: "...",
  modules: "...",
  goals: "...",
  your_new_step: "Дозволь сповіщення, щоб не пропустити брифінги.",
};
```

### 3. Web wizard

`apps/web/src/core/onboarding/OnboardingWizard.tsx` — додай case у render-функцію step body:

```tsx
{
  state.step === "your_new_step" && (
    <YourNewStepView
      onContinue={() => dispatch({ type: "NEXT" })}
      onBack={() => dispatch({ type: "BACK" })}
    />
  );
}
```

State уже керується через `wizardReducer` — `NEXT`/`BACK` працюють із новою позицією автоматично, не треба їх чіпати.

### 4. Mobile wizard

`apps/mobile/src/core/OnboardingWizard.tsx` — той самий патерн, але з NativeWind замість Tailwind і `Pressable` замість `<button>`:

```tsx
{
  state.step === "your_new_step" && (
    <View className="flex-1 px-6 py-8">
      <Text className="text-2xl font-bold mb-4">Заголовок</Text>
      {/* ... */}
      <Pressable onPress={() => dispatch({ type: "NEXT" })}>
        <Text>Далі</Text>
      </Pressable>
    </View>
  );
}
```

**Не** копіюй DOM-API (`localStorage`, `window`) у mobile — використовуй MMKV adapter через `@sergeant/shared/lib/kvStore`.

### 5. Persistence (якщо крок збирає дані)

Якщо новий крок збирає юзерські відповіді (наприклад, дозволи, преференції) — пиши через `saveVibePicks` / `saveOnboardingGoals` patterns:

```ts
// packages/shared/src/lib/onboardingNotifications.ts (новий файл)
import { saveKv, readKv } from "./kvStore";

const KEY = "onboarding_notifications_v1";

export interface NotifPrefs {
  morning: boolean;
  weekly: boolean;
}

export function saveNotifPrefs(prefs: NotifPrefs): void {
  saveKv(KEY, prefs);
}

export function readNotifPrefs(): NotifPrefs | null {
  return readKv<NotifPrefs>(KEY);
}
```

`kvStore` дає однаковий API на web (localStorage) і mobile (MMKV) — один файл працює всюди.

### 6. Тести

Web:

```bash
pnpm --filter @sergeant/web exec vitest run src/core/OnboardingWizard.test.tsx
```

Shared:

```bash
pnpm --filter @sergeant/shared exec vitest run src/lib/onboarding.test.ts
```

Mobile:

```bash
pnpm --filter @sergeant/mobile exec vitest run src/core/OnboardingWizard.test.tsx
```

**Mobile-тест уже flaky** (AGENTS.md). Якщо він **став падати по-новому** після твоїх змін — це регресія, треба фіксити, **не списуй на flaky**. Якщо падає тим самим способом, як до твоїх змін, — ОК.

### 7. Аналітика

`OnboardingWizard.tsx` емітить `ANALYTICS_EVENTS.onboarding_step_*`. Перевір, що твій новий step_id з'являється в подіях. Якщо потрібен новий event для дії всередині кроку (наприклад, `notif_permission_granted`) — додай у `apps/web/src/core/observability/analytics.ts` constants.

### 8. PR

Branch: `devin/<unix-ts>-feat-onboarding-<step-id>`. Commit:

```
feat(shared): add `<step_id>` onboarding step

- ONBOARDING_STEPS extended (test updated)
- web + mobile wizard render the new step
- new kvStore-backed prefs helper (if applicable)
- analytics events for step view + completion
```

---

## Verification

- [ ] `OnboardingStepId` + `ONBOARDING_STEPS` оновлено в `packages/shared/src/lib/onboarding.ts`.
- [ ] `onboarding.test.ts` оновлено та проходить.
- [ ] Web `OnboardingWizard.tsx` має render для нового step.
- [ ] Mobile `OnboardingWizard.tsx` має render для нового step (NativeWind, без DOM).
- [ ] Persistence (якщо є) — через `kvStore`, не пряме `localStorage`/MMKV.
- [ ] Аналітика подій (`onboarding_step_*`) працює для нового step_id.
- [ ] `pnpm lint` + `pnpm typecheck` — green.
- [ ] Mobile flaky тест: не зламано **по-новому** (ті ж failures, що до змін, — ОК).

## Notes

- **Юзери, які вже завершили onboarding, новий крок не побачать.** Це навмисно. Якщо потрібен «catch-up flow» — це окрема фіча, не сюди.
- **Не зміщуй порядок існуючих кроків** без сильної причини: для in-progress юзерів їх збережений `state.step` буде раптово вказувати на інший крок.
- **A/B тестування кроків** — через `featureFlags.ts`, не паралельні енумерації. Прапорець вмикає/вимикає присутність step-у у `ONBOARDING_STEPS`.

## See also

- [add-feature-flag.md](add-feature-flag.md) — якщо новий крок під A/B
- [migrate-localstorage-to-typedstore.md](migrate-localstorage-to-typedstore.md) — для KV persistence патернів
- `packages/shared/src/lib/onboarding.ts` — single source of truth
- [AGENTS.md](../../AGENTS.md) — flaky-tests список (mobile OnboardingWizard)
