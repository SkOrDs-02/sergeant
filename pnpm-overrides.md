# pnpm Overrides Rationale

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-06.
> **Status:** Active

Документація кожного запису в `pnpm.overrides` кореневого `package.json`.
Правила: [`docs/04-governance/governance/pnpm-overrides-policy.md`](docs/04-governance/governance/pnpm-overrides-policy.md).

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
Пов'язано з hardening card L1 (`docs/04-governance/security/hardening/L1-uuid-override.md`).

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

---

## `protobufjs@>=8.0.0 <8.0.2` → `>=8.0.2`

**Why:** `protobufjs@8.0.0` and `8.0.1` contain GHSA-h755-8qp9-cq85 — prototype pollution via
crafted `.proto` payload. Several transitive deps in the tree (gRPC tooling, mobile E2E scaffold)
pull `protobufjs@8.0.0`. The selector-form override bumps only the vulnerable 8.x sub-range to
`>=8.0.2` without touching any `<8.0.0` copies that have a distinct API.

**Drop when:** All transitive consumers declare `protobufjs >=8.0.2` in their own `package.json`,
or the advisory is retracted.

**Owner:** @Skords-01

**Last reviewed:** 2026-06-05

---

## `tmp@<0.2.6` → `>=0.2.6`

**Why:** GHSA-ph9p-34f9-6g65 — `tmp <0.2.6` має path traversal через несанітизований
`prefix`/`postfix`, що дозволяє directory escape за межі тимчасового каталогу. У нашому
tree вразливий `tmp@0.2.5` потрапляв транзитивно через кілька dev-залежників: `detox`
(apps/mobile E2E), `testcontainers` (apps/server integration tests) та `@argos-ci/core`
(apps/web visual regression). Selector form бампає лише вразливу sub-range (`<0.2.6`),
не чіпаючи модерні версії в tree. Патч `tmp@0.2.7` — drop-in, без breaking changes.

**Drop when:** `detox`, `testcontainers` і `@argos-ci/core` оновлять власний transitive
pin на `tmp >=0.2.6`, або advisory буде відкликано.

**Last reviewed:** 2026-06-02

---

## Повний реєстр `pnpm.overrides` (згенеровано звірянням з `package.json`, 2026-08-05)

Прозові секції вище описують частину записів і подекуди цитують застарілі діапазони —
канонічні значення завжди в `package.json → pnpm.overrides`. Таблиця нижче — повний
перелік чинних override-ів; колонка «Прозове обґрунтування» показує, де воно вже є, а де
лишається борг (переважно CVE-пінами, доданими audit-свіпами: селектор сам називає
вразливий діапазон, а значення — пропатчену лінію).

| Override (селектор)              | Форсована версія  | Прозове обґрунтування |
| -------------------------------- | ----------------- | --------------------- |
| `ioredis`                        | `^5.11.1`         | — (борг)              |
| `react-server-dom-webpack`       | `^19.2.8`         | ✅ так                |
| `tar`                            | `^7.5.21`         | ✅ так                |
| `@xmldom/xmldom`                 | `>=0.8.13 <0.9.0` | ✅ так                |
| `serialize-javascript`           | `>=7.0.5`         | ✅ так                |
| `postcss`                        | `>=8.5.18`        | ✅ так                |
| `uuid`                           | `^14.0.0`         | ✅ так                |
| `@tootallnate/once`              | `>=3.0.1`         | ✅ так                |
| `@types/node`                    | `^20.19.41`       | ✅ так                |
| `protobufjs@>=7.0.0 <=7.6.4`     | `^7.6.5`          | ✅ так                |
| `protobufjs@>=8.0.0 <8.4.1`      | `>=8.4.1`         | ✅ так                |
| `esbuild@<0.28.1`                | `>=0.28.1`        | ✅ так                |
| `ajv@>=7.0.0-alpha.0 <8.18.0`    | `>=8.18.0`        | ✅ так                |
| `tmp@<0.2.6`                     | `>=0.2.6`         | ✅ так                |
| `shell-quote@<=1.8.4`            | `>=1.9.0`         | — (борг)              |
| `ws@<=8.20.1`                    | `>=8.21.0`        | — (борг)              |
| `undici@>=6.0.0 <6.28.0`         | `^6.28.0`         | — (борг)              |
| `undici@>=7.0.0 <7.29.0`         | `^7.29.0`         | — (борг)              |
| `undici@>=8.0.0 <8.9.0`          | `^8.9.0`          | — (борг)              |
| `form-data@<=4.0.5`              | `>=4.0.6`         | — (борг)              |
| `immutable@<4.3.9`               | `>=4.3.9`         | — (борг)              |
| `sharp@<0.35.0`                  | `>=0.35.0`        | — (борг)              |
| `brace-expansion@<1.1.18`        | `1.1.18`          | — (борг)              |
| `brace-expansion@>=2.0.0 <2.1.4` | `2.1.4`           | — (борг)              |
| `brace-expansion@>=3.0.0 <5.0.9` | `5.0.9`           | — (борг)              |
| `dompurify`                      | `^3.4.13`         | — (борг)              |
| `js-yaml@>=3.0.0 <3.15.0`        | `3.15.0`          | — (борг)              |
| `js-yaml@>=4.0.0 <4.3.0`         | `4.3.0`           | — (борг)              |
| `qs@>=6.11.1 <6.15.2`            | `6.15.2`          | — (борг)              |
| `axios@>=1.15.2 <1.18.0`         | `>=1.18.0`        | — (борг)              |
| `fast-uri`                       | `^3.1.6`          | ✅ так                |
| `ip-address@<10.3.1`             | `>=10.3.1`        | — (борг)              |
| `browserslist@<4.28.7`           | `>=4.28.7`        | ✅ так                |

