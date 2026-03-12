import { execFileSync } from "node:child_process";

export interface OpenReactorStatusConfig {
  bindHost: string;
  port: number;
  authToken: string;
  reactorServiceName: string;
  watchdogServiceName: string;
}

export function loadOpenReactorStatusConfig(): OpenReactorStatusConfig {
  return {
    bindHost: clean(process.env.OPENREACTOR_STATUS_BIND_HOST) || "127.0.0.1",
    port: numberFromEnv("OPENREACTOR_STATUS_PORT", 8789),
    authToken: clean(process.env.OPENREACTOR_STATUS_TOKEN),
    reactorServiceName:
      clean(process.env.OPENREACTOR_REACTOR_SERVICE_NAME) || "openreactor-reactor.service",
    watchdogServiceName:
      clean(process.env.OPENREACTOR_WATCHDOG_SERVICE_NAME) || "openreactor-watchdog.service"
  };
}

export interface ServiceStatus {
  activeState: string;
  subState: string;
  result: string;
  execMainPid: number;
  restarts: number;
}

export function readServiceStatus(serviceName: string): ServiceStatus {
  const raw = execFileSync(
    "systemctl",
    [
      "--user",
      "show",
      serviceName,
      "--property=ActiveState,SubState,Result,ExecMainPID,NRestarts",
      "--no-pager"
    ],
    { encoding: "utf8" }
  );

  const values = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }

  return {
    activeState: values.get("ActiveState") ?? "unknown",
    subState: values.get("SubState") ?? "unknown",
    result: values.get("Result") ?? "unknown",
    execMainPid: Number.parseInt(values.get("ExecMainPID") ?? "0", 10) || 0,
    restarts: Number.parseInt(values.get("NRestarts") ?? "0", 10) || 0
  };
}

export function isServiceActive(status: ServiceStatus): boolean {
  return status.activeState === "active" && status.execMainPid > 0;
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
