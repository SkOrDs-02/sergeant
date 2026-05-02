# Генеральний аудит дизайну, UI/UX та користувацького досвіду

> **Last validated:** 2026-05-02 by @Codex. **Next review:** 2026-07-31.
> **Status:** Active

**Продукт:** Sergeant  
**Дата аудиту:** 28 квітня 2026  
**Дата оновлення:** 2 травня 2026
**Версія:** 0.1.0  
**Платформи:** React Native (iOS/Android) + Web
**Статус:** БАЗОВІ UI/UX ПОКРАЩЕННЯ РЕАЛІЗОВАНІ; ЗАЛИШОК — ВАЛІДАЦІЯ, E2E, A11Y
**Детальний план реалізації:** [UX-IMPROVEMENT-PLAN.md](./UX-IMPROVEMENT-PLAN.md)

> **Code-sync 2026-05-02.** Таблиці реалізованих покращень нижче звірені з
> фактичними файлами `apps/mobile` і `apps/web`. Секція "Виявлені проблеми"
> збережена як історичний audit trail від 2026-04-28; для поточного виконання
> дивись актуальний tracker у [`UX-IMPROVEMENT-PLAN.md`](./UX-IMPROVEMENT-PLAN.md).
> Канонічні правила дизайну мають вищий пріоритет за аудиторські приклади:
> [`docs/design/design-system.md`](../design/design-system.md).

---

## Реалізовані покращення (code-sync 02.05.2026)

### Phase 1: Core UX Improvements

| Покращення                 | Статус | Файли                                         |
| -------------------------- | ------ | --------------------------------------------- |
| Dark Mode з Theme Toggle   | Done   | `ColorSchemeBridge.tsx`, `GeneralSection.tsx` |
| Unified BackButton         | Done   | `BackButton.tsx` (новий)                      |
| Sheet Gesture Dismiss      | Done   | `Sheet.tsx` (mobile RN + web pattern)         |
| Input Helper Icons         | Done   | `Input.tsx`                                   |
| EmptyState Semantic Tokens | Done   | `EmptyState.tsx`                              |
| Toast Safe Area            | Done   | `Toast.tsx`                                   |
| Tab Badges All Modules     | Done   | `useTabBadges.ts`, `_layout.tsx`              |
| Settings Grouping          | Done   | `HubSettingsPage.tsx`                         |
| Forgot Password Screen     | Done   | `forgot-password.tsx` (новий)                 |
| PageSkeleton Component     | Done   | `PageSkeleton.tsx` (новий)                    |

### Phase 2: Advanced UX Improvements

| Покращення                      | Статус | Файли                                                                      |
| ------------------------------- | ------ | -------------------------------------------------------------------------- |
| Pull-to-refresh HubDashboard    | Done   | `HubDashboard.tsx` (`RefreshControl`)                                      |
| ModuleErrorBoundary Enhanced UI | Done   | `ModuleErrorBoundary.tsx`                                                  |
| BackButton в nutrition pages    | Done   | `RecipeDetail.tsx`, `RecipeForm.tsx`, `SavedRecipesList.tsx`, `Pantry.tsx` |
| BackButton в fizruk pages       | Done   | `Workouts.tsx`                                                             |
| BackButton в core pages         | Done   | `AssistantCataloguePage.tsx`                                               |
| useReduceMotion hook            | Done   | `useReduceMotion.ts` (новий)                                               |
| useScreenReader hook            | Done   | `useScreenReader.ts` (новий)                                               |
| LoadingOverlay component        | Done   | `LoadingOverlay.tsx`                                                       |
| Hooks index barrel              | Done   | `hooks/index.ts` (новий)                                                   |

### Phase 3: Advanced Components & Theming

