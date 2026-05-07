# PR-20: `patches/` debt без README

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                |
| ------------------ | -------------------------------------------------------------- |
| **Severity**       | Medium (M4)                                                    |
| **Linked finding** | M4 (`00-overview.md`)                                          |
| **Owner**          | TBD (sponsor: @Skords-01)                                      |
| **Effort**         | 0.5 дня                                                        |
| **Risk**           | None (pure documentation)                                      |
| **Touches**        | `patches/`, `package.json`                                     |
| **Trigger**        | next Expo SDK upgrade (PR-22 / M6) — patches треба rebase-нути  |

## Контекст

`patches/` містить наразі:

- `@expo__cli@0.22.28.patch` — single патч на Expo CLI

Жодного README-я. Питання які залишаються без відповіді:

- Який bug fix-иться?
- Де upstream issue / PR?
- Коли patch можна видалити (e.g., upstream version, що містить fix)?
- Хто patch автор / які тести покривають його зміни?

При наступному Expo SDK upgrade розробник побачить `pnpm install` warning про неможливість застосувати patch і не знатиме чи (a) rebase-нути, (b) drop-нути, (c) переписати.

## Scope

### 1. `patches/README.md`

Schema (ESLint-style table, як у `docs/governance/hard-rules.json`):

```markdown
# patches/

| Patch                          | Reason                  | Upstream                          | Drop when                          | Owner        |
| ------------------------------ | ----------------------- | --------------------------------- | ---------------------------------- | ------------ |
| `@expo__cli@0.22.28.patch`    | <fill>                  | https://github.com/expo/expo/...  | Expo CLI ≥ 0.X.Y                   | `@Skords-01` |
```

Кожен entry — 5 обов'язкових полів. Додати freshness-gate у `scripts/` перевірятиме що:

1. Кожен `patches/*.patch` має row у таблиці.
2. Patch без owner-а провалює CI.

### 2. `scripts/check-patches-doc.mjs`

```js
// Parses patches/README.md table, lists patches/*.patch
// Fails if any patch has no row or any row has empty Owner / Drop-when
```

Hook in `pnpm lint:patches` + CI step.

### 3. Renovate hint

Додати у `.github/renovate.json5` (якщо існує) — позначити patched packages щоб Renovate piped-ові оновлення видавали окрему prio.

## Out of scope

- Повне переписування patches на upstream-PR-и — окрема per-patch робота.

## Acceptance criteria (DoD)

- [ ] `patches/README.md` з заповненою таблицею (≥1 row на існуючий patch).
- [ ] `scripts/check-patches-doc.mjs` + `pnpm lint:patches`.
- [ ] CI step `lint:patches` у `.github/workflows/ci.yml`.
- [ ] Тест: `scripts/__tests__/check-patches-doc.test.mjs` з 3 fixture-ами (valid / missing-row / empty-owner).

## Тести

- `scripts/__tests__/check-patches-doc.test.mjs` — node:test integration, fixture-based.

## Rollout

- Single PR. Pure docs + CI gate.

## Risks & mitigations

| Risk                                                       | Mitigation                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Author unknown for existing patch — не можемо заповнити Owner | git blame на `patches/*.patch` визначає author; fallback `@Skords-01` |

## Touchpoints (file:line)

- `patches/@expo__cli@0.22.28.patch` — existing
- `patches/README.md` — new
- `scripts/check-patches-doc.mjs` — new
- `scripts/__tests__/check-patches-doc.test.mjs` — new
- `.github/workflows/ci.yml` — add lint:patches step
- `package.json` — add npm-script `lint:patches`

## Refs

- [pnpm patch documentation](https://pnpm.io/cli/patch)
- ADR на patch-policy (нема, цей PR — proxy-document)
