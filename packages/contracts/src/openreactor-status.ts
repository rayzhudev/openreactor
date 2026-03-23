export interface OpenReactorPipelineStage {
  key: string;
  label: string;
  available: boolean;
  itemCount: number;
  items: Array<Record<string, unknown>>;
  recentTriage?: Array<Record<string, unknown>>;
  pendingCount?: number;
  source?: string;
  error?: string;
}

export interface OpenReactorPipeline {
  version: number;
  generatedAt: string;
  stages: OpenReactorPipelineStage[];
}

export interface OpenReactorStatusPayload {
  ok?: boolean;
  available?: boolean;
  generatedAt?: string;
  repo?: Record<string, unknown> | null;
  services?: Record<string, unknown> | null;
  agents?: Record<string, unknown> | null;
  blockers?: Record<string, unknown> | null;
  pipeline?: {
    version?: number;
    generatedAt?: string;
    stages?: OpenReactorPipelineStage[];
  } | null;
  activity?: {
    recentEvents?: Array<Record<string, unknown>>;
  } | null;
  error?: string;
}

export function mergeOpenReactorStatusPayload(
  localStatus: OpenReactorStatusPayload | null,
  intakeStage: OpenReactorPipelineStage,
  localError = ""
): OpenReactorStatusPayload {
  const fallbackPipeline = buildFallbackPipeline({ intakeStage });
  const localPipelineStages = Array.isArray(localStatus?.pipeline?.stages)
    ? localStatus.pipeline.stages
    : [];

  return {
    ok: localStatus?.ok ?? true,
    available: Boolean(localStatus?.available),
    generatedAt: localStatus?.generatedAt ?? new Date().toISOString(),
    repo: localStatus?.repo ?? null,
    services: localStatus?.services ?? {
      reactor: null,
      watchdog: null
    },
    agents: localStatus?.agents ?? {
      activeCount: 0,
      pendingRetryCount: 0,
      maxConcurrentIssues: 0,
      items: []
    },
    blockers: localStatus?.blockers ?? {
      pausedCount: 0,
      pausedIssues: [],
      maintainerHandoffCount: 0,
      maintainerHandoffs: []
    },
    pipeline: {
      version: Number(localStatus?.pipeline?.version ?? 1),
      generatedAt:
        localStatus?.pipeline?.generatedAt ??
        localStatus?.generatedAt ??
        new Date().toISOString(),
      stages: [
        intakeStage,
        ...(localPipelineStages.length ? localPipelineStages : fallbackPipeline.stages.slice(1))
      ]
    },
    activity: localStatus?.activity ?? {
      recentEvents: []
    },
    ...(localError ? { error: localError } : {})
  };
}

export function buildFallbackPipeline(input: {
  intakeStage: OpenReactorPipelineStage;
}): OpenReactorPipeline {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    stages: [
      input.intakeStage,
      buildUnavailableStage("triage-planning", "Triage & planning"),
      buildUnavailableStage("execution", "Execution"),
      buildUnavailableStage("retry", "Retry"),
      buildUnavailableStage("blocked", "Blocked"),
      buildUnavailableStage("completed", "Completed")
    ]
  };
}

export function buildUnavailableStage(
  key: string,
  label: string,
  error = "Live OpenReactor runtime metadata is unavailable."
): OpenReactorPipelineStage {
  return {
    key,
    label,
    available: false,
    itemCount: 0,
    items: [],
    source: "local-runtime",
    error
  };
}
