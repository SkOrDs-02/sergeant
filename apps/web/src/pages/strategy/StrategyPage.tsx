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
 * Domain invariants:
 *   * `weekStart` = понеділок ISO-тижня у Kyiv local (`YYYY-MM-DD`).
 *   * `founderUserId` — Better Auth opaque string ID (читаємо з AuthContext-у).
 *
 * Fetch path: `/api/internal/strategic/goals/list` через `internalFetch`-wrapper
 * (тобто bearer-token у dev — лежить у `INTERNAL_API_KEY`). Production-version
 * у PR-35+ переключить fetch на `/api/strategic/*` proxy (session-auth), а
 * internal-route залишить тільки для n8n.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { strategicKeys } from "@shared/lib/api/queryKeys";

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

/** Понеділок ISO-тижня (Kyiv local), формат `YYYY-MM-DD`. */
export function kyivMondayISO(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";

  // Map weekday short ("Mon"/"Tue"/.../"Sun") → daysSinceMonday.
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const daysSinceMonday = Math.max(0, order.indexOf(weekday));

  const utcDay = new Date(Date.UTC(year, month - 1, day));
  utcDay.setUTCDate(utcDay.getUTCDate() - daysSinceMonday);
  return utcDay.toISOString().slice(0, 10);
}

const PERSONA_LABELS: Record<StrategicGoalPersona, string> = {
  finyk: "finyk (finance)",
  fizruk: "fizruk (fitness)",
  nutrition: "nutrition",
  routine: "routine",
};

async function fetchGoals(weekStart: string): Promise<StrategicGoal[]> {
  const res = await fetch("/api/internal/strategic/goals/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weekStart }),
  });
  if (!res.ok) throw new Error(`list goals failed: ${res.status}`);
  const data = (await res.json()) as ListResponse;
  if (!data.ok) throw new Error(data.error ?? "list goals not-ok");
  return data.goals ?? [];
}

async function createGoalApi(input: {
  persona: StrategicGoalPersona;
  founderUserId: string;
  weekStart: string;
  goalText: string;
}): Promise<StrategicGoal> {
  const res = await fetch("/api/internal/strategic/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create goal failed: ${res.status}`);
  const data = (await res.json()) as CreateResponse;
  if (!data.ok || !data.goal) throw new Error(data.error ?? "create not-ok");
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
  const weekStart = useMemo(() => kyivMondayISO(), []);
  const queryClient = useQueryClient();
  const [persona, setPersona] = useState<StrategicGoalPersona>("finyk");
  const [goalText, setGoalText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: strategicKeys.goalsForWeek(weekStart),
    queryFn: () => fetchGoals(weekStart),
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
      setSubmitError(err instanceof Error ? err.message : "create failed");
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
      setSubmitError("goal_text не може бути порожнім");
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
        <h1 className="text-2xl font-semibold">Strategic Goals</h1>
        <p className="text-sm text-muted-foreground">
          Week starting <code>{weekStart}</code> &middot; placeholder UI (PR-34
          skeleton)
        </p>
      </header>

      <section aria-labelledby="add-goal-heading" className="mb-8">
        <h2 id="add-goal-heading" className="mb-2 text-lg font-medium">
          Add goal
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm">Persona</span>
            <select
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
            <span className="text-sm">Goal text</span>
            <textarea
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              rows={3}
              maxLength={2048}
              className="mt-1 block w-full rounded-md border px-3 py-2"
              placeholder="e.g. Cut 'Coffee' category spend by 60% before Sunday"
            />
          </label>
          {submitError !== null && (
            <p role="alert" className="text-sm text-red-600">
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            {createMutation.isPending ? "Saving…" : "Add goal"}
          </button>
        </form>
      </section>

      <section aria-labelledby="goals-heading">
        <h2 id="goals-heading" className="mb-2 text-lg font-medium">
          This week&apos;s goals
        </h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No goals for week starting {weekStart}. WF-26 cron fires Mon 09:00
            Kyiv, or add a goal manually using the form above.
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
                        className="rounded-md border border-gray-200 px-3 py-2 text-sm"
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