| Покращення                   | Статус | Файли                           |
| ---------------------------- | ------ | ------------------------------- |
| Mobile theme extension       | Done   | `theme.ts`, `ColorSchemeBridge.tsx` |
| chartColors semantic tokens  | Done   | `theme.ts`                      |
| HabitHeatmap semantic colors | Done   | `HabitHeatmap.tsx`              |
| MacroRing semantic colors    | Done   | `MacroRing.tsx`                 |
| Shopping page Input fix      | Done   | `Shopping.tsx`                  |
| FormField wrapper component  | Done   | `FormField.tsx` (новий)         |
| ConfirmDialog enhanced       | Done   | `ConfirmDialog.tsx` (покращено) |
| useConfirm imperative hook   | Done   | `ConfirmDialog.tsx`             |
| SwipeableRow semantic colors | Done   | `SwipeableRow.tsx`              |
| commonActions expanded       | Done   | `SwipeableRow.tsx`              |
| ProgressIndicator component  | Done   | `ProgressIndicator.tsx` (новий) |
| ProgressBar/Circle/Steps     | Done   | `ProgressIndicator.tsx`         |
| Centralized haptics utility  | Done   | `lib/haptics.ts` (новий)        |
| useHaptics hook              | Done   | `lib/haptics.ts`                |

### Залишок після code-sync

| Напрям | Статус | Чому не закрито |
| --- | --- | --- |
| iOS/Android manual validation | Pending | Потрібен свіжий прогін на реальних/емуляторних девайсах |
| E2E для auth/theme/settings flows | Partial | Unit coverage for forgot-password + Detox Hub UX smoke added; needs device execution |
| Full accessibility audit | Partial | Settings/theme/loading a11y improved; still needs screen-reader audit report |
| Loading state audit всіх сторінок | Pending | Примітиви є, потрібна перевірка покриття сторінок |

### Статистика

- **Нових файлів:** 12
- **Модифікованих файлів:** 26
- **Загальна кількість покращень:** 33

---

## 📋 Зміст

