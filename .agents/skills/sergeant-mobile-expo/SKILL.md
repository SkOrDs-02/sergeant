---
name: sergeant-mobile-expo
description: Use when editing Sergeant Expo screens, React Native, mobile navigation, MMKV flows, Capacitor shell, or web→mobile ports; also for platform-specific bugs; UA: правиш Expo/RN/MMKV/Capacitor/mobile-shell.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Mobile Expo у Sergeant

Sergeant mobile — не тонка копія web-app-у. Він використовує Expo Router, NativeWind, mobile-storage-патерни і platform-specific обмеження, які мають лишатися окремими від `apps/web`.

## Що покриває

- `apps/mobile/**`
- `apps/mobile-shell/**`
- shared domain-packages, коли зміна mobile-driven

## Мобільна стратегія ([ADR-0094](../../../docs/governance/adr/0094-mobile-web-first-freeze.md))

**Обидва стеки — `apps/mobile` (Expo) і `apps/mobile-shell` (Capacitor) — на паузі з 2026-08-25. Web-first.**

Це рішення власника, не технічне обмеження, і агент його не переглядає. Питають «чи варто зараз вкладатись у мобайл», «додаймо новий екран у `apps/mobile`», «який стек основний» — відповідь іде звідси, а не з інженерної оцінки поверхні.

- **Пауза — не sunset і не deprecation.** Код обох стеків лишається активом на момент розморозки: не видаляється, не позначається застарілим, і `typecheck` + Jest для `@sergeant/mobile` далі гейтять `main` у джобі `check`. «Не вкладаємось у мобайл» і «мобайлу можна ламати збірку» — різні речі; друге не діє.
- **Питання «хто primary» під паузою предмета не має.** Воно повертається окремим ADR на момент розморозки. Попереднє «Capacitor = primary production path, Expo = parallel» — це [ADR-0052](../../../docs/governance/adr/0052-mobile-strategy-capacitor-primary.md), superseded 2026-09-13; читай його як історію, не як інструкцію.
- **Питання sunset Expo так само закрите.** Поріг feature-parity з ADR-0052 більше нічого не запускає: під паузою sunset не активується за визначенням. Не пропонуй його як наслідок parity-матриці з [`platforms.md`](../../../docs/engineering/architecture/platforms.md) — сама матриця лишається довідкою про стан портування, а рішення належить founder-у.
- **Баг-фікс і підтримка збірки дозволені**, продуктовий розвиток — ні. Якщо задача виглядає як нова мобільна фіча, спершу скажи, що контур на паузі, і спитай founder-а; не плануй роботу мовчки.
- `forbid-shell-only-feature` lint rule лишається активним: legitimate shell-glue PRs дозволені; feature-only в shell без відповідного Expo PR — ні. Правило чинне саме як guard симетрії, а не як вимога розвивати обидва стеки.

> **AI-DANGER: перелік заморожених напрямів не дублюй тут.** Канонічний перелік і порядок розморозки — [`docs/work/specs/tech-debt/mobile.md`](../../../docs/work/specs/tech-debt/mobile.md). Другий список розійдеться з першим, і це вже коштувало знахідки P1 (PR-M2 огляду 2026-09-13): рішення про паузу (2026-08-25) три тижні жило лише в шапці tech-debt-нотатки, поки єдиний ADR про мобільну стратегію стверджував протилежне.

## Жорсткі правила

- Трактуй NativeWind і Tailwind як споріднені, але не взаємозамінні.
- Використовуй mobile-storage-конвенції (MMKV або наявний persistence-шар); не переноси припущення raw web-localStorage.
- Тримай DOM- і browser-only API подалі від mobile-коду.
- Кожен `_layout.tsx` — навігаційна межа; route-зміни мають дотримуватися структури Expo Router.

## Розміщення

- cross-platform бізнес-логіка → domain-packages під `packages/*-domain`
- mobile-app UI і навігація → `apps/mobile/**`
- Capacitor packaging-glue лише → `apps/mobile-shell/**`

## Верифікація

- Прогон найближчого Jest-покриття для зачепленої mobile-поверхні.
- Якщо змінилися навігація чи deep-link-и — перевір відповідні доки у `docs/engineering/mobile/`.
- Якщо зміна — це порт web-фічі, підтверди, які частини лишаються спільними, а які — platform-specific.
- Перевір, що зміна не ламає Capacitor-шлях (якщо relevant).

## Playbooks

- `docs/start/instructions/release.md` — canonical release-playbook (секції Expo і Capacitor shell).
- Каталог: `docs/start/agents/agent-skills-catalog.md`.
