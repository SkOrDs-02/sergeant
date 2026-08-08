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

## Мобільна стратегія (ADR-0052)

**Capacitor = primary production path. Expo = parallel path без дати sunset.**

- PR не повинен ламати жоден із шляхів.
- Sunset Expo → Capacitor відбудеться лише коли Expo досягне feature parity ≥18 з поточної кількості рядків у matrix (поріг з ADR-0052). **Не бери число з пам'яті і не з цього рядка** — актуальна матриця живе в [`docs/02-engineering/architecture/platforms.md`](../../../docs/02-engineering/architecture/platforms.md) (§ «Feature-parity матриця», рахуй рядки звідти); поріг уже досягнуто, тож питання «чи планувати sunset» — рішення founder-а, а не автоматичний наслідок. Агент його не ухвалює самостійно.
- `forbid-shell-only-feature` lint rule активний: legitimate shell-glue PRs дозволені; feature-only в shell без відповідного Expo PR — ні.

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
- Якщо змінилися навігація чи deep-link-и — перевір відповідні доки у `docs/02-engineering/mobile/`.
- Якщо зміна — це порт web-фічі, підтверди, які частини лишаються спільними, а які — platform-specific.
- Перевір, що зміна не ламає Capacitor-шлях (якщо relevant).

## Playbooks

- `docs/00-start/playbooks/release.md` — canonical release-playbook (секції Expo і Capacitor shell).
- Каталог: `docs/00-start/agents/agent-skills-catalog.md`.
