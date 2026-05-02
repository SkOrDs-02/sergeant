# @sergeant/config

Спільні базові конфігурації TypeScript та ESLint для всіх apps і packages монорепо.

## Що всередині

| Файл                  | Призначення                              |
| --------------------- | ---------------------------------------- |
| `tsconfig.base.json`  | Базовий tsconfig — strict, target ES2022 |
| `tsconfig.node.json`  | Для Node-only коду (scripts, server)     |
| `tsconfig.react.json` | Для React-апок (JSX transform, DOM lib)  |
| `vitest.base.js`      | Базовий vitest config (shared presets)   |

## Використання

```jsonc
// apps/web/tsconfig.json
{
  "extends": "@sergeant/config/tsconfig.react.json",
}
```

```js
// apps/server/vitest.config.ts
import base from "@sergeant/config/vitest.base.js";
```

## Примітка

Цей пакет `stabilize` — breaking зміни тільки через ADR. Див. [`docs/architecture/apps-status-matrix.md`](../../docs/architecture/apps-status-matrix.md).
