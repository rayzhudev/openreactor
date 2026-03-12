import { describe, expect, test } from "bun:test";
import { buildIntakeStage, mergeOpenReactorStatusPayload } from "../functions/_shared";

describe("openreactor status pipeline helpers", () => {
  test("buildIntakeStage includes only queued request issues", () => {
    const intakeStage = buildIntakeStage([
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

    expect(intakeStage.key).toBe("intake");
    expect(intakeStage.itemCount).toBe(1);
    expect(intakeStage.items).toHaveLength(1);
    expect(intakeStage.items[0]).toMatchObject({
      issueNumber: 101,
      issueTitle: "Queue me",
      status: "queued",
      supportCount: 3
    });
  });

  test("mergeOpenReactorStatusPayload prepends intake and falls back for missing local stages", () => {
    const intakeStage = buildIntakeStage([], {
      available: false,
      error: "Repository-backed intake metadata is temporarily unavailable."
    });
    const payload = mergeOpenReactorStatusPayload(null, intakeStage, "Live OpenReactor status is temporarily unavailable.");

    expect(payload.available).toBe(false);
    expect(payload.error).toBe("Live OpenReactor status is temporarily unavailable.");
    expect(payload.pipeline).toBeDefined();
    expect((payload.pipeline as { stages: Array<{ key: string; available: boolean }> }).stages).toHaveLength(6);
    expect((payload.pipeline as { stages: Array<{ key: string; available: boolean }> }).stages[0]).toMatchObject({
      key: "intake",
      available: false
    });
    expect((payload.pipeline as { stages: Array<{ key: string; available: boolean; error?: string }> }).stages[1]).toMatchObject({
      key: "triage-planning",
      available: false,
      error: "Live OpenReactor runtime metadata is unavailable."
    });
  });

  test("mergeOpenReactorStatusPayload preserves local pipeline stages", () => {
    const intakeStage = buildIntakeStage([]);
    const payload = mergeOpenReactorStatusPayload(
      {
        ok: true,
        available: true,
        generatedAt: "2026-03-12T12:00:00.000Z",
        pipeline: {
          version: 1,
          generatedAt: "2026-03-12T12:00:00.000Z",
          stages: [
            {
              key: "execution",
              label: "Execution",
              available: true,
              itemCount: 1,
              items: [{ issueNumber: 212 }]
            }
          ]
        }
      },
      intakeStage
    );

    const stages = (payload.pipeline as { stages: Array<{ key: string; itemCount: number }> }).stages;
    expect(stages.map((stage) => stage.key)).toEqual(["intake", "execution"]);
    expect(stages[1]).toMatchObject({
      key: "execution",
      itemCount: 1
    });
  });
});
