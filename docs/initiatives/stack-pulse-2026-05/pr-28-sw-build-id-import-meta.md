# PR-28: `__SW_BUILD_ID__` global → `import.meta.env.VITE_BUILD_ID`

> **Last validated:** 2026-05-09 by Devin. **Next review:** 2026-08-07.
> **Status:** In review — PR pending merge. Migration covers всі два ambient global-и (`__SW_BUILD_ID__` у SW + `__APP_BUILD_ID__` у React Query persister), які ділили той самий build-id; після цього PR-у вони живуть як single `import.meta.env.VITE_BUILD_ID` з типами у `apps/web/src/vite-env.d.ts`.

|                    |                                                                          |
| ------------------ | ------------------------------------------------------------------------ |
| **Severity**       | Low (L1)                                                                 |
| **Linked finding** | L1 (`00-overview.md`)                                                    |
| **Owner**          | @Skords-01                                                               |
| **Effort**         | 0.5 дня                                                                  |
| **Risk**           | Low (refactor; обидва механізми produce identical runtime value)         |
| **Touches**        | `apps/web/src/sw/version.ts`, `apps/web/vite.config.js`, ambient `.d.ts` |
| **Trigger**        | none — поліровка                                                         |

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

- [x] `apps/web/vite.config.js` без `define.__SW_BUILD_ID__` / `define.__APP_BUILD_ID__` — замінено на `"import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId)` (один літерал замість двох глобальних токенів).
- [x] `apps/web/src/sw/version.ts` використовує `import.meta.env.VITE_BUILD_ID` (`SW_VERSION = import.meta.env.VITE_BUILD_ID || "dev"`).
- [x] `apps/web/src/shared/lib/api/queryClientPersister.ts` використовує `import.meta.env.VITE_BUILD_ID` (викинуто ambient `declare const __APP_BUILD_ID__`; doc-string оновлено).
- [x] `apps/web/src/vite-env.d.ts` має typed `ImportMetaEnv.VITE_BUILD_ID` (+ `VITE_TARGET` migrated for consistency).
- [x] `apps/web/tsconfig.sw.json` підхоплює `vite/client` types + `vite-env.d.ts` (у SW build context `import.meta.env` був без типів без цього розширення).
- [x] `pnpm build` produces SW з валідним build-id (verified: `VITE_BUILD_ID=test-build-abc-123 pnpm --filter @sergeant/web build` — SHA inlined у обох `apps/server/dist/sw.js` і main bundle).
- [x] `apps/web/src/shared/lib/api/queryClientPersister.test.ts` оновлено (опис тесту більше не згадує `__APP_BUILD_ID__`); регресій немає — 237 test files / 2419 tests passing.

## Тести

- Existing `apps/web/src/sw/__tests__/version.test.ts` — pass post-refactor.
- Build smoke-test: `pnpm build && grep -r 'BUILD_ID=' dist/`.

## Rollout

- Single PR. No runtime user-facing change.

## Risks & mitigations

| Risk                                                        | Mitigation                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Build env-var не set-иться у CI → `BUILD_ID = "dev"` у prod | CI step `VITE_BUILD_ID=$(git rev-parse --short HEAD)` перед `pnpm build` |
| Інші modules з `__*__` globals не migrated → dual-pattern   | Out of scope; цей PR — pilot для `__SW_BUILD_ID__` тільки                |

## Touchpoints (file:line)

- `apps/web/vite.config.js:63-79` — `define` block (знято `__SW_BUILD_ID__` + `__APP_BUILD_ID__`, додано `"import.meta.env.VITE_BUILD_ID"`).
- `apps/web/src/sw/version.ts:1-25` — `__SW_BUILD_ID__` ambient global → `import.meta.env.VITE_BUILD_ID`.
- `apps/web/src/shared/lib/api/queryClientPersister.ts:30-100` — `__APP_BUILD_ID__` ambient global → `import.meta.env.VITE_BUILD_ID`; doc-string оновлено.
- `apps/web/src/shared/lib/api/queryClientPersister.test.ts:104` — текст it(...) оновлено.
- `apps/web/src/vite-env.d.ts` — новий файл: `ImportMetaEnv.VITE_BUILD_ID?: string` + `VITE_TARGET?: "web" | "capacitor"`.
- `apps/web/tsconfig.sw.json:13-17` — `types: ["vite/client"]` + `include` розширено на `src/vite-env.d.ts`.

## Refs

- [Vite env vars and modes](https://vitejs.dev/guide/env-and-mode.html)
