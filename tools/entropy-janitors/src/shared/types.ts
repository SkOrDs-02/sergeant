export type JanitorKind = "doc-drift" | "dead-code" | "dep-cycles";

export interface DriftFinding {
  readonly kind:
    | "broken-ref"
    | "missing-file"
    | "missing-symbol"
    | "circular-dep";
  readonly path: string;
  readonly line?: number | undefined;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface JanitorReport {
  readonly kind: JanitorKind;
  readonly generatedAt: string;
  readonly findings: readonly DriftFinding[];
  readonly summary: {
    readonly scanned: number;
    readonly findings: number;
    readonly durationMs: number;
  };
}

export interface JanitorOptions {
  readonly root: string;
  readonly dryRun: boolean;
  readonly json?: boolean | undefined;
  readonly outDir?: string | undefined;
  readonly limit?: number | undefined;
}

export interface JanitorResult {
  readonly report: JanitorReport;
  readonly shouldOpenIssue: boolean;
  readonly issueTitle: string;
  readonly issueBody: string;
  readonly issueLabels: readonly string[];
}

export interface IssueDispatch {
  readonly created: boolean;
  readonly number?: number | undefined;
  readonly reason: string;
}
