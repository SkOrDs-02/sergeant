---
name: sergeant-mobile-expo
description: Use when editing Sergeant Expo screens, React Native, mobile navigation, MMKV flows, Capacitor shell, or web→mobile ports; also for platform-specific bugs; UA: правиш Expo/RN/MMKV/Capacitor/mobile-shell.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Mobile Expo у Sergeant

Sergeant mobile — не тонка копія web-app-у. Він використовує Expo Router, NativeWind, mobile-storage-патерни і platform-specific обмеження, які мають лишатися окремими від `apps/web`.

## Що покриває

- `apps/mobile/**`
- `apps/mobile-shell/**`
- shared domain-packages, коли зміна mobile-driven

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
- Якщо змінилися навігація чи deep-link-и — перевір відповідні доки у `docs/mobile/`.
- Якщо зміна — це порт web-фічі, підтверди, які частини лишаються спільними, а які — platform-specific.

## Playbooks

- `docs/playbooks/release.md` — canonical release-playbook (секції Expo і Capacitor shell).
- Каталог: `docs/agents/agent-skills-catalog.md`.