Всього: **33** override-ів. Борг на дописування обґрунтувань трекається політикою
[`pnpm-overrides-policy.md`](docs/04-governance/governance/pnpm-overrides-policy.md) § Правила п.1.

---

## `browserslist@<4.28.7` → `>=4.28.7`

**Why:** CVE-2026-73088 (prototype pollution → DoS) і CVE-2026-73089 (необмежений ріст
пам'яті) у `browserslist <4.28.7`. Пакет — dev-транзитив через `@babel/core →
@babel/helper-compilation-targets` у кожному воркспейсі, але потрапляє в образ `Dockerfile.api`,
тож Trivy image scan гейтить його як HIGH. Override піднімає всі копії до 4.28.8 і змінює в
лок-файлі лише сам пакет та його дані про браузери (`caniuse-lite`, `electron-to-chromium`,
`node-releases`, `update-browserslist-db`).

**Drop when:** `@babel/helper-compilation-targets` (через `@babel/core`) оголосить
`browserslist@^4.28.7` або новіше і `pnpm why browserslist -r` не покаже жодної копії `<4.28.7`.

**Last reviewed:** 2026-09-01

## `fast-uri` → `^3.1.6`

**Why:** чотири high-адвайзорі проти `fast-uri <3.1.6`, усі патчаться в `3.1.6`:

| Advisory                                                                                                                                                    | Вразливий діапазон |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8) — host confusion через пропущену IDN-канонікалізацію на scheme-relative посиланнях | `>=3.1.3 <3.1.6`   |
| [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) — SSRF через нормалізацію некоректного IPv6                                        | `>=3.0.0 <3.1.6`   |
| [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf) — SSRF через повторне percent-декодування хоста                                    | `>=3.1.2 <3.1.6`   |
| [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) — host confusion через percent-encoded нормалізацію схеми                          | `>=3.0.0 <3.1.6`   |

Історія цього запису варта окремої згадки, бо вона зворотна до звичайної. Тут override
не **лікував** вразливість, а **тримав** її: він стояв точним піном `3.1.5` без
обґрунтування (у таблиці — «— (борг)»), тож коли 2026-09-02 вийшли ці чотири адвайзорі,
опубліковані вже `3.1.6` і `3.1.7` до дерева не діставалися, і `Dependency audit` став
червоним на `main` та на кожному PR.

**Висновок ширший за цей пакет:** точний пін без записаного «чому» — це не фіксація, а
міна сповільненої дії. Селектор із діапазоном (`^3.1.6`) лагодить те, заради чого пін
ставили, і не блокує патчі. Політика вже цього вимагає — див.
[`pnpm-overrides-policy.md`](docs/04-governance/governance/pnpm-overrides-policy.md)
§ Правила п.1; цей випадок показує, у що обходиться борг на обґрунтуваннях.

**Drop when:** усі споживачі (`ajv`, `fast-json-stringify` і решта fastify-стека)
оголосять `fast-uri@>=3.1.6` самі, і `pnpm why fast-uri -r` не покаже жодної копії
`<3.1.6`.

**Last reviewed:** 2026-09-02
