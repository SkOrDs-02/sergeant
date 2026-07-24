# Rule 16 — Typography scale — semantic styles + 12px floor

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #16. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/04-governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`
- `packages/design-tokens/**`

## Enforced by

- **convention** — packages/design-tokens/tailwind-preset.js → plugins.semanticTypography (.text-style-\* utilities are the canonical type slots)
- **doc** — docs/05-design/design/design-system/02-typography.md § Типографічна шкала

## Why / What is enforced

> Why a hard rule? Drift on the type scale is invisible until it isn't. Two PRs landed `text-3xs` (9px) on touch targets despite Hard Rule #4-style review (`docs/90-work/audits/archive/2026-04-28-ux-ui-audit.md` § Typography utilities неконсистентні). Codifying the floor and the named-style contract closes the gap.

**Use one of the semantic `.text-style-*` utilities whenever a slot has a documented role.** The utilities live in `packages/design-tokens/tailwind-preset.js → plugins.semanticTypography` and bundle font-size, line-height, weight, letter-spacing, and casing so layouts can't drift on any single axis (e.g. shipping the hero size with the wrong weight).

**Canon — the scale is a CLOSED set of eight roles.** `display / headline / title / body / label / caption / overline / code`. Пікселі не є роллю: «той самий розмір» ≠ «та сама роль» — обирай слот за композиційною роллю елемента (заголовок / тіло / лейбл / кікер / число-статистика), не за тим, у скільки пікселів він випадково рендериться. **Нову роль додає лише дизайн-вердикт** (цикл 5–6 дизайн-аудиту закрив шкалу на восьми; спроба злити `overline` у `caption` поверне hand-rolled uppercase-комбінації, які лінт забороняє). Розриви між сусідніми ролями (напр. `title` 22px → `headline` 26px) — навмисні: контрол-size-варіанти, що раніше плавно масштабували текст, тепер лягають на найближчу роль.

| Utility                | Contract (min→max / lh / weight / tracking) | Slot                                      |
| ---------------------- | ------------------------------------------- | ----------------------------------------- |
| `.text-style-display`  | 40→64 / 1 / 800 / -0.03em                   | Hero-число, celebration-лічильник         |
| `.text-style-headline` | 26→36 / 1.15 / 700 / -0.02em                | Page H1, hero stat number                 |
| `.text-style-title`    | 18→22 / 1.3 / 600 / -0.01em                 | Section heading, card / dialog title      |
| `.text-style-body`     | 15→16 / 1.55 / 400                          | Body copy, input / textarea text          |
| `.text-style-label`    | 13→14 / 1.4 / 500 / 0.005em                 | Form label, button / tab / menu-item text |
| `.text-style-caption`  | 12 / 1.4 / 400 / 0.005em                    | Helper text, metadata, hints, timestamps  |
| `.text-style-overline` | 12 / 1.4 / 600 / 0.08em / UPPER             | Section kicker / eyebrow                  |
| `.text-style-code`     | 13→14 / 1.5 / 500 / mono                    | Inline code, monospace stat value         |

> `.text-style-hero` лишається back-compat аліасом `headline`; новий код бере `headline`. Гліф-розміри (емодзі-іконка, ініціали аватара, число всередині progress-ring, лічильник streak-вогника) — це РОЗМІР СИМВОЛА під контейнер, НЕ типографічна роль: лишай `text-<size>` з коментарем `/* icon-size, not type */` або `/* glyph scales with container, not a type role */`.

**Floor: 12px (`text-style-caption` / `text-xs`).** `text-3xs` (9px) is removed from the scale; `text-2xs` (10px) is reserved for chart axis ticks and decorative metadata badges (timestamps, badge counts) — never primary content. Anything a user has to read to take an action MUST clear 12px.

**What this rule blocks:**

- New `text-3xs` classes (the token no longer resolves and Tailwind silently drops the class).
- `text-2xs` on primary body copy or button labels — bump to `text-xs` / `.text-style-caption`.
- Bespoke `text-* font-* tracking-* uppercase` combos that re-implement an existing `.text-style-*` utility. Reach for the named utility instead so future retunes propagate from one place.

The `.text-style-overline` utility is the canonical way to render kickers; module-headers that need `text-brand-700` may keep the hand-rolled span (with the existing `// eslint-disable-next-line sergeant-design/no-eyebrow-drift` justification) until SectionHeading exposes a brand-tinted variant.

## Related

- **doc** — docs/90-work/audits/archive/2026-04-28-ux-ui-audit.md
- **agents** — #16

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                                            | Merged     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| [#432](https://github.com/Skords-01/Sergeant/pull/432)   | refactor(web): цикл 6 стадія 1 — семантичні типографічні ролі у shared/ui        | 2026-07-24 |
| [#3536](https://github.com/Skords-01/Sergeant/pull/3536) | docs(docs): doc-layer wave 2 — genre contract, monolith splits, hardening matrix | 2026-06-12 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
