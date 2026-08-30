---
name: sergeant-copy-and-tone
description: Use when writing or reviewing Ukrainian user-facing copy — buttons, error messages, empty states, toasts, onboarding texts; UA: пишеш UA-текст інтерфейсу, помилки, тости, кнопки.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# UA-копірайтинг у Sergeant

Кожен новий кирилічний JSX-literal у `apps/web` / `apps/landing` / `apps/mobile` пишеться за каноном тону: [docs/01-product/copy/style-guide.uk.md](../../../docs/01-product/copy/style-guide.uk.md). Не імпровізуй «ввічливий» generic-тон — у гайда є hard rules, порушення = баг.

## Обовʼязково перед написанням тексту

- Прочитай § 1 Hard rules і § 7 Заборонені слова гайда — там точні правила, не переказуй їх по памʼяті.
- Ключові опори: «ти»-звертання; 1-ша особа однини для action-busy станів; помилка = структура «що сталось → що зробити» (action-prompt-closed, § 3); кнопка — інфінітив, наказова — у прозі (§ 4).
- Числа, дати, валюта — § 8 (гривня, кома як десятковий розділювач, формат дат).

## Мапа поверхонь

- Web: JSX-literals у `apps/web/src/**` (модулі + `core/`), landing — `apps/landing/src/**`.
- Push-тексти: `apps/server/src/modules/push/` — теж підпадають під гайд.
- Тексти Telegram-ботів: `apps/server/src/modules/telegram/` (`betaTexts.ts`).

## Червоні прапорці

- «Помилка. Спробуйте пізніше» — без наступного кроку для користувача (порушує § 3).
- Калька з EN («Ваш запит було успішно оброблено») замість живої короткої фрази.
- Мішанина «ви»/«ти» в одному екрані.

## Роутинг далі

- Технічні правила поверхні: `sergeant-web-ui` (a11y, дизайн-система).
- Оновлення самого гайда — § 10 гайда (процедура, не правити мовчки).
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
