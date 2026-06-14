# Session log — 0018 `agent:find` semantic (Voyage) measurement (2026-06-14)

> **Last touched:** 2026-06-14 by @Skords-01. **Next review:** 2026-09-12.
> **Status:** Reference

Комплемент до [lexical-логу 2026-06-08](./session-log-0018-agent-find-measurement-2026-06-08.md):
закриває **відкладений semantic-замір** останнього DONE-критерію [Ініціативи 0018](./0018-agent-semantic-retrieval.md).
Документ — рукописний (НЕ auto-generated).

---

## Середовище заміру

- Дата: 2026-06-14, ізольований git-worktree монорепо.
- `VOYAGE_API_KEY` — **присутній**, інжектиться через `railway run` (Project: Sergeant / production);
  значення в логах не друкувалось.
- Акаунт Voyage — **free-tier без платіжного методу** → cap **3 RPM / 10K TPM**. Дефолтний
  `pnpm agent:embed` (батч 96 + компаундні retry в межах одного хвилинного вікна) пробиває
  ліміт → `HTTP 429`. Обхід — разовий throttled-ембедер (малі батчі ~3.7K ток, пауза 25с,
  інкрементальне збереження кешу). **Це не token-volume проблема**: усі 548 чанків — лише
  ~44K токенів сумарно (медіана 37 ток/чанк); справа в pacing під free-tier RPM/TPM.
- Node 22.x; `node_modules` довстановлено `pnpm install --frozen-lockfile`.

> **Дія на майбутнє.** `agent:embed` зашитий у `docs:gen-daily` (щоденний regen індексу).
> Поки акаунт Voyage без білінгу, той cron теж впиратиметься в 3 RPM/10K TPM. Додавання
> платіжного методу знімає cap — тоді й regen, і повторні заміри йдуть без throttle.

---

## Крок 1 — ембедінг

```text
pnpm agent:embed (throttled)  →  548/548 chunk(s) → voyage-3.5-lite (1024-d)
.cache/retrieval/vectors.json  →  548 vectors (gitignored, out-of-git per ADR-0066)
```

## Крок 2 — semantic vs lexical на golden-set (12 кейсів, K=5)

`pnpm agent:find "<query>" --json --k 5` у двох режимах на тому самому committed-маніфесті:
`--lexical` (форсований) vs default (semantic, бо ключ + кеш присутні). `mode` у відповіді
кожного з 12 семантичних викликів = `semantic` — **degradation у lexical не спрацьовував жодного разу**.

| Метрика            | Lexical | Semantic  |
| ------------------ | ------- | --------- |
| recall@5           | 1.000   | 1.000     |
| MRR                | 0.917   | **0.958** |
| semantic-mode hits | —       | 12/12 ✅  |

Per-case ранги (`lexRank` → `semRank`; нижче = краще, 1 = ідеально):

| #   | Query                                            | lexRank | semRank |
| --- | ------------------------------------------------ | ------- | ------- |
| 1   | coerce bigint balance to number in serializer    | 1       | 1       |
| 2   | react query keys centralized factory             | 1       | 1       |
| 3   | add a new server api endpoint with contract test | 1       | 1       |
| 4   | sql migration sequential two-phase drop          | 1       | 1       |
| 5   | tailwind opacity scale steps                     | 1       | 1       |
| 6   | focus visible accessibility indicator            | **2**   | **1**   |
| 7   | no openclaw personal access tokens in production | 1       | 1       |
| 8   | pino logger redaction sensitive fields           | 2       | 2       |
| 9   | working on web ui pwa tailwind component         | 1       | 1       |
| 10  | fix a regression bug that used to work           | 1       | 1       |
| 11  | playwright end to end smoke test                 | 1       | 1       |
| 12  | agent semantic retrieval find index              | 1       | 1       |

---

## Висновок

- **Semantic-режим робочий і активний** (12/12 `mode=semantic`, нуль degradation). Cosine-blend
  не псує жодного кейсу й покращує ранжування там, де формулювання користувача ≠ дослівний
  заголовок артефакту: «focus visible accessibility indicator» лексично #2 → семантично **#1**.
- **recall@5 = 1.0 в обох режимах** — golden-set із 12 кейсів достатньо «легкий», очікуваний
  артефакт і так у топ-5; перевага semantic вимірюється в **MRR (0.917 → 0.958)**, тобто в
  тому, наскільки високо стоїть правильний пойнтер.
- **Залишковий live-mode acceptance з § Status 0018 — закрито.** Усі 7 DONE-критеріїв виконані.
- Кейс #8 (`pino redaction`, #2 в обох) — той самий, де canonical hard-rule стоїть під
  closed-PR-планом; це ранкінговий дотюн (canonical > план), ортогональний до lexical/semantic.

## Refs

- [`0018-agent-semantic-retrieval.md`](./0018-agent-semantic-retrieval.md) — ініціатива.
- [`session-log-0018-agent-find-measurement-2026-06-08.md`](./session-log-0018-agent-find-measurement-2026-06-08.md) — lexical-замір (sibling).
- [`docs/04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md`](../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md) — архітектура / out-of-git вектори.
- `scripts/agent/find.mjs`, `scripts/agent/embed-chunks.mjs`, `scripts/agent/voyage.mjs` — тулінг заміру.
