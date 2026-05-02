# Playbook: Fix Exhaustive Deps Warnings

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** "Виправити exhaustive-deps warnings" / ESLint `react-hooks/exhaustive-deps` violations / стале закриття з `apps-web-exhaustive-deps.md`.

---

## Steps

### 1. Знайти поточні warnings

```bash
# Запустити ESLint з фільтром на правило
pnpm --filter @sergeant/web exec eslint . --rule 'react-hooks/exhaustive-deps: warn' 2>&1 | grep "exhaustive-deps"

# Або перевірити документ-трекер
cat docs/architecture/apps-web-exhaustive-deps.md
```

### 2. Класифікувати кожен warning

Для кожного випадку визначити правильну стратегію:

| Ситуація                         | Рішення                                                   |
| -------------------------------- | --------------------------------------------------------- |
| Залежність дійсно потрібна       | Додати в dep array                                        |
| Callback рекреюється щоразу      | Обгорнути у `useCallback`                                 |
| Обчислення пересчитується щоразу | Обгорнути у `useMemo`                                     |
| Object/array literal в dep       | Винести за межі компонента або `useMemo`                  |
| Ref використовується в effect    | Ref не потрібно в deps (він стабільний)                   |
| Навмисний "mount-only" effect    | Додати `// eslint-disable-next-line` з коментарем причини |

### 3. Виправити

**Варіант A — додати dep:**

```tsx
// До:
useEffect(() => {
  fetchData(userId);
}, []); // warning: missing 'userId'

// Після:
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

**Варіант B — useCallback:**

```tsx
// До:
const handleClick = () => doSomething(value);
useEffect(() => {
  element.addEventListener("click", handleClick);
}, [handleClick]); // handleClick рекреюється кожен рендер

// Після:
const handleClick = useCallback(() => doSomething(value), [value]);
useEffect(() => {
  element.addEventListener("click", handleClick);
}, [handleClick]);
```

### 4. Перевірити рендер-цикл

Після кожного виправлення — перевірити що не створено infinite re-render loop:

- Відкрити сторінку в dev-mode
- Перевірити React DevTools → Profiler
- Впевнитись що effect не тригериться безкінечно

### 5. Оновити трекер

Оновити `docs/architecture/apps-web-exhaustive-deps.md` — видалити або позначити виправлені файли.

### 6. Створити PR

- Branch: `devin/<unix-ts>-fix-exhaustive-deps-<module>`
- Commit: `fix(web): resolve exhaustive-deps warnings in <module>`
- PR description: які файли виправлено, яку стратегію обрано для кожного.

---

## Verification

- [ ] `pnpm lint` — green (warnings зникли)
- [ ] `pnpm typecheck` — green
- [ ] Тести — green
- [ ] Немає infinite re-render loops (перевірити в dev-mode)
- [ ] `docs/architecture/apps-web-exhaustive-deps.md` оновлено
- [ ] `eslint-disable` використано тільки для обґрунтованих mount-only effects

## Notes

- Не вимикай правило глобально — `exhaustive-deps` попереджає про реальні баги (stale closures).
- `eslint-disable-next-line` — тільки з коментарем **чому** deps навмисно пропущені.
- Групуй виправлення по модулю (finyk, nutrition, fizruk тощо) — легше ревювити.
- React Query hooks (`useQuery`, `useMutation`) мають свої правила щодо deps — не плутати з `useEffect`.

## See also

- [apps-web-exhaustive-deps.md](../architecture/apps-web-exhaustive-deps.md) — повний список warnings
- [frontend-tech-debt.md](../tech-debt/frontend.md) — загальний фронтенд tech debt
- [AGENTS.md](../../AGENTS.md) — загальні конвенції
