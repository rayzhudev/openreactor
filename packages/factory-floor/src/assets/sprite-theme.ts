import type { ActorSnapshot, LayoutNode } from "../types";
import claudeLogoUrl from "./logos/claude.svg?no-inline";
import codexLogoUrl from "./logos/codex.svg?no-inline";
import droneBaseNeutralUrl from "./sprites/drone-base-neutral.png?no-inline";
import droneRotorLeftUrl from "./sprites/drone-rotor-left.png?no-inline";
import droneRotorRightUrl from "./sprites/drone-rotor-right.png?no-inline";
import overlayRoleGeneralUrl from "./sprites/overlay-role-general.png?no-inline";
import overlayRolePlannerUrl from "./sprites/overlay-role-planner.png?no-inline";
import overlayRoleTriageUrl from "./sprites/overlay-role-triage.png?no-inline";
import overlayRoleUiUrl from "./sprites/overlay-role-ui.png?no-inline";
import pileMergedUrl from "./sprites/pile-merged.png?no-inline";
import pileRejectedUrl from "./sprites/pile-rejected.png?no-inline";
import stationExecutionUrl from "./sprites/station-execution.png?no-inline";
import stationIntakeUrl from "./sprites/station-intake.png?no-inline";
import stationTriageUrl from "./sprites/station-triage.png?no-inline";
import watchdogIdleUrl from "./sprites/watchdog-idle.png?no-inline";
import watchdogSprayingUrl from "./sprites/watchdog-spraying.png?no-inline";

export interface ActorSpriteSet {
  base: string;
  rotorLeft: string;
  rotorRight: string;
  providerOverlay: string | null;
  roleOverlay: string | null;
}

export function resolveNodeSpriteUrl(node: LayoutNode): string | null {
  if (node.id === "execution") {
    return stationExecutionUrl;
  }

  if (node.id === "triage-planning") {
    return stationTriageUrl;
  }

  if (node.id === "completed") {
    return pileMergedUrl;
  }

  if (node.id === "rejected") {
    return pileRejectedUrl;
  }

  switch (node.kind) {
    case "source":
      return stationIntakeUrl;
    default:
      return null;
  }
}

export function resolveActorSpriteSet(actor: ActorSnapshot): ActorSpriteSet {
  return {
    base: droneBaseNeutralUrl,
    rotorLeft: droneRotorLeftUrl,
    rotorRight: droneRotorRightUrl,
    providerOverlay: resolveProviderOverlay(actor.provider),
    roleOverlay: resolveRoleOverlay(actor),
  };
}

export function resolveWatchdogSpriteUrl(isSpraying: boolean): string {
  return isSpraying ? watchdogSprayingUrl : watchdogIdleUrl;
}

function resolveProviderOverlay(provider: string | undefined): string | null {
  const normalized = String(provider ?? "").trim().toLowerCase();

  if (
    normalized === "codex" ||
    normalized === "openai" ||
    normalized === "chatgpt" ||
    normalized === "gpt"
  ) {
    return codexLogoUrl;
  }

  if (normalized === "claude" || normalized === "anthropic") {
    return claudeLogoUrl;
  }

  return null;
}

function resolveRoleOverlay(actor: ActorSnapshot): string | null {
  const normalizedRole = String(actor.role ?? "").trim().toLowerCase();
  const ext = actor.extensions?.openreactor as Record<string, unknown> | undefined;
  const roleHint = `${actor.label} ${String(ext?.toolLabel ?? "")}`.toLowerCase();

  if (roleHint.includes("triage")) {
    return overlayRoleTriageUrl;
  }

  if (normalizedRole === "ui") {
    return overlayRoleUiUrl;
  }

  if (normalizedRole === "planning" || roleHint.includes("planner")) {
    return overlayRolePlannerUrl;
  }

  if (normalizedRole === "general") {
    return overlayRoleGeneralUrl;
  }

  return null;
}
