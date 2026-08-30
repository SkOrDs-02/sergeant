---
name: sergeant-feature-flags
description: Use when adding, changing, or removing a feature flag — build-time VITE_*, server env flags, user FLAG_REGISTRY, kill-switch; UA: додаєш, міняєш чи знімаєш фіче-прапорець.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Feature flags у Sergeant

Єдиний реєстр усіх тумблерів — [docs/02-engineering/architecture/feature-flags.md](../../../docs/02-engineering/architecture/feature-flags.md): чотири системи, дефолти, що ламається при протилежному значенні і **умова зняття**. Читай його ПЕРЕД додаванням прапорця — там же критерій вибору системи.

## Чотири системи (вибір — § 1 реєстру)

1. **Build-time клієнт (`VITE_*`)** — вшивається в бандл на білді; ніколи не секрет (§ «Чому саме префікс VITE_»). Пастка: dead-code elimination — § 2 реєстру.
2. **Runtime сервер (env)** — Coolify env vars; найризикованіша група — AI-маршрутизація і вартість (§ 3.1).
3. **Користувацькі (`FLAG_REGISTRY`)** — per-user перемикачі (§ 4).
4. **In-memory kill-switch** — аварійне вимкнення без redeploy (§ 5).

## Обовʼязковий процес

- Новий прапорець → рядок у реєстрі **у тому ж PR**: система, дефолт, що ламається, умова зняття (§ 6 «Як додати новий прапорець»). Playbook: [add-feature-flag.md](../../../docs/00-start/playbooks/add-feature-flag.md).
- Прапорець без умови зняття — це не тумблер, а вічний борг: § 7 реєстру трекає відомий борг.
- Знімаєш прапорець → прибери і рядок реєстру, і мертву гілку коду (не лишай `if (true)`).

## Червоні прапорці

- Секрет у `VITE_*` — він поїде в публічний бандл.
- Читання прапорця в кількох місцях із різними дефолтами — дефолт живе в одному місці.
- Новий прапорець «тимчасово, приберу потім» без дати/умови зняття в реєстрі.

## Роутинг далі

- Деплой/env-механіка: `sergeant-deploy-and-observability`; клієнтський код: `sergeant-web-ui`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
