import { describe, expect, test } from "bun:test";
import { buildIntakeSnapshot, mergeOpenReactorStatusPayload } from "../functions/_shared";

describe("openreactor status pipeline helpers", () => {
  test("buildIntakeSnapshot includes only queued request issues", () => {
    const intakeSnapshot = buildIntakeSnapshot([
      {
        number: 101,
        html_url: "https://github.com/rayzhudev/openreactor/issues/101",
        title: "[Request] Queue me",
        body: "<!-- openreactor:feature-request -->",
        comments: 2,
        created_at: "2026-03-12T10:00:00.000Z",
        state: "open",
        reactions: { "+1": 3 },
        labels: []
      },
      {
        number: 102,
        html_url: "https://github.com/rayzhudev/openreactor/issues/102",
        title: "[Request] Already running",
        body: "<!-- openreactor:feature-request -->",
        comments: 1,
        created_at: "2026-03-12T10:05:00.000Z",
        state: "open",
        reactions: { "+1": 1 },
        labels: [{ name: "or:running" }]
      },
      {
        number: 103,
        html_url: "https://github.com/rayzhudev/openreactor/issues/103",
        title: "[Request] Finished",
        body: "<!-- openreactor:feature-request -->",
        comments: 0,
        created_at: "2026-03-12T10:10:00.000Z",
        state: "closed",
        reactions: { "+1": 0 },
        labels: []
      }
    ]);

    expect(intakeSnapshot.node.id).toBe("intake");
    expect(intakeSnapshot.node.counts?.queued).toBe(1);
    expect(intakeSnapshot.items).toHaveLength(1);
    expect(intakeSnapshot.items[0]).toMatchObject({
      id: "openreactor:issue:101",
      label: "Queue me",
      state: "queued"
    });
    expect(intakeSnapshot.items[0].extensions).toMatchObject({
      openreactor: {
        issueNumber: 101,
        supportCount: 3
      }
    });
  });

  test("mergeOpenReactorStatusPayload injects intake and falls back for missing runtime data", () => {
    const intakeSnapshot = buildIntakeSnapshot([], {
      available: false,
      error: "Repository-backed intake metadata is temporarily unavailable."
    });
    const payload = mergeOpenReactorStatusPayload(
      null,
      intakeSnapshot,
      "Live OpenReactor status is temporarily unavailable."
    );

    expect(payload.specVersion).toBe("automation-status/v1");
    expect(payload.system.status).toBe("degraded");
    expect(payload.topology.nodes.map((node) => node.id)).toEqual([
      "intake",
      "triage-planning",
      "execution",
      "waiting",
      "completed",
      "rejected",
      "watchdog"
    ]);
    expect(payload.snapshot.incidents[0]).toMatchObject({
      kind: "runtime-unavailable",
      reason: "Live OpenReactor status is temporarily unavailable."
    });
    expect(payload.topology.nodes[0]).toMatchObject({
      id: "intake",
      status: "down"
    });
  });

  test("mergeOpenReactorStatusPayload preserves local topology and prepends intake", () => {
    const intakeSnapshot = buildIntakeSnapshot([]);
    const payload = mergeOpenReactorStatusPayload(
      {
        specVersion: "automation-status/v1",
        generatedAt: "2026-03-12T12:00:00.000Z",
        system: {
          id: "openreactor",
          name: "OpenReactor",
          kind: "autonomous-software-delivery",
          status: "healthy"
        },
        topology: {
          nodes: [
            {
              id: "execution",
              kind: "processor",
              label: "Execution",
              status: "healthy",
              counts: {
                totalItems: 1
              },
              samples: {
                items: {
                  itemIds: ["openreactor:issue:212"],
                  visibleCount: 1,
                  truncated: false
                }
              }
            }
          ],
          edges: []
        },
        snapshot: {
          items: [
            {
              id: "openreactor:issue:212",
              kind: "issue",
              label: "Issue #212",
              state: "running",
              currentNodeId: "execution"
            }
          ],
          actors: [],
          executions: [],
          incidents: [],
          services: []
        },
        activity: {
          recentEvents: []
        }
      },
      intakeSnapshot
    );

    expect(payload.topology.nodes.map((node) => node.id)).toEqual([
      "intake",
      "execution"
    ]);
    expect(payload.snapshot.items).toHaveLength(1);
    expect(payload.snapshot.items[0]).toMatchObject({
      id: "openreactor:issue:212",
      currentNodeId: "execution"
    });
  });
});
