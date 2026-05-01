# Playbook: Investigate Alert

> **Last validated:** 2026-05-01 by @Skords-01. **Next review:** 2026-07-30.
> **Status:** Active

**Trigger:** Prometheus alert спрацював / Sentry issue росте / підозрілі 5xx, latency або health degradation, але ще не очевидно, чи це incident, false positive або transient noise.

## Owner surface

- Primary surface: observability and runtime diagnostics
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-deploy-and-observability`.
- Якщо після triage це вже user-visible outage, переключись на [`hotfix-prod-regression.md`](./hotfix-prod-regression.md).

## Steps

### 1. Збери сигнал

- Назва alert або issue.
- Початок у часі.
- Severity, affected surface, deploy/config context.

### 2. Відокрем signal від noise

- Це одноразовий spike чи стійка деградація.
- Є impact на users, SLO, health endpoints або revenue path.
- Це known noisy monitor чи новий failure mode.

### 3. Знайди найближчу зміну

- Останній deploy.
- Env/config changes.
- External dependency degradation.
- Migration, cron, n8n або HubChat rollout.

### 4. Прийми рішення

- close as noise
- keep observing
- file follow-up bug
- escalate to hotfix / incident

## Verification

- [ ] Alert класифіковано: noise, follow-up, incident
- [ ] Є записаний suspected cause або confirmed cause
- [ ] Якщо потрібен fix, створено або виконано наступний playbook
- [ ] Runtime evidence зібрана, а не припущена

## When not to use this playbook

- Уже йде активний outage response.
- Потрібно лагодити конкретний локальний тест або CI.

## Related playbooks and skills

- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [fix-failing-ci.md](./fix-failing-ci.md)
- Skill: `sergeant-deploy-and-observability`
