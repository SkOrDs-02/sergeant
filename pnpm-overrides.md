# pnpm Overrides Rationale

> **Last validated:** 2026-05-11 by @claude. **Next review:** 2026-08-09.
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
