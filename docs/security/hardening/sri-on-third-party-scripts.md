# SRI на сторонні `<script src>` (S3)

> **Last validated:** 2026-06-02 by @claude. **Next review:** 2026-09-02.
> **Status:** Active

| Поле               | Значення                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **Severity**       | **P1** (audit § S3 — ризик ще не активний, фіксуємо до того, як хтось додасть inline CDN-snippet) |
| **Threat model**   | **T, I** — Tampering → CDN supply-chain ([`threat-model.md`](../threat-model.md) `T`-row)         |
| **Discovered**     | 2026-05-13 (`docs/audits/2026-05-13-security-observability-roast.md` § S3)                        |
| **Enforced by**    | `sergeant-design/sri-on-third-party-script` (ESLint), `pnpm lint:html-sri` (path-based gate)      |
| **Affected files** | `apps/web/index.html`, `apps/web/vercel.json` (CSP allowlist)                                     |

## Проблема

CSP-allowlist у [`apps/web/vercel.json`](../../../apps/web/vercel.json) (`script-src`)
пропускає `https://*.posthog.com`, `https://*.sentry-cdn.com`,
`https://js.sentry-cdn.com`. Сьогодні жоден із цих тегів **не** вантажиться
статично з `index.html` — PostHog / Sentry приходять через npm-bundle, тож
правило чисте на `main`.

Але якщо майбутній PR додасть
`<script src="https://cdn.example.com/x.js">` **без** `integrity=`, це
одношагово відкриє supply-chain XSS: компроміс будь-якого allowlisted-CDN
(або MITM на trusting-on-first-use HTTPS) інжектить довільний код, що
**bypass-ить** наш CSP report-only/enforce pipeline. Закриває STRIDE-row
_Tampering → CDN supply-chain_ у [`threat-model.md`](../threat-model.md).

## Правило

Кожен **cross-origin** `<script src="https://…">` (а також schema-relative
`//cdn…`) у `apps/**/index.html` мусить нести:

- `integrity="sha384-<base64>"` — SRI-цифровий відбиток. W3C SRI § 3.5
  рекомендує **SHA-384** як baseline; `sha256` / `sha512` теж приймаються.
  Multi-hash (кілька відбитків через пробіл) дозволено.
- `crossorigin="anonymous"` — без CORS браузер **мовчки** пропускає
  integrity-перевірку, що нівелює весь захист. `use-credentials` теж валідний.

**НЕ** флагуються (контролюються нашим Vite-build + CSP `'self'`):

- локальні / відносні джерела — `src="/src/main.tsx"`, `src="./x.js"`;
- inline `<script>` без `src` (включно з `<script type="module">` нижче).

### Де enforce

- **ESLint:** `sergeant-design/sri-on-third-party-script` — parse5 над сирим
  HTML-текстом. Юніт-тести + фікстури:
  `packages/eslint-plugin-sergeant-design/__tests__/sri-on-third-party-script.test.mjs`.
- **Path-based gate:** `pnpm lint:html-sri` (`scripts/lint-html-sri.mjs`) —
  той самий контракт без `pnpm install`, дешево тримати у PR-CI.

## Як згенерувати SHA-384-хеш

Завантаж точний файл, який вантажитиме CDN, і порахуй відбиток:

```bash
curl -sSL https://cdn.example.com/x.js \
  | openssl dgst -sha384 -binary \
  | openssl base64 -A
```

Результат встав у тег із префіксом алгоритму:

```html
<script
  src="https://cdn.example.com/x.js"
  integrity="sha384-<output-зверху>"
  crossorigin="anonymous"
></script>
```

## Як bumпати при оновленні CDN-версії

SRI прив'язаний до **байт-у-байт** вмісту: щойно CDN-версія змінюється
(`x@1.2.3` → `x@1.2.4`), хеш стає невалідним і браузер **відмовиться**
виконувати скрипт (fail-closed — це і є мета). При апдейті:

1. Онови URL (наприклад, нову версію у path / query).
2. Перерахуй `integrity` командою вище для **нового** URL.
3. Заміни і `src`, і `integrity` в одному коміті — ніколи не лишай
   старий хеш на новому URL.
4. Якщо CDN віддає той самий файл під кількома алгоритмами — додай їх через
   пробіл (`integrity="sha384-… sha512-…"`), браузер вибере найсильніший.

## Пов'язане

- [`threat-model.md`](../threat-model.md) — STRIDE `T`-row (Tampering → CDN
  supply-chain).
- [`C2-frontend-csp.md`](./C2-frontend-csp.md) — CSP allowlist, що робить ці
  CDN-и досяжними; SRI — друга лінія оборони за нею.
