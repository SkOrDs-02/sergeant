# Playbook: Add New Page Route

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** "Додати нову сторінку в apps/web" / новий розділ UI / новий route для SPA.

---

## Steps

### 1. Створити компонент сторінки

Створити файл в `apps/web/src/modules/<module>/pages/` або `apps/web/src/core/pages/`:

```tsx
export function NewPage() {
  return (
    <div>
      <h1>New Page</h1>
    </div>
  );
}
```

Дотримуватись існуючих конвенцій:

- Path aliases (`@shared/*`, `@finyk/*`) замість relative imports (AGENTS.md soft rule).
- Компонент — named export (не default).

### 2. Додати route

Додати route у відповідний router файл (`apps/web/src/core/App.tsx` — routing is inline there — або module-level router, e.g. `FizrukRouter.tsx`):

```tsx
import { NewPage } from "@module/pages/NewPage";

// у route config:
{ path: "/new-page", element: <NewPage /> }
```

### 3. Додати React Query key factory (якщо потрібен data fetching)

Якщо сторінка завантажує дані — додати ключі **тільки** через centralized factories в `apps/web/src/shared/lib/queryKeys.ts` (AGENTS.md rule #2):

```ts
export const myModuleKeys = {
  all: ["myModule"] as const,
  list: () => [...myModuleKeys.all, "list"] as const,
  detail: (id: string) => [...myModuleKeys.all, "detail", id] as const,
};
```

**Ніколи** не писати hardcoded `["myModule", ...]` в компонентах.

### 4. Feature flag (якщо experimental)

Якщо сторінка — експериментальна фіча:

- Додати flag в `apps/web/src/core/lib/featureFlags.ts`
- Обгорнути route або компонент в `useFlag("flag_name")`
- Див. [add-feature-flag.md](add-feature-flag.md) playbook

### 5. Навігація

Додати посилання на нову сторінку в sidebar / navbar / menu (де доречно).

### 6. Тести

```bash
# Unit-тест для компонента
pnpm --filter @sergeant/web exec vitest run src/modules/<module>/pages/NewPage.test.tsx

# Playwright E2E smoke (якщо критичний route)
pnpm --filter @sergeant/web exec playwright test
```

### 7. Створити PR

- Branch: `devin/<unix-ts>-feat-<page-name>`
- Commit: `feat(web): add <page-name> page`
- PR description: screenshot нової сторінки, link на route.

---

## Verification

- [ ] `pnpm lint` — green
- [ ] `pnpm typecheck` — green
- [ ] Тести — green
- [ ] React Query keys — через factories з `queryKeys.ts` (rule #2)
- [ ] Path aliases замість relative imports
- [ ] Screenshot додано до PR description
- [ ] Навігація на нову сторінку працює

## Notes

- `apps/web` — Vite + React 18 SPA з React Router.
- Feature flags — client-only (localStorage via `typedStore`).
- Якщо сторінка потребує даних з нового endpoint — спочатку [add-api-endpoint.md](add-api-endpoint.md).

## See also

- [add-feature-flag.md](add-feature-flag.md) — якщо сторінка за feature flag
- [add-api-endpoint.md](add-api-endpoint.md) — якщо потрібен новий backend endpoint
- [frontend-tech-debt.md](../tech-debt/frontend.md) — загальні фронтенд-конвенції
- [AGENTS.md](../../AGENTS.md) — rule #2 (RQ keys)
