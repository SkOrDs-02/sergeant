/**
 * PR-34 — strategic mode skeleton: UI placeholder.
 *
 * Поки що — read-only list goals для current Kyiv-ISO-week (з API)
 * + manual add-goal form. Без conversation flow і без status-controls;
 * це surface для повного PR-35+ conversation UI.
 *
 * Чому placeholder: skeleton-scope PR-34 — datalayer + endpoint + WF-26.
 * UI потрібен лише щоб бачити, що goals реально INSERT-ються (через cron
 * або через seed-script) і щоб дев міг створити test-goal руками без n8n.
 *
 * @scaffolded — landed by PR-34 (strategic mode datalayer + endpoint + WF-26
 *   skeleton); router wire-up deferred до PR-35+ conversation UI.
 * @owner @Skords-01 (frontend)
 * @addedIn PR-34
 * @nextStep PR-35+ — wire `StrategyPage` into `apps/web/src/core/app/router.tsx`
 *   under `/strategy` route + add conversation flow + status-controls.
 *
 * Domain invariants:
 *   * `weekStart` = понеділок ISO-тижня у Kyiv local (`YYYY-MM-DD`).
 *   * `founderUserId` — Better Auth opaque string ID (читаємо з AuthContext-у).
 *
 * Fetch path: `fetchGoals` / `createGoalApi` тепер ходять через
 * `internalFetch` wrapper (`apps/web/src/shared/lib/api/internalFetch.ts`),
 * який інжектить `Authorization: Bearer ${VITE_INTERNAL_API_KEY}` лише з
 * dev env (`import.meta.env.VITE_INTERNAL_API_KEY`). У prod бандлі ця
 * env-змінна не виставлена — helper повертає synthetic 403, тому Hard
 * Rule #20 (PAT не їде в production) тримається.
 *
 * Сторінка свідомо **не змонтована** в `apps/web/src/core/app/router.tsx` —
 * conversation flow для PR-35+ ще не готовий.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { strategicKeys } from "@shared/lib/api/queryKeys";
import { messages } from "../../shared/i18n/uk";
import { internalFetch } from "@shared/lib/api/internalFetch";
import { getKyivWeekStartKey } from "@shared/lib/time/kyivTime";

/** Канонічний catalog персон (mirror з `apps/server/src/lib/strategicGoals.ts`). */
const STRATEGIC_GOAL_PERSONAS = [
  "finyk",
  "fizruk",
  "nutrition",
  "routine",
] as const;
type StrategicGoalPersona = (typeof STRATEGIC_GOAL_PERSONAS)[number];

type StrategicGoalStatus = "active" | "achieved" | "abandoned" | "carried_over";

interface StrategicGoal {
  id: number;
  persona: StrategicGoalPersona;
  founderUserId: string;
  weekStart: string;
  goalText: string;
  status: StrategicGoalStatus;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  ok: boolean;
  goals?: StrategicGoal[];
  error?: string;
}

interface CreateResponse {
  ok: boolean;
  goal?: StrategicGoal;
  error?: string;
}

const PERSONA_LABELS: Record<StrategicGoalPersona, string> = {
  finyk: "Фінік (фінанси)",
  fizruk: "Фізрук (фітнес)",
  nutrition: "Харчування",
  routine: "Рутина",
};

/**
 * Audit F2: типізована помилка з HTTP-статусом, щоб UI міг змапити її
 * на дружню українську копію без витоку server-internal `error.message`.
 */
class StrategyApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "StrategyApiError";
    this.status = status;
  }
}

function strategyErrorMessage(status: number): string {
  if (status === 401 || status === 403) return "Сесія завершилась";
  if (status >= 500) return "Сервер тимчасово недоступний";
  return "Не вдалося зберегти ціль";
}

async function fetchGoals(weekStart: string): Promise<StrategicGoal[]> {
  const res = await internalFetch("/api/internal/strategic/goals/list", {
    method: "POST",
    body: JSON.stringify({ weekStart }),
  });
  if (!res.ok)
    throw new StrategyApiError(res.status, `list goals failed: ${res.status}`);
  const data = (await res.json()) as ListResponse;
  if (!data.ok)
    throw new StrategyApiError(res.status, data.error ?? "list goals not-ok");
  return data.goals ?? [];
}

async function createGoalApi(input: {
  persona: StrategicGoalPersona;
  founderUserId: string;
  weekStart: string;
  goalText: string;
}): Promise<StrategicGoal> {
  const res = await internalFetch("/api/internal/strategic/goals", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok)
    throw new StrategyApiError(res.status, `create goal failed: ${res.status}`);
  const data = (await res.json()) as CreateResponse;
  if (!data.ok || !data.goal)
    throw new StrategyApiError(res.status, data.error ?? "create not-ok");
  return data.goal;
}

interface StrategyPageProps {
  founderUserId: string;
}

/**
 * Top-level placeholder. PR-35+ замінить весь цей UI на real
 * conversation-driven planning page (split per-persona картки,
 * status-controls, weekly carry-over UI).
 */
