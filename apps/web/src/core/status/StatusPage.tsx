import { useCallback, useEffect, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Banner } from "@shared/components/ui/Banner";
import { formatRelativeUk } from "@shared/lib/format/relativeTime.uk";
import { messages } from "@shared/i18n/uk";
import type { ComponentStatus, StatusComponent, StatusResponse } from "./types";

/**
 * Public status page (`/status`) — PR-41.
 *
 * Anonymous surface (no auth gate) that reads `/api/status` and renders
 * a compact per-component health view. Intended for founder-Pulse and
 * public-trust use cases — visitors check this page when "is the app
 * working?" is in doubt.
 *
 * Design constraints (Hard Rule #12 — module-accent containment):
 * neutral palette only. We use the repo's semantic `success` /
 * `warning` / `danger` tokens (already wired through `Banner` and the
 * `-soft` / `-strong` pairs in `tailwind.config.js`) — no module
 * accents (`finyk`, `fizruk`, `routine`, `nutrition`) leak in.
 *
 * Polling: `STATUS_POLL_INTERVAL_MS` (default 30 s). The page does
 * not display request-id, build sha, or anything else — see the L7
 * info-leak audit at `docs/security/hardening/L7-health-endpoint-info-leak.md`.
 */

const STATUS_POLL_INTERVAL_MS = 30_000;

type FetchState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: StatusResponse };

export function StatusPage(): JSX.Element {
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const res = await fetch("/api/status", {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
        credentials: "omit",
      });
      if (!res.ok) {
        setState({
          kind: "error",
          message: `${messages.publicStatus.errorHttpPrefix} ${res.status}.`,
        });
        return;
      }
      const data = (await res.json()) as StatusResponse;
      setState({ kind: "ready", data });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : messages.publicStatus.errorFallback,
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const id = window.setInterval(() => {
      void load();
    }, STATUS_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, [load]);

  return (
    <main
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10"
      data-testid="status-page"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          {messages.publicStatus.pageTitle}
        </h1>
        <p className="text-sm text-textDim">
          {messages.publicStatus.pollNote}{" "}
          {Math.round(STATUS_POLL_INTERVAL_MS / 1000)}{" "}
          {messages.publicStatus.pollNoteSuffix}
        </p>
      </header>

      {state.kind === "loading" ? <LoadingCard /> : null}
      {state.kind === "error" ? (
        <ErrorCard
          message={state.message}
          onRetry={() => {
            setState({ kind: "loading" });
            void load();
          }}
        />
      ) : null}
      {state.kind === "ready" ? <ReadyView data={state.data} /> : null}
    </main>
  );
}

function ReadyView({ data }: { data: StatusResponse }): JSX.Element {
  return (
    <div className="flex flex-col gap-4" data-testid="status-ready">
      <OverallBanner status={data.status} timestamp={data.timestamp} />
      <ul
        className="flex flex-col gap-2"
        aria-label={messages.publicStatus.componentsLabel}
      >
        {data.components.map((component) => (
          <ComponentRow key={component.id} component={component} />
        ))}
      </ul>
      <LastIncidentRow lastIncident={data.lastIncident} />
    </div>
  );
}

function OverallBanner({
  status,
  timestamp,
}: {
  status: ComponentStatus;
  timestamp: string;
}): JSX.Element {
  const headline = OVERALL_HEADLINE[status];
  const variant: "success" | "warning" | "danger" =
    status === "operational"
      ? "success"
      : status === "degraded"
        ? "warning"
        : "danger";
  return (
    <Banner variant={variant} data-testid="status-overall">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{headline}</span>
        <span className="text-xs opacity-80" data-testid="status-timestamp">
          {messages.publicStatus.timestampPrefix} {formatRelativeUk(timestamp)}
        </span>
      </div>
    </Banner>
  );
}

function ComponentRow({
  component,
}: {
  component: StatusComponent;
}): JSX.Element {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3"
      data-testid={`status-row-${component.id}`}
      data-status={component.status}
    >
      <span className="text-style-label text-text">{component.label}</span>
      <StatusPill status={component.status} />
    </li>
  );
}

function StatusPill({ status }: { status: ComponentStatus }): JSX.Element {
  const classes = PILL_CLASSES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-style-caption",
        classes,
      )}
    >
      <StatusDot status={status} />
      {PILL_LABEL[status]}
    </span>
  );
}

function StatusDot({ status }: { status: ComponentStatus }): JSX.Element {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 rounded-full", DOT_CLASSES[status])}
    />
  );
}

function LastIncidentRow({
  lastIncident,
}: {
  lastIncident: StatusResponse["lastIncident"];
}): JSX.Element {
  if (!lastIncident) {
    return (
      <p className="text-xs text-textDim" data-testid="status-last-incident">
        {messages.publicStatus.lastIncidentNone}
      </p>
    );
  }
  return (
    <p className="text-xs text-textDim" data-testid="status-last-incident">
      {messages.publicStatus.lastIncidentPrefix}{" "}
      <span className="text-text">{formatRelativeUk(lastIncident.at)}</span>
      {" — "}
      <span className="text-text">
        {COMPONENT_NAME[lastIncident.component]}
      </span>
      .
    </p>
  );
}

function LoadingCard(): JSX.Element {
  return (
    <div
      className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-textDim"
      data-testid="status-loading"
    >
      {messages.publicStatus.loading}
    </div>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <Banner variant="danger" data-testid="status-error">
      <div className="flex flex-col gap-2">
        <span className="font-semibold">
          {messages.publicStatus.errorTitle}
        </span>
        <span className="text-xs opacity-80">{message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded-xl border border-danger/40 px-3 py-1 text-style-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        >
          {messages.publicStatus.errorRetry}
        </button>
      </div>
    </Banner>
  );
}

const OVERALL_HEADLINE: Record<ComponentStatus, string> = {
  operational: messages.publicStatus.overallOperational,
  degraded: messages.publicStatus.overallDegraded,
  down: messages.publicStatus.overallDown,
};

const PILL_LABEL: Record<ComponentStatus, string> = {
  operational: messages.publicStatus.pillOperational,
  degraded: messages.publicStatus.pillDegraded,
  down: messages.publicStatus.pillDown,
};

const PILL_CLASSES: Record<ComponentStatus, string> = {
  operational: "bg-success-soft text-success-strong",
  degraded: "bg-warning-soft text-warning-strong",
  down: "bg-danger-soft text-danger-strong",
};

const DOT_CLASSES: Record<ComponentStatus, string> = {
  operational: "bg-success",
  degraded: "bg-warning",
  down: "bg-danger",
};

const COMPONENT_NAME: Record<StatusComponent["id"], string> = {
  server: "API server",
  database: "Database",
  n8n: "n8n workflows",
  "console-bot": "OpenClaw bot",
};

export default StatusPage;
