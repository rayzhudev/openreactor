import path from "node:path";

export interface WatchdogConfig {
  repoRoot: string;
  stateDir: string;
  statePath: string;
  pollIntervalMs: number;
  runningStallMs: number;
  maxRunningIterationsBeforeReset: number;
  pausedRetryMs: number;
  pausedEscalationMs: number;
  serviceCooldownMs: number;
  maxAutoHealAttemptsPerIssue: number;
  reactorServiceName: string;
  watchdogServiceName: string;
}

export function loadWatchdogConfig(repoRoot = process.cwd()): WatchdogConfig {
  const stateDir = path.join(repoRoot, ".openreactor", "watchdog");

  return {
    repoRoot,
    stateDir,
    statePath: path.join(stateDir, "state.json"),
    pollIntervalMs: numberFromEnv("OPENREACTOR_WATCHDOG_POLL_INTERVAL_MS", 120_000),
    runningStallMs: numberFromEnv("OPENREACTOR_WATCHDOG_RUNNING_STALL_MS", 15 * 60_000),
    maxRunningIterationsBeforeReset: numberFromEnv(
      "OPENREACTOR_WATCHDOG_MAX_RUNNING_ITERATIONS_BEFORE_RESET",
      8
    ),
    pausedRetryMs: numberFromEnv("OPENREACTOR_WATCHDOG_PAUSED_RETRY_MS", 20 * 60_000),
    pausedEscalationMs: numberFromEnv(
      "OPENREACTOR_WATCHDOG_PAUSED_ESCALATION_MS",
      45 * 60_000
    ),
    serviceCooldownMs: numberFromEnv(
      "OPENREACTOR_WATCHDOG_SERVICE_COOLDOWN_MS",
      15 * 60_000
    ),
    maxAutoHealAttemptsPerIssue: numberFromEnv(
      "OPENREACTOR_WATCHDOG_MAX_AUTO_HEAL_ATTEMPTS_PER_ISSUE",
      2
    ),
    reactorServiceName:
      clean(process.env.OPENREACTOR_REACTOR_SERVICE_NAME) || "openreactor-reactor.service",
    watchdogServiceName:
      clean(process.env.OPENREACTOR_WATCHDOG_SERVICE_NAME) || "openreactor-watchdog.service"
  };
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = clean(process.env[name]);
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function clean(value?: string): string {
  return (value ?? "").trim();
}
