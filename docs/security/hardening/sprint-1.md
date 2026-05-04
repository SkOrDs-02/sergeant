# Sprint 1 — Critical + найгірші High

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active (in flight — H2 closed, C2 Phase 1 closed, C1 + H1 still open)

**Тривалість:** 1–2 тижні (target close: 2026-05-17).
**Сумарний effort:** ~2.5 person-days.

## Скоуп

| ID                                       | Title                                                                            | Severity | Effort | Owner    | Status                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------- | -------- | ------ | -------- | -------------------------------------- |
| [C1](./C1-mono-webhook-secret-in-url.md) | Mono webhook secret з URL → header + sanitize logs + rotate                      | Critical | 1d     | backend  | Open                                   |
| [C2](./C2-frontend-csp.md)               | Додати CSP у `vercel.json` (Report-Only → Enforce)                               | Critical | 0.5d   | frontend | **Phase 1 closed** (2026-05-04) — soak |
| [H1](./H1-mobile-bearer-storage.md)      | Capacitor secure-storage AC + `android:allowBackup="false"`                      | High     | 0.5d   | mobile   | Open                                   |
| [H2](./H2-dependabot.md)                 | Створити `.github/dependabot.yml` (npm + actions + docker) + auto-merge workflow | High     | 0.5h   | devops   | **Closed** (2026-05-04)                |

## Чому саме ці чотири разом

- **C1 + C2** — два Critical, обидва закривають **post-XSS / post-leak exfiltration paths**, які перетворюють локальну помилку у повний компроміс акаунту. Обидва дешеві у фіксі (header rename + JSON-rule).
- **H1** — мобільний bearer тримається на default Keychain accessibility, що дозволяє iCloud-sync на чужий пристрій. Картка **залежить** від C1 у тому сенсі, що `bearer = ключ доступу до webhook-secrets` — поки C1 не закрите, leakage-шлях лишається відкритим.
- **H2** — Dependabot — найдешевший single-shot win проти supply-chain (одна YAML, одне PR-апрув). Без нього всі решта sprint-ів — реактивні.

## Що міряємо як «success»

- C1: `grep -R "/api/mono/webhook/" Sentry|Loki|Railway-access-logs` за тиждень після rotation = **0 results** з валідним секретом.
- C2: CSP-Report-Only працює > 5 днів у production без false-positive з нашого PostHog/Sentry/Vercel-аналітики; після цього → CSP-Enforce без regress.
- H1: Manual test — встановити app на iPhone-A, зайти, вимкнути iCloud Keychain backup → зайти на iPhone-B з тим же AppleID → токен **не** sync-нувся (експеримент проводиться на тестовому акаунті).
- H2: Перший Dependabot-PR з'явився протягом 7 днів, security-update auto-merge passed CI.

## Залежності та ризики

- C1 потребує **узгодження з Monobank** про новий webhook-URL формат (`X-Mono-Webhook-Secret` header). Якщо Monobank API не підтримує custom-headers — fallback на body-mode або path-mode з middleware-redaction.
- C2 потребує продакшн-інвентаризації всіх 3rd-party-загрузок (PostHog, Sentry, Vercel Analytics, Stripe-якщо-є) перед написанням `connect-src`.
- H1 не блокує реліз mobile shell, але вимагає **bump version** + новий store-submission (iOS App Store review = 1–3 дні).

## Перехресні посилання

- [README](./README.md) — індекс беклогу.
- [docs/security/vulnerability-sla.md](../vulnerability-sla.md) — SLA для Critical = 24h на acknowledge + 14d на fix.
- [docs/audits/2026-04-28-implementation-roadmap.md](../../audits/2026-04-28-implementation-roadmap.md) — попередній roadmap (для крос-контексту).
