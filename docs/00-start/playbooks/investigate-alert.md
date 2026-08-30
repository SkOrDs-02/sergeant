# Playbook: Розслідування alert-у

> **Last touched:** 2026-08-30 by @Skords-01. **Next review:** 2026-12-05.
> **Status:** Active

**Trigger:** спрацював Prometheus alert / росте Sentry issue / підозрілі 5xx, latency або деградація health-ендпоїнтів, але ще не очевидно, чи це інцидент, false positive або транзитний шум.

## Owner surface

- Primary surface: observability та runtime-діагностика.
- Governing skill: `sergeant-deploy-and-observability`.

## Required context

- Спершу `sergeant-start-here`, потім `sergeant-deploy-and-observability`.
- Якщо після triage це вже user-visible outage — перемикай на [`hotfix-prod-regression.md`](./hotfix-prod-regression.md). Якщо потрібно явно оголосити інцидент — [`declare-incident.md`](./declare-incident.md).

## Steps

### 1. Збери сигнал

- Назва alert-у або Sentry issue.
- Початок у часі та тривалість порушення.
- Severity, уражена поверхня (surface), контекст останнього deploy/config-змін.

> **Якщо це AI-шлях — у Sentry буде порожньо, і це не означає «немає
> проблеми».** Помилки Anthropic/OpenRouter приходять як `ExternalServiceError`
> (502/503), тобто operational, а `errorHandler` капчить у Sentry лише
> НЕ-operational 5xx. Тому аутедж провайдера не створює жодного issue. Дивись
> натомість: `ai_requests_total{outcome="error"}`, `ai_first_token_ms` (TTFT) і
> pino-лог `chat_stream_failed_empty`. Те саме застереження діє для пошуку в
> логах: доставка в Loki зламана (див. `SLO.md § Зламано`), тож відсутність
> рядків там нічого не доводить.

### 2. Відокрем signal від noise

- Чи це одноразовий spike, чи стійка деградація.
- Чи є вплив на користувачів, SLO, health-ендпоїнти або revenue path.
- Чи це відомий noisy monitor, чи новий failure mode.

### 3. Знайди найближчу зміну

- Останній deploy відповідної поверхні.
- Зміни env-змінних або config-файлів.
- Деградація зовнішніх залежностей.
- Недавня міграція, cron-робота, n8n або HubChat rollout.

### 4. Прийми рішення

- Закрити як noise.
- Продовжити спостереження.
- Завести follow-up баг.
- Ескалювати до hotfix / incident.

## Verification

- [ ] Alert класифіковано: noise, follow-up або incident.
- [ ] Записано suspected або confirmed cause.
- [ ] Якщо потрібен fix — відкрито або виконано наступний playbook (`hotfix-prod-regression.md` / `declare-incident.md`).
- [ ] Runtime evidence зібрана, а не припущена.

## Коли цей playbook не застосовується

- Вже йде активний outage response — відкривай [`declare-incident.md`](./declare-incident.md) або [`hotfix-prod-regression.md`](./hotfix-prod-regression.md).
- Потрібно полагодити локальний тест або CI — є окремий [`fix-failing-ci.md`](./fix-failing-ci.md).

## Related playbooks and skills

- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [fix-failing-ci.md](./fix-failing-ci.md)
- Skill: `sergeant-deploy-and-observability`
