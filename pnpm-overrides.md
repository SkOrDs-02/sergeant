# pnpm Overrides Rationale

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Документація кожного запису в `pnpm.overrides` кореневого `package.json`.
Правила: [`docs/governance/pnpm-overrides-policy.md`](docs/governance/pnpm-overrides-policy.md).

---

## `react-server-dom-webpack@^19.0.2`

**Why:** Кілька пакетів тягнули `react-server-dom-webpack@18.x` як transitive peer, що
конфліктувало з React 19 у `apps/web` і `apps/mobile`. Примусове вирівнювання на `^19.0.2`
виключає колізію при SSR-bootstrap і bundler-плагіні Vite.

**Drop when:** Всі workspaces явно оголошують `react-server-dom-webpack` у власних
`dependencies/peerDependencies`, або пакет припиняє існувати як окрема точка входу в React.

**Last reviewed:** 2026-05-11

---

## `tar@>=7.5.11`

**Why:** CVE-2024-29415 (path traversal) у `tar <7.5.11`. Ряд інструментарних залежностей
(native-build tools, Detox, Expo CLI) тягнуть старі мінори. Override гарантує, що security-fix
присутній незалежно від того, яку версію оголошує транситивний залежник.

**Drop when:** Всі залежники, що тягнуть `tar`, самостійно перейдуть на `>=7.5.11` у власних
`package.json`, або advisory буде відкликано.

**Last reviewed:** 2026-05-11

---

## `@xmldom/xmldom@>=0.8.13`

**Why:** `@xmldom/xmldom <0.8.13` містить CVE-2022-37616 і CVE-2022-39353 (ReDoS / prototype
pollution). Кілька React Native / Expo-пакетів тягнули застарілий мінор. Override забезпечує
patched версію у всьому дереві.

**Drop when:** Всі прямі залежники перейдуть на `>=0.8.13` або відмовляться від
`@xmldom/xmldom` на користь вбудованих парсерів.

**Last reviewed:** 2026-05-11

---

## `serialize-javascript@>=7.0.5`

**Why:** `serialize-javascript <7.0.5` містить XSS-вразливість через неескейповані `</script>`
у JSON-виводі. Webpack / copy-webpack-plugin-залежності тягнули старі версії.

**Drop when:** Прямі залежники (webpack-chain, html-webpack-plugin та ін.) оновляться до
`>=7.0.5` у власних деп-деревах.

**Last reviewed:** 2026-05-11

---

## `postcss@>=8.5.10`

**Why:** `postcss <8.5.10` містить CVE-2023-44270 (path traversal при парсингу CSS). Tailwind /
Vite / postcss-loader тягнуть різні patch-рівні; override гарантує виправлений варіант у
всьому workspace.

**Drop when:** Tailwind CSS і Vite перейдуть на `>=8.5.10` як власний нижній bound.

**Last reviewed:** 2026-05-11

---

## `uuid@^14.0.0`

**Why:** Деякі transitive залежники підтягували `uuid@v1`–`v8` (CJS-only, без `crypto`
failsafe). UUID v14 — мажор з ESM-first, покращеним RNG та видаленням deprecated v1/v6 API.
Пов'язано з hardening card L1 (`docs/security/hardening/L1-uuid-override.md`).

**Drop when:** Всі workspaces явно залежать від `uuid@^14` або мігрують на `crypto.randomUUID()`
(native, без пакету).

**Last reviewed:** 2026-05-11

---

## `@tootallnate/once@>=3.0.1`

**Why:** `@tootallnate/once <3.0.1` не підтримує Node.js 20 EventEmitter `once()` з AbortSignal
і має deprecation-warnings у сучасному Node. Expo/RN toolchain тягнув старий мінор.

**Drop when:** Expo CLI і залежні пакети оновлять власну прив'язку до `>=3.0.1`.

**Last reviewed:** 2026-05-11

---

## `@types/node@^20`

**Why:** Node 20 LTS; `@types/node` v22/v24/v25 випадково підтягувались transitive deps,
що спричиняло TS-помилки на Node 20 API (наприклад, `fs.glob` є тільки в v22+). Enforced
by ADR-0050.

**Drop when:** Всі workspaces явно пінять власну версію `@types/node` або TS-конфіг переходить
на Node 22 LTS.

**Last reviewed:** 2026-05-11

---

## `esbuild@<0.25.0` → `>=0.25.0`

**Why:** GHSA-67mh-4wv8-2f99 — `esbuild <=0.24.2` dev-server CSRF: будь-який сайт міг
надсилати запити до локального esbuild dev-server і читати відповідь. У нашому tree
вразливий `esbuild@0.18.20` потрапляв транзитивно через `@esbuild-kit/core-utils@3.3.2`
(deprecated package, тягнеться через `tsx`/`@esbuild-kit/esm-loader`). Selector form
бампає лише вразливу sub-range (`<0.25.0`), не чіпаючи direct dev dep на
`esbuild@^0.28.0` в `apps/server` та інші модерні версії в tree.

**Drop when:** `@esbuild-kit/core-utils` або відповідні залежники оновлять transitive pin
на `esbuild >=0.25.0`, або `tsx` мігрує з deprecated `@esbuild-kit/*` на власний loader.

**Last reviewed:** 2026-05-13

---

## `ajv@>=7.0.0-alpha.0 <8.18.0` → `>=8.18.0`

**Why:** GHSA-9wv6-86v2-598j — `ajv` `>=7.0.0-alpha.0, <8.18.0` має ReDoS у обробці
`$data` references. У нашому tree вразливий `ajv@8.11.0` потрапляв через
`expo-dev-launcher@5.0.35` (apps/mobile). Selector form бампає лише sub-range з v7/v8
до 8.18+, не торкаючись `ajv@6.15.0` (необхідний для ESLint 9 / `@eslint/eslintrc`),
оскільки ajv 6 і 8 — несумісні API (constructor signature, schema validation).

**Drop when:** `expo-dev-launcher` або відповідні залежники оновлять transitive pin на
`ajv >=8.18.0`, або ajv 6.x вийде з tree (потребує заміни ESLint).

**Last reviewed:** 2026-05-13
