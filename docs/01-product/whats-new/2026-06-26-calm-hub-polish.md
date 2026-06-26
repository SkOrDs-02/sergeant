# 2026-06-26 — Спокійніша головна, демо-режим і розумніший асистент

> **Last touched:** 2026-06-26 by @dimastahov16012003. **Next review:** 2026-09-24.
> **Status:** Active

> **Modal id:** `2026-06-26-calm-hub-polish` —
> [`apps/web/src/core/whatsNew/releases.ts`](../../../apps/web/src/core/whatsNew/releases.ts)

## TL;DR

Головний екран став спокійнішим: модулі — на першому місці, з'явився режим «тиша»
і дзвіночок сповіщень. Демо-режим тепер чітко позначений, з нього легко вийти.
AI-асистент зберігає те, що ти йому диктуєш, прямо у відповідні розділи. Дні,
нагадування й статистика рахуються за київським часом. І велика хвиля поліпшень
доступності — контраст, читачі екрана, клавіатура.

## Items

- **Feature** — Спокійніша головна: модулі першими, режим «тиша» і дзвіночок сповіщень.
- **Feature** — Демо-режим чітко позначений, а вийти з нього можна одним дотиком по бейджу.
- **Improvement** — AI-асистент зберігає твої записи прямо в розділи: харчування, тренування, фінанси.
- **Improvement** — Дні, нагадування й статистика тепер рахуються за київським часом.
- **Fix** — Велика хвиля доступності: контраст, читачі екрана, навігація клавіатурою, менше зайвих анімацій.

## Чому

Консолідований запис за період 2026-05-07 .. 2026-06-26 (попередній реліз —
`2026-05-06-cold-start`). Драйвери:

- **Calm hub** — `feat(web): calmer hub home — modules-first + calm mode + notification bell`.
- **Demo mode** — `feat(web): consistent, clearly-marked demo mode` (#3729) + demo-badge exit.
- **AI dual-write** — серія #3641/#3646/#3647/#3679 (chat-action writes через canonical SQLite),
  див. [[project_ai_chat_dualwrite_bypass]] контекст.
- **Kyiv time** — серія Kyiv-anchor fix-ів (finyk overview, routine reminders, insights).
- **A11y wave** — QA pass-1..12: контраст HC AA, `inert` modal background (#3632),
  touch-target floor, alertdialog/landmark roles, reduced-motion, skip-link (#3621).

## Метрики

- PostHog 7 днів після показу: `whats_new_shown → whats_new_cta_clicked` funnel
  (ціль `d7_returning_user_engagement_with_whats_new ≥ 30%`, PR-18 acceptance).
- Fail-сигнал: різке зростання `whats_new_dismissed{via:"close"}` без CTA-кліків →
  копія не резонує, переглянути формулювання у наступному релізі.
