# Playbook: Migrate localStorage to typedStore

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** "Мігрувати файл X з прямого localStorage на typedStore" / зменшити TODO-список у ESLint allowlist / `frontend-tech-debt.md` #2.

---

## Steps

### 1. Знайти всі прямі виклики у файлі

```bash
grep -n "localStorage\.\(getItem\|setItem\|removeItem\)" apps/web/src/<path-to-file>
```

Зафіксувати кожен виклик: яка функція, який ключ, який формат даних.

### 2. Визначити правильну обгортку

Sergeant має кілька storage-абстракцій:

- **`createTypedStore`** (`apps/web/src/shared/lib/typedStore.ts`) — основна, типобезпечна, sync across tabs.
- **`safeReadLS`** — safe JSON parse з fallback.
- **`createModuleStorage`** — для module-scoped ключів.
- **`useLocalStorageState`** — React hook з автоматичною підпискою.

Обрати найвідповідніший варіант залежно від use-case.

### 3. Замінити прямі виклики

**До:**

```ts
const data = JSON.parse(localStorage.getItem("myKey") || "null");
localStorage.setItem("myKey", JSON.stringify(data));
```

**Після:**

```ts
import { createTypedStore } from "@shared/lib/typedStore";
import { z } from "zod";

const store = createTypedStore({
  key: "myKey",
  version: 1,
  schema: z.string().nullable(),
  defaultValue: null,
});
const data = store.get();
store.set(data);
```

Перевірити:

- Error handling (try/catch не потрібен з typedStore — вже вбудований).
- Quota exceeded — typedStore обробляє gracefully.
- Private browsing — typedStore має fallback.

### 4. Видалити файл з ESLint allowlist

У `eslint.config.js` знайти файл у списку дозволених для `sergeant-design/no-raw-local-storage`:

```bash
grep -n "<filename>" eslint.config.js
```

Видалити рядок зі списку. Це гарантує що нові прямі `localStorage.*` у цьому файлі будуть блокуватись лінтером.

### 5. Тести

```bash
# Запустити тести файла (якщо є)
pnpm --filter @sergeant/web exec vitest run src/<path>/<file>.test.tsx

# Перевірити що лінтер тепер не дозволяє прямий localStorage в цьому файлі
pnpm lint
```

### 6. Створити PR

- Branch: `devin/<unix-ts>-chore-migrate-ls-<module>`
- Commit: `chore(web): migrate <file> from raw localStorage to typedStore`
- PR description: які виклики замінено, яку обгортку обрано і чому.

---

## Verification

- [ ] `pnpm lint` — green (файл видалено з allowlist і лінтер не скаржиться)
- [ ] `pnpm typecheck` — green
- [ ] Тести — green
- [ ] Файл видалено з ESLint allowlist у `eslint.config.js`
- [ ] Немає прямих `localStorage.*` в мігрованому файлі

## Notes

- Наразі ~49 файлів у TODO-списку (ESLint allowlist). Кожна міграція — окремий PR або група по модулю.
- `typedStore` sync across tabs автоматично через `storage` event.
- При міграції — не змінювати ключі localStorage (щоб не втратити дані існуючих юзерів).
- Якщо ключ потрібно перейменувати — додати migration logic (як `useMonoTokenMigration`).

## See also

- [frontend-tech-debt.md](../tech-debt/frontend.md) — §2 Прямі localStorage виклики
- [cleanup-dead-code.md](cleanup-dead-code.md) — якщо під час міграції знайдено мертвий код
- [AGENTS.md](../../AGENTS.md) — загальні конвенції
