# PR-28: `__SW_BUILD_ID__` global → `import.meta.env.VITE_BUILD_ID`

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                                |
| ------------------ | ------------------------------------------------------------------------------ |
| **Severity**       | Low (L1)                                                                       |
| **Linked finding** | L1 (`00-overview.md`)                                                          |
| **Owner**          | TBD (sponsor: @Skords-01)                                                      |
| **Effort**         | 0.5 дня                                                                        |
| **Risk**           | Low (refactor; обидва механізми produce identical runtime value)               |
| **Touches**        | `apps/web/src/sw/version.ts`, `apps/web/vite.config.js`, ambient `.d.ts`       |
| **Trigger**        | none — поліровка                                                               |

## Контекст

`apps/web/vite.config.js` визначає `__SW_BUILD_ID__` як `define`-replacement (compile-time constant), і `apps/web/src/sw/version.ts` його читає. Це working pattern, але не ідіоматичний у Vite ecosystem 2026:

- `define` обходить TypeScript type-system → потрібен ambient declaration `.d.ts` файл.
- Помилки типу — runtime, не compile-time.
- `import.meta.env.VITE_*` — стандартний Vite pattern, з типами через `vite-env.d.ts`.

Поточна форма працює, але new-engineer-friendly form — `import.meta.env.VITE_BUILD_ID`.

## Scope

### 1. Vite config

```js
// apps/web/vite.config.js
import { execSync } from "node:child_process";

const buildId = execSync("git rev-parse --short HEAD").toString().trim();

export default defineConfig({
  define: {
    // remove __SW_BUILD_ID__
  },
  envPrefix: ["VITE_"],
  // pass через process.env to Vite envSubstitution
});

// .env.production (committed) або build-time:
// VITE_BUILD_ID=<sha>
```

Або краще: `vite-plugin-environment` для inline env-set без committed file.

### 2. Code update

```ts
// apps/web/src/sw/version.ts
- const BUILD_ID = __SW_BUILD_ID__;
+ const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? "dev";
```

### 3. Type declaration

`apps/web/src/vite-env.d.ts`:

```ts
interface ImportMetaEnv {
  readonly VITE_BUILD_ID: string;
}
```

### 4. Cleanup

- Drop ambient `.d.ts` declaration of `__SW_BUILD_ID__`.
- Update grep-test (`apps/web/src/test/no-globals.test.ts` якщо існує).

## Out of scope

- Перехід на `import.meta.env.PROD/DEV` для інших `__*__` globals (їх може бути декілька).

## Acceptance criteria (DoD)

- [ ] `apps/web/vite.config.js` без `define.__SW_BUILD_ID__`.
- [ ] `apps/web/src/sw/version.ts` використовує `import.meta.env.VITE_BUILD_ID`.
- [ ] `apps/web/src/vite-env.d.ts` має `VITE_BUILD_ID` тип.
- [ ] `pnpm build` produces SW з валідним build-id (smoke-test через grep-output).
- [ ] `apps/web/src/sw/__tests__/version.test.ts` оновлений на новий API.

## Тести

- Existing `apps/web/src/sw/__tests__/version.test.ts` — pass post-refactor.
- Build smoke-test: `pnpm build && grep -r 'BUILD_ID=' dist/`.

## Rollout

- Single PR. No runtime user-facing change.

## Risks & mitigations

| Risk                                                          | Mitigation                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Build env-var не set-иться у CI → `BUILD_ID = "dev"` у prod   | CI step `VITE_BUILD_ID=$(git rev-parse --short HEAD)` перед `pnpm build` |
| Інші modules з `__*__` globals не migrated → dual-pattern     | Out of scope; цей PR — pilot для `__SW_BUILD_ID__` тільки           |

## Touchpoints (file:line)

- `apps/web/src/sw/version.ts:1-30` (approx) — `__SW_BUILD_ID__` reference
- `apps/web/vite.config.js` — `define` block
- `apps/web/src/vite-env.d.ts` — type declaration

## Refs

- [Vite env vars and modes](https://vitejs.dev/guide/env-and-mode.html)
