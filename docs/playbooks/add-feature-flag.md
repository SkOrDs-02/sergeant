# Playbook: Додати feature flag

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

**Trigger:** «Сховай фічу X за прапорцем» / будь-яка нова експериментальна фіча, яку треба вмикати/вимикати без редеплою.

## Owner surface

- Primary surface: `apps/web/src/core/lib/featureFlags.ts`
- Coupled surface: `apps/web/src` (кожен `useFlag` / `getFlag` call site)
- Governing skill: `sergeant-web-ui`

---

## Steps

### 1. Зареєструй прапорець

Додай запис у `FLAG_REGISTRY` у `apps/web/src/core/lib/featureFlags.ts`:

```ts
{
  id: "your_flag_name",
  label: "Human-readable title",
  description: "Why a user would enable this.",
  defaultValue: false,
  experimental: true,
}
```

- `id` — snake*case з префіксом імені модуля (наприклад, `finyk*`, `fizruk*`, `nutrition*`, `hub\_`).
- `defaultValue: false` для експериментів, `true` для зрілих фіч (тримай прапорець до повного rollout, потім видаляй).

### 2. Захисти фічу в коді

Використовуй хук `useFlag` у React-компонентах:

```tsx
import { useFlag } from "@shared/../core/lib/featureFlags";

function MyComponent() {
  const enabled = useFlag("your_flag_name");
  if (!enabled) return null;
  return <NewFeature />;
}
```

Для не-React коду — `getFlag("your_flag_name")`.

### 3. Задокументуй прапорець

Створи або онови `docs/governance/feature-flags.md` із записом:

| Flag             | Owner   | Default | Expires    | Rollout plan                         |
| ---------------- | ------- | ------- | ---------- | ------------------------------------ |
| `your_flag_name` | @author | `false` | YYYY-MM-DD | Enable for beta → monitor → graduate |

### 4. Покрий обидві гілки тестами

Напиши або онови тести, які покривають поведінку **flag on** і **flag off**:

```ts
import { setFlag, resetFlags } from "../core/lib/featureFlags";

afterEach(() => resetFlags());

it("renders new feature when flag is on", () => {
  setFlag("your_flag_name", true);
  // assert feature appears
});

it("hides new feature when flag is off", () => {
  setFlag("your_flag_name", false);
  // assert feature is absent
});
```

### 5. Створи PR

- Гілка: `devin/<unix-ts>-feat-<flag-name>` або `<author>/<flag-name>`
- Commit: `feat(<module>): add <flag_name> feature flag`
- Опис PR має містити:
  - Критерій випуску прапорця (`defaultValue → true`): яка метрика / який feedback користувачів
  - Що моніторити після rollout (помилки, performance, скарги користувачів)

---

## Verification

- [ ] `pnpm lint` — зелено
- [ ] `pnpm typecheck` — зелено
- [ ] Тести проходять для обох станів прапорця
- [ ] Прапорець видно в Settings → Experimental (якщо `experimental: true`)
- [ ] Жодного hardcoded React Query ключа (тільки через factories з `queryKeys.ts` — AGENTS.md правило #2)

## Notes

- Система прапорців — client-only (`localStorage` через `typedStore`). Server-side прапорців поки немає.
- Прапорці автоматично синхронізуються між вкладками браузера через підписку `typedStore`.
- При випуску прапорця (видаленні), йди за плейбуком [cleanup-dead-code](cleanup-dead-code.md) для запису прапорця і всіх `useFlag` / `getFlag` call sites.