export function StrategyPage({ founderUserId }: StrategyPageProps) {
  const weekStart = useMemo(() => getKyivWeekStartKey(), []);
  const queryClient = useQueryClient();
  const [persona, setPersona] = useState<StrategicGoalPersona>("finyk");
  const [goalText, setGoalText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Refs for the two form controls so we can move focus to the first
  // invalid field when validation fails (WCAG 3.3.1 / audit F22).
  const personaSelectRef = useRef<HTMLSelectElement>(null);
  const goalTextRef = useRef<HTMLTextAreaElement>(null);

  // Move focus to the goalText textarea when a validation error is set —
  // it is the only field that can trigger `submitError` (empty text check).
  // `personaSelectRef` is kept for future validations on that field.
  useEffect(() => {
    if (submitError !== null) {
      goalTextRef.current?.focus();
    }
  }, [submitError]);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: strategicKeys.goalsForWeek(weekStart),
    queryFn: () => fetchGoals(weekStart),
    // Weekly goals change rarely; without a staleTime RQ refetches on every
    // window focus. 5 хв вистачає, щоб уникнути churn-у але лишитись свіжим.
    staleTime: 5 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: createGoalApi,
    onSuccess: () => {
      setGoalText("");
      setSubmitError(null);
      queryClient.invalidateQueries({
        queryKey: strategicKeys.goalsForWeek(weekStart),
      });
    },
    onError: (err) => {
      if (err instanceof StrategyApiError) {
        setSubmitError(strategyErrorMessage(err.status));
        return;
      }
      setSubmitError("Не вдалося зберегти ціль");
    },
  });

  const goalsByPersona = useMemo(() => {
    const map: Record<StrategicGoalPersona, StrategicGoal[]> = {
      finyk: [],
      fizruk: [],
      nutrition: [],
      routine: [],
    };
    for (const g of goals) map[g.persona]?.push(g);
    return map;
  }, [goals]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = goalText.trim();
    if (!trimmed) {
      setSubmitError(messages.strategy.goalTextRequired);
      return;
    }
    createMutation.mutate({
      persona,
      founderUserId,
      weekStart,
      goalText: trimmed,
    });
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{messages.strategy.title}</h1>
        <p className="text-sm text-muted-foreground">
          {messages.strategy.weekPrefix} <code>{weekStart}</code> &middot;{" "}
          {messages.strategy.placeholderTag}
        </p>
      </header>

      <section aria-labelledby="add-goal-heading" className="mb-8">
        <h2 id="add-goal-heading" className="mb-2 text-lg font-medium">
          {messages.strategy.addGoal}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <fieldset className="contents">
            {/* sr-only legend: provides an accessible group name without
                altering visual layout (fieldset uses `contents` display). */}
            <legend className="sr-only">{messages.strategy.addGoal}</legend>
            <label className="block">
              <span className="text-sm">{messages.strategy.personaLabel}</span>
              <select
                ref={personaSelectRef}
                value={persona}
                onChange={(e) =>
                  setPersona(e.target.value as StrategicGoalPersona)
                }
                className="mt-1 block w-full rounded-md border px-3 py-2"
              >
                {STRATEGIC_GOAL_PERSONAS.map((p) => (
                  <option key={p} value={p}>
                    {PERSONA_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm">{messages.strategy.goalTextLabel}</span>
              <textarea
                ref={goalTextRef}
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                rows={3}
                maxLength={2048}
                className="mt-1 block w-full rounded-md border px-3 py-2"
                placeholder={messages.strategy.goalTextPlaceholder}
                aria-describedby={
                  submitError !== null ? "goal-text-error" : undefined
                }
                aria-invalid={submitError !== null ? true : undefined}
              />
            </label>
          </fieldset>
          {submitError !== null && (
            <p
              id="goal-text-error"
              role="alert"
              className="text-sm text-danger-strong"
            >
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-info-strong px-4 py-2 text-white text-style-label min-h-touch-target focus-visible:outline focus-visible:outline-2 focus-visible:outline-info disabled:opacity-50"
          >
            {createMutation.isPending
              ? messages.strategy.saving
              : messages.strategy.addGoal}
          </button>
        </form>
      </section>

      <section aria-labelledby="goals-heading">
        <h2 id="goals-heading" className="mb-2 text-lg font-medium">
          {messages.strategy.thisWeeksGoals}
        </h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            {messages.strategy.loading}
          </p>
        ) : goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {messages.strategy.emptyStatePrefix} {weekStart}{" "}
            {messages.strategy.emptyStateSuffix}
          </p>
        ) : (
          <div className="space-y-4">
            {STRATEGIC_GOAL_PERSONAS.map((p) => {
              const list = goalsByPersona[p];
              if (!list || list.length === 0) return null;
              return (
                <article key={p}>
                  <h3 className="text-base font-medium">{PERSONA_LABELS[p]}</h3>
                  <ul className="mt-1 space-y-1">
                    {list.map((g) => (
                      <li
                        key={g.id}
                        className="rounded-md border border-line px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          #{g.id} · {g.status}
                        </span>
                        <div>{g.goalText}</div>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default StrategyPage;
