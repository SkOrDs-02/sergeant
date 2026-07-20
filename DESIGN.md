# DESIGN.md — Sergeant

> **Last touched:** 2026-07-20 by @Skords-01. **Next review:** 2026-10-18.
> **Status:** Active. **Призначення:** портативний конфіг візуальної системи для AI-агентів (Hallmark, frontend-design, Superdesign, будь-який SKILL.md-сумісний тул). Агент читає цей файл ПЕРЕД стилізацією і НЕ вигадує власну систему.
> **Джерело правди:** `packages/design-tokens/tokens.js` + `tailwind-preset.js`. Цей файл — дзеркало для агентів; при розбіжності перемагають токени. Механічний enforcement: `eslint-plugin-sergeant-design` + Hard Rules #8–#17 (`AGENTS.md`).

## Філософія

Теплий, дружній, доступний — Duolingo/Yazio/Monobank school. М'які пастелі + насичені акценти. Кожен колір має семантичну роль у модулі. НЕ: холодні blue-gray, purple-градієнти, glassmorphism, неон-на-темному.

## Палітра

**База:** тепла крем-шкала замість білого/сірого — `cream.50 #fefdfb → cream.500 #e4ccab`. Ніколи чистий `#fff`/`#000` як фон.

**Акцент = модуль** (module-accent containment, Hard Rule #12 — чужий акцент у чужому модулі заборонений):

| Модуль    | primary               | strong (WCAG-AA під text-white) | surface   |
| --------- | --------------------- | ------------------------------- | --------- |
| finyk     | emerald-500 `#10b981` | emerald-700 `#047857`           | `#ecfdf5` |
| fizruk    | cyan-700 `#0e7490`    | cyan-800 `#155e75`              | `#f0fdfa` |
| routine   | coral-500 `#f97066`   | coral-700 `#c23a3a`             | `#fff5f3` |
| nutrition | lime-500 `#92cc17`    | lime-800 `#466212`              | `#f8fee7` |

Правило `-strong`: насичений brand-fill під `text-white` → тільки `-strong` companion (Hard Rule #9). У коді — через `--module-accent-rgb` / `--module-accent-strong-rgb` (ModuleAccentProvider), не хардкод hex.

**Статуси:** success `#10b981` · warning `#f59e0b` · danger `#ef4444` · info `#0ea5e9`. Семантичний колір ≠ акцент модуля.

**Charts:** 8-колірна органічна палітра (`chartPalette` у tokens.js); макро-кільця nutrition: kcal `#f97316`, protein `#3b82f6`, fat `#eab308`, carbs `#22c55e`.

## Темна тема — «Чорнило» (Ink)

Одна глибока зелено-чорна поверхня, глибина з tint + accent border + glow, НЕ з тіні вниз:
bg `#0d1512` · surface `#121c17` · surfaceHi `#17231d` · hairline `rgba(255,255,255,.06)`.
Текст: strong `#f2f6f2` (14.9:1) · body `#e7f0ea` · muted `#8a968e` · subtle `#5f6b64` (лише ≥12px).
Акценти — tier-400 модуля (emerald/cyan/coral/lime-400); текст поверх акцент-філу — завжди ink `#0d1512`, ніколи білий.
Ніколи `dark:shadow-*` і raw light/dark пари в className (Hard Rule #13) — тема через CSS-змінні.

## Типографіка

Display+body: **Manrope Variable** (fallback DM Sans → системний стек). Hero — Manrope-800, tight leading, fluid `clamp()`. Семантична шкала з preset (`fontSize` tokens), 12px floor — менше заборонено (Hard Rule #16). НЕ вводити нові шрифти без зміни токенів.

## Простір, глибина, шари

- **Opacity:** тільки зареєстровані кроки 0, 5, 8, 10, 15…100 (Hard Rule #8) — інші Tailwind мовчки дропає.
- **Elevation e0–e5** парою з **z-tier**: e1 card / e2 hover / e3 popover=z-50 / e4 modal=z-200 / e5 toast=z-300. Правило: найменший рівень, що передає роль; підняв elevation — підняв z-tier. Ніколи `z-[9999]`.
- **Touch targets:** ≥44×44px на coarse pointer — `Button` це робить сам; utility `touch-target`.

## Взаємодія

- Фокус — тільки `focus-visible:` (Hard Rule #14), ring видимий, з'являється миттєво.
- Анімація: бюджет max 2 одночасні, 3 tiers (Hard Rule #17). `transform`/`opacity` only. Без bounce/overshoot на UI.

## Заборонено (анти-slop, enforced лінтом де можливо)

- Arbitrary hex у className (Hard Rule #11) — тільки токени.
- Purple/indigo градієнти, gradient-clip headlines, aurora-blobs, floating orbs.
- Чистий `#fff`/`#000`; Inter/Roboto як display; емодзі як іконки фіч.
- Однаковий padding у всіх секцій; `100vw`; card-in-card без семантики.

## Копірайт (UA)

1-ша особа однини для action-busy, `ти`-звертання, помилки закриті action-prompt'ом. Канон: `docs/01-product/copy/style-guide.uk.md`.

## Глибше

`docs/05-design/design/brandbook.md` · `docs/05-design/design/design-system.md` · `packages/design-tokens/README.md`