1. [Резюме](#резюме)
2. [Сильні сторони](#сильні-сторони)
3. [Виявлені проблеми](#виявлені-проблеми)
4. [Детальний аналіз по секціях](#детальний-аналіз-по-секціях)
5. [Рекомендації](#рекомендації)
6. [План покращення](#план-покращення)
7. [Пріоритезована дорожня карта](#пріоритезована-дорожня-карта)

---

## 📊 Резюме

### Загальна оцінка

| Категорія              | Оцінка           | Коментар                                          |
| ---------------------- | ---------------- | ------------------------------------------------- |
| **Візуальний дизайн**  | ⭐⭐⭐⭐☆ (4/5)  | Теплі, дружні кольори. Відмінна система токенів   |
| **Консистентність UI** | ⭐⭐⭐⭐☆ (4/5)  | Добра система компонентів, є місця для покращення |
| **UX/Юзабіліті**       | ⭐⭐⭐☆☆ (3.5/5) | Базовий UX хороший, потребує полірування          |
| **Доступність (a11y)** | ⭐⭐⭐⭐☆ (4/5)  | Добра підтримка, потрібні покращення              |
| **Мобільний досвід**   | ⭐⭐⭐⭐☆ (4/5)  | Нативні патерни, хороша тактильність              |
| **Онбординг**          | ⭐⭐⭐⭐☆ (4/5)  | Зрозумілий процес, гарна структура                |
| **Продуктивність**     | ⭐⭐⭐⭐☆ (4/5)  | Оптимізовані анімації, respects reduceMotion      |

**Загальна оцінка: 3.9/5** — Солідна основа з хорошим потенціалом для покращення

---

## ✅ Сильні сторони

### 1. Дизайн-система

- **Централізовані design tokens** — `@sergeant/design-tokens` забезпечує єдине джерело правди
- **Семантична система кольорів** — CSS-змінні для автоматичної підтримки темної теми
- **Модульна палітра** — кожен модуль (Finyk, Fizruk, Routine, Nutrition) має унікальну ідентичність
- **Теплі, органічні кольори** — уникнення холодних сірих, використання cream/emerald/coral/lime

```css
/* Приклад — відмінна архітектура токенів */
--c-bg: 253 249 243;
--c-panel: 255 255 255;
--c-accent: 16 185 129; /* emerald-500 */
```

### 2. Компонентна архітектура

- **Паритет web/mobile** — компоненти мають ідентичні API (`Button`, `Card`, `Input`, `Sheet`)
- **Добра документація** — JSDoc коментарі з посиланнями на canonical source
- **Варіантна система** — всі компоненти мають `variant`, `size` props
- **Композиція** — `Card` з sub-компонентами (`CardHeader`, `CardTitle`, `CardContent`, `CardFooter`)

### 3. Доступність

- **Мінімальний touch target 44-48px** — відповідає WCAG 2.5.5
- **Підтримка reduceMotion** — анімації вимикаються для користувачів з налаштуваннями доступності
- **Haptic feedback** — тактильний зворотний зв'язок через `expo-haptics`
- **Accessibility roles та labels** — 450+ використань `accessibilityRole/Label/State`
- **Focus management** — `accessibilityViewIsModal` для Sheet/Modal

### 4. Локалізація

- **Повна українська мова** — всі тексти українською
- **Культурно-адаптовані формати** — дати у форматі "uk-UA"
- **Дружній тон** — "друже", "Привіт", "Раді бачити тебе знову"

### 5. Анімації та мікро-взаємодії

- **Spring-based анімації** — природній, приємний рух
- **Staggered entrance** — елементи з'являються послідовно
- **Press feedback** — `scale(0.97)` при натисканні
- **Progress indicators** — візуальний зворотний зв'язок під час операцій

---

## ⚠️ Виявлені проблеми

> **Historical section.** Пункти нижче описують стан на 2026-04-28. Більшість
> P0/P1 UI-проблем уже закриті у коді; не використовуй цю секцію як поточний
> backlog без звірки з `UX-IMPROVEMENT-PLAN.md`.

### 🔴 Критичні (P0)

#### 1. Відсутність темної теми на мобільному

**Файл:** `apps/mobile/global.css`

```css
.dark {
  /* Токени визначені, але НЕ застосовуються */
  --c-bg: 23 20 18;
}
```

**Проблема:** Dark mode токени існують, але мобільний застосунок не має механізму перемикання теми. `ColorSchemeBridge.tsx` не повністю інтегрований.

**Вплив:**

- ~30% користувачів надають перевагу темній темі
- Погіршена читабельність у нічний час
- Негативний вплив на автономність батареї (OLED)

#### 2. Неконсистентний back navigation

**Файли:** `OnboardingWizard.tsx`, модулі

```tsx
// Проблема: Різні патерни для "назад"
<Pressable onPress={onBack}>
  <Text className="text-sm text-fg-muted">←</Text> {/* Текст замість іконки */}
</Pressable>
```

**Проблема:** Back button — це просто текст "←", а не стандартна іконка. Розміри та стилі відрізняються між екранами.

#### 3. Немає Error Boundary UI

**Файл:** `ModuleErrorBoundary.tsx`

```tsx
// Існує, але generic UI — потребує брендованого фолбеку
```

**Проблема:** При помилках користувач бачить generic fallback без чіткого шляху відновлення.

---

### 🟠 Важливі (P1)

#### 4. Sheet не має gesture dismissal

**Файл:** `Sheet.tsx`

```tsx
// Scrim dismiss є, але swipe-down для закриття ВІДСУТНІЙ
<Pressable onPress={onClose} className="absolute inset-0 bg-black/40" />
```

**Проблема:** Користувачі очікують можливість закрити sheet свайпом вниз (iOS/Android стандарт).

#### 5. Input helper text без іконок

**Файл:** `Input.tsx`

```tsx
{
  helperText ? (
    <Text className={cx("text-xs", error ? "text-danger" : "text-fg-muted")}>
      {helperText}
    </Text>
  ) : null;
}
```

**Проблема:** Error states показують лише текст без іконки-індикатора (⚠️ або ✗).

#### 6. Tab bar без badges для всіх модулів

**Файл:** `(tabs)/_layout.tsx`

```tsx
// Тільки Routine має badge
tabBarBadge: badges.routine,
```

**Проблема:** Badges існують лише для Routine. Finyk/Fizruk/Nutrition не сигналізують про pending items.

#### 7. EmptyState використовує hardcoded colors

**Файл:** `EmptyState.tsx`

```tsx
((iconColor = "#94a3b8"), // slate-400 default — НЕ semantic token
  (className = "text-slate-800")); // Hardcoded
className = "text-emerald-500"; // Hardcoded
```

**Проблема:** Не використовує semantic tokens, зламається в dark mode.

---

### 🟡 Середні (P2)

#### 8. Inconsistent loading states

- `Button` має `loading` prop з ActivityIndicator ✅
- Але сторінки використовують різні патерни: `Skeleton`, `ActivityIndicator`, нічого

#### 9. Toast позиціювання

**Файл:** `Toast.tsx`

```tsx
style={{ position: "absolute", top: 0 }} // Перекриває Safe Area на деяких пристроях
```

#### 10. FloatingActionButton позиція конфліктує з tab bar

```tsx
bottom = 24, // Може перекриватися з tab bar на малих екранах
```

#### 11. Settings page — flat list без групування

**Файл:** `HubSettingsPage.tsx`

```tsx
// 9 секцій підряд без візуальної ієрархії
<GeneralSection />
<NotificationsSection />
<RoutineSection />
// ...
```

**Проблема:** Довгий scroll без якорів або навігації.

#### 12. Sign-in — відсутня форма "Забув пароль"

**Файл:** `sign-in.tsx`

```tsx
<Link href="/(auth)/forgot-password"> // Посилання є, але маршрут не існує!
```

---

### 🟢 Незначні (P3)

#### 13. Typography utilities неконсистентні

- `text-h1`, `text-h2`, `text-body` визначені в `global.css`
- Але більшість компонентів використовують raw Tailwind classes замість них

#### 14. Card radiuses

- `radius` prop на Card підтримує `md | lg | xl`
- Але module-branded cards завжди `rounded-3xl` — без overriding

#### 15. ListItem — hardcoded press background

```tsx
style={({ pressed }) => pressed ? { backgroundColor: "rgba(0,0,0,0.05)" } : undefined}
// Не адаптується до dark mode
```

---

## 📐 Детальний аналіз по секціях

### 🏠 Dashboard (HubDashboard)

| Аспект          | Статус | Коментар                                            |
| --------------- | ------ | --------------------------------------------------- |
| Layout          | ✅     | Добра ієрархія: Greeting → Hero → Status → Insights |
| Touch targets   | ✅     | Settings button 40×40, FAB 56×56                    |
| Content density | ⚠️     | Може бути overwhelming при всіх модулях активних    |
| Empty states    | ✅     | `FirstActionHeroCard` для нових користувачів        |
| Pull-to-refresh | ❌     | Відсутній                                           |

**Рекомендації:**

1. Додати pull-to-refresh для оновлення даних
2. Розглянути collapsible sections при 4+ активних модулях
3. Персоналізувати greeting залежно від часу доби

### 🔐 Авторизація (Sign-in/Sign-up)

| Аспект                     | Статус | Коментар                            |
| -------------------------- | ------ | ----------------------------------- |
| Form validation            | ⚠️     | Client-side validation мінімальна   |
| Password visibility toggle | ✅     | Є                                   |
| Error display              | ⚠️     | Текст без іконки, одне повідомлення |
| Social login               | ❌     | Відсутній                           |
| Biometric auth             | ❌     | Відсутній                           |

**Рекомендації:**

1. Додати inline validation під час набору
2. Реалізувати "Забув пароль" flow
3. Розглянути Face ID/Touch ID для швидкого входу

### ⚙️ Налаштування (HubSettingsPage)

| Аспект        | Статус | Коментар                                 |
| ------------- | ------ | ---------------------------------------- |
| Organization  | ⚠️     | 9 секцій в один scroll без категоризації |
| Search        | ❌     | Відсутній                                |
| Quick actions | ❌     | Немає швидких посилань вгорі             |

**Рекомендації:**

1. Групувати секції: "Загальні" / "Модулі" / "AI" / "Акаунт"
2. Додати sticky search bar
3. Показувати часто використовувані налаштування першими

### 👋 Онбординг (OnboardingWizard)

| Аспект              | Статус | Коментар                    |
| ------------------- | ------ | --------------------------- |
| Progress indication | ✅     | Step indicator з dots       |
| Module selection    | ✅     | Tap to toggle з haptic      |
| Goal setting        | ✅     | Optional, можна пропустити  |
| Skip flow           | ✅     | "Без вибору — всі 4 модулі" |

**Сильні сторони:**

- Чіткі кроки (Welcome → Modules → Goals)
- Візуальні emoji для модулів
- Non-blocking flow

**Рекомендації:**

1. Додати можливість "назад" на Goals step через swipe
2. Показати превью dashboard після вибору модулів

### 💰 Finyk (Фінанси)

| Аспект           | Статус | Коментар                                 |
| ---------------- | ------ | ---------------------------------------- |
| Overview layout  | ✅     | Hero card + категорії + бюджети          |
| Transaction list | ✅     | Swipeable rows для редагування/видалення |
| Category picker  | ✅     | Sheet з іконками                         |
| Charts           | ⚠️     | Donut chart потребує легенди             |

### 🏋️ Fizruk (Фітнес)

| Аспект            | Статус | Коментар                          |
| ----------------- | ------ | --------------------------------- |
| Body Atlas        | ✅     | Інтерактивна SVG карта тіла       |
| Workout flow      | ⚠️     | Активна сесія потребує кращого UX |
| Rest timer        | ✅     | Overlay з вібрацією               |
| Progress tracking | ✅     | Trend charts                      |

### ✅ Routine (Звички)

| Аспект         | Статус | Коментар                 |
| -------------- | ------ | ------------------------ |
| Habit list     | ✅     | Checkbox + swipe actions |
| Calendar view  | ✅     | Week view з heatmap      |
| Streak display | ✅     | StreakFlame компонент    |

### 🍽️ Nutrition (Харчування)

| Аспект         | Статус | Коментар              |
| -------------- | ------ | --------------------- |
| Meal logging   | ✅     | Sheet з macro editors |
| Water tracking | ✅     | Interactive card      |
| Barcode scan   | ⚠️     | Базова імплементація  |
| Recipe form    | ✅     | Comprehensive         |

---

## 📝 Рекомендації

### A. Негайні покращення (Sprint 1-2)

#### A1. Імплементувати Dark Mode

```tsx
// ColorSchemeBridge.tsx — розширити
export function ColorSchemeBridge() {
  const colorScheme = useColorScheme();
  const systemColorScheme = useSystemColorScheme();

  useEffect(() => {
    // Застосувати .dark клас до root
    document.documentElement.classList.toggle(
      "dark",
      colorScheme === "dark" || systemColorScheme === "dark",
    );
  }, [colorScheme, systemColorScheme]);
}
```

#### A2. Уніфікувати Back Navigation

```tsx
// Створити BackButton ко��понент
export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Назад"
      className="h-11 w-11 items-center justify-center rounded-full bg-cream-100 active:opacity-70"
    >
      <ChevronLeft size={24} color={colors.text} />
    </Pressable>
  );
}
```

#### A3. Sheet Gesture Dismiss

```tsx
// Інтегрувати @gorhom/bottom-sheet або додати pan gesture
const panGesture = Gesture.Pan().onEnd((e) => {
  if (e.translationY > 100) {
    onClose();
  }
});
```

### B. Середньострокові покращення (Sprint 3-4)

#### B1. Loading State System

```tsx
// Створити unified loading patterns
export function PageSkeleton({
  variant,
}: {
  variant: "list" | "dashboard" | "form";
}) {
  // ...
}

export function useLoadingState<T>(asyncFn: () => Promise<T>) {
  // Стандартизований хук для loading/error/data
}
```

#### B2. Error Boundary з UX

```tsx
function ModuleErrorFallback({ moduleName, onRetry }) {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <View className="w-20 h-20 items-center justify-center rounded-3xl bg-danger-soft mb-4">
        <AlertTriangle size={40} color={colors.danger} />
      </View>
      <Text className="text-lg font-bold text-fg mb-2">
        Щось пішло не так у {moduleName}
      </Text>
      <Text className="text-sm text-fg-muted text-center mb-6">
        Спробуйте оновити або поверніться пізніше.
      </Text>
      <Button onPress={onRetry} variant="primary">
        Спробувати знову
      </Button>
    </View>
  );
}
```

#### B3. Tab Badges для всіх модулів

```tsx
// useTabBadges.ts — розширити
export function useTabBadges() {
  return {
    routine: useRoutinePendingCount(),
    finyk: useOverBudgetCount(),
    fizruk: useMissedWorkoutsCount(),
    nutrition: useCalorieDeficitAlert(),
  };
}
```

### C. Довгострокові покращення (Quarter 2-3)

#### C1. Accessibility Audit Tools

- Інтегрувати `@testing-library/react-native` a11y queries
- Налаштувати автоматичне тестування на кожен PR
- Додати VoiceOver/TalkBack тести в E2E

#### C2. Design System Documentation

- Створити Storybook для мобільних компонентів
- Задокументувати всі variants/sizes/states
- Додати guidelines для нових компонентів

#### C3. Performance Monitoring

- Інтегрувати frame rate monitoring
- Відстежувати TTI (Time to Interactive) для кожного екрана
- Оптимізувати re-renders через React DevTools Profiler

---

## 🗺️ Пріоритезована дорожня карта

### Phase 1: Foundation Fix (Weeks 1-4)

| Тиждень | Задача                           | Пріоритет | Складність |
| ------- | -------------------------------- | --------- | ---------- |
| 1       | Dark mode toggle в налаштуваннях | P0        | Medium     |
| 1       | BackButton компонент             | P0        | Low        |
| 2       | Sheet gesture dismiss            | P1        | Medium     |
| 2       | Input helper icons               | P1        | Low        |
| 3       | EmptyState semantic tokens       | P1        | Low        |
| 3       | Toast safe area fix              | P2        | Low        |
| 4       | Settings page grouping           | P2        | Medium     |

### Phase 2: UX Polish (Weeks 5-8)

| Тиждень | Задача                       | Пріоритет | Складність |
| ------- | ---------------------------- | --------- | ---------- |
| 5       | Tab badges для всіх модулів  | P1        | Medium     |
| 5-6     | Forgot password flow         | P1        | Medium     |
| 6       | Pull-to-refresh на dashboard | P2        | Low        |
| 7       | Unified loading states       | P2        | High       |
| 8       | Error boundary з custom UI   | P1        | Medium     |

### Phase 3: Enhancement (Weeks 9-12)

| Тиждень | Задача                    | Пріоритет | Складність |
| ------- | ------------------------- | --------- | ---------- |
| 9-10    | Biometric authentication  | P2        | High       |
| 10      | Onboarding animations     | P3        | Medium     |
| 11      | Typography system cleanup | P3        | Low        |
| 12      | Performance audit         | P2        | High       |

---

## 📊 Метрики успіху

### UX Метрики для відстеження

| Метрика                          | Поточне значення | Ціль  |
| -------------------------------- | ---------------- | ----- |
| Onboarding completion rate       | ~85% (est.)      | 95%   |
| Time to first action             | ~45s (est.)      | <30s  |
| Error rate per session           | Unknown          | <0.1% |
| App rating                       | N/A              | 4.5+  |
| Accessibility score (Lighthouse) | ~80 (est.)       | 95+   |

### Технічні метрики

| Метрика                   | Поточне значення | Ціль |
| ------------------------- | ---------------- | ---- |
| Component test coverage   | ~60%             | 80%  |
| Bundle size (mobile)      | Unknown          | <5MB |
| TTI (Time to Interactive) | Unknown          | <2s  |
| Design token consistency  | ~80%             | 100% |

---

## 🔧 Технічний борг

### Компоненти, що потребують рефакторингу

1. **Toast.tsx** — надто складний, розділити на ToastProvider/ToastItem/ToastContainer
2. **OnboardingWizard.tsx** — 500+ рядків, розбити на окремі step компоненти
3. **HubDashboard.tsx** — 300+ рядків, винести hero logic в хук

### Залежності для оновлення/заміни

| Поточне                | Рекомендація         | Причина                         |
| ---------------------- | -------------------- | ------------------------------- |
| Built-in Modal + Sheet | @gorhom/bottom-sheet | Gesture support, кращі анімації |
| Manual form state      | react-hook-form      | Validation, performance         |
| Custom chart logic     | victory-native       | Більше типів графіків           |

---

## ✨ Висновок

**Sergeant** має **солідну архітектурну основу** з добре продуманою системою дизайн-токенів та компонентів. Головні області для покращення:

1. **Dark mode** — критично важливо для сучасного застосунку
2. **Gesture interactions** — sheet/swipe patterns потребують полірування
3. **Error handling** — користувач повинен завжди знати, що робити далі
4. **Consistency** — уніфікація loading states, back navigation, typography

Виконання Phase 1-2 цього плану (8 тижнів) підніме загальну оцінку UX з **3.9 до 4.5+** та значно покращить користувацький досвід на обох платформах.

---

_Документ підготовлено: 28.04.2026_  
_Наступний аудит рекомендовано: Q3 2026_
