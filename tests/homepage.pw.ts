import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/session*", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        status: 204
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authAvailable: true,
        authenticated: true,
        login: "supporter",
        profileUrl: "https://github.com/supporter"
      })
    });
  });

  await page.route("**/api/support", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        issueNumber: 101,
        supportCount: 6,
        viewerSupports: true
      })
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem(
      "openreactor-my-requests",
      JSON.stringify([
        {
          number: 77,
          title: "Bundle three unrelated requests into one issue",
          url: "https://github.com/rayzhudev/openreactor/issues/77",
          commentUrl: "https://github.com/rayzhudev/openreactor/issues/77",
          createdAt: "2026-03-09T12:00:00.000Z",
          status: "rejected",
          statusDetail: "Rejected under the one-change-per-issue scope rule.",
          statusUpdatedAt: "2026-03-09T13:00:00.000Z",
          commentCount: 2
        }
      ])
    );
  });

  await page.route("**/api/meta", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        repoUrl: "https://github.com/rayzhudev/openreactor"
      })
    });
  });

  await page.route("**/api/requests*", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "created",
          number: 777,
          url: "https://github.com/rayzhudev/openreactor/issues/777"
        })
      });
      return;
    }

    const archivePage = Number(new URL(route.request().url()).searchParams.get("page") || "1");
    const archivedPages = {
      1: [
        {
          number: 98,
          title: "Expose co-author credit on the intake form",
          status: "complete",
          url: "https://github.com/rayzhudev/openreactor/issues/98",
          createdAt: "2026-03-10T09:14:00.000Z",
          statusDetail: "Merged",
          statusUpdatedAt: "2026-03-10T10:00:00.000Z"
        }
      ],
      2: [
        {
          number: 96,
          title: "Archive older queue experiments cleanly",
          status: "rejected",
          url: "https://github.com/rayzhudev/openreactor/issues/96",
          createdAt: "2026-03-09T09:14:00.000Z",
          statusDetail: "Closed",
          statusUpdatedAt: "2026-03-09T10:00:00.000Z"
        }
      ]
    } as Record<number, unknown[]>;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        archivePage,
        archiveHasPreviousPage: archivePage > 1,
        archiveHasNextPage: archivePage < 2,
        archiveTotal: 2,
        repoUrl: "https://github.com/rayzhudev/openreactor",
        activeItems: [
          {
            number: 101,
            title: "Radically improve the homepage art direction",
            status: "in-progress",
            url: "https://github.com/rayzhudev/openreactor/issues/101",
            createdAt: "2026-03-10T13:32:11.567Z",
            supportCount: 5,
            viewerSupports: false,
            statusDetail: "PR open",
            statusUpdatedAt: "2026-03-10T13:40:00.000Z"
          },
        ],
        archivedItems: archivedPages[archivePage] || [],
        items: [
          {
            number: 77,
            title: "Bundle three unrelated requests into one issue",
            status: "rejected",
            url: "https://github.com/rayzhudev/openreactor/issues/77",
            createdAt: "2026-03-09T12:00:00.000Z",
            statusDetail: "Rejected under the one-change-per-issue scope rule.",
            statusUpdatedAt: "2026-03-09T13:00:00.000Z",
            commentUrl: "https://github.com/rayzhudev/openreactor/issues/77",
            commentCount: 2
          },
          {
            number: 101,
            title: "Radically improve the homepage art direction",
            status: "in-progress",
            url: "https://github.com/rayzhudev/openreactor/issues/101",
            createdAt: "2026-03-10T13:32:11.567Z",
            supportCount: 5,
            viewerSupports: false,
            statusDetail: "PR open",
            statusUpdatedAt: "2026-03-10T13:40:00.000Z"
          },
          ...(archivedPages[archivePage] || [])
        ]
      })
    });
  });

  await page.route("**/api/leaderboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            login: "rayzhudev",
            profileUrl: "https://github.com/rayzhudev",
            accountType: "Requester",
            creditSource: "issue-requester",
            mergedCount: 3,
            latestPullRequest: {
              number: 99,
              title: "Improve issue attribution",
              url: "https://github.com/rayzhudev/openreactor/pull/99"
            }
          }
        ],
        totals: {
          mergedPullRequests: 3,
          contributors: 1,
          latestMergedAt: "2026-03-10T10:00:00.000Z"
        }
      })
    });
  });

  await page.route("**/api/openreactor-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
              id: "intake",
              kind: "source",
              label: "Intake",
              status: "healthy",
              counts: { totalItems: 0, queued: 0 },
              samples: { items: { itemIds: [], visibleCount: 0, truncated: false } }
            },
            {
              id: "triage-planning",
              kind: "processor",
              label: "Triage & planning",
              status: "healthy",
              counts: { totalItems: 0 },
              samples: { items: { itemIds: [], visibleCount: 0, truncated: false } }
            },
            {
              id: "execution",
              kind: "processor",
              label: "Execution",
              status: "healthy",
              counts: { totalItems: 2, active: 2 },
              samples: {
                items: {
                  itemIds: ["openreactor:issue:201", "openreactor:issue:204"],
                  visibleCount: 2,
                  truncated: false
                }
              }
            },
            {
              id: "waiting",
              kind: "human-gate",
              label: "Waiting",
              status: "degraded",
              counts: { totalItems: 2, blocked: 2 },
              samples: {
                items: {
                  itemIds: ["openreactor:issue:186", "openreactor:issue:143"],
                  visibleCount: 2,
                  truncated: false
                }
              }
            },
            {
              id: "completed",
              kind: "sink",
              label: "Completed",
              status: "healthy",
              counts: { totalItems: 0, completed: 0 },
              samples: { items: { itemIds: [], visibleCount: 0, truncated: false } }
            },
            {
              id: "rejected",
              kind: "sink",
              label: "Rejected",
              status: "healthy",
              counts: { totalItems: 0, completed: 0 },
              samples: { items: { itemIds: [], visibleCount: 0, truncated: false } }
            },
            {
              id: "watchdog",
              kind: "supervisor",
              label: "Watchdog",
              status: "healthy",
              counts: { totalItems: 0 },
              samples: { items: { itemIds: [], visibleCount: 0, truncated: false } }
            }
          ],
          edges: []
        },
        snapshot: {
          items: [
            {
              id: "openreactor:issue:201",
              kind: "issue",
              label: "Polish the public queue cards",
              state: "running",
              currentNodeId: "execution",
              assignedActorId: "openreactor:actor:201",
              enteredStateAt: "2026-03-12T11:50:00.000Z",
              updatedAt: "2026-03-12T11:58:00.000Z",
              relatedResourceUrls: ["https://github.com/rayzhudev/openreactor/issues/201"],
              extensions: {
                openreactor: {
                  issueNumber: 201,
                  issueTitle: "Polish the public queue cards",
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/201",
                  branchName: "openreactor/issue-201",
                  iteration: 2,
                  toolName: "spawn_codex_ui_agent",
                  toolLabel: "Codex UI agent",
                  provider: "codex",
                  primaryUse: "ui",
                  updatedAt: "2026-03-12T11:58:00.000Z",
                  lastHeartbeatAt: "2026-03-12T11:59:00.000Z",
                  rawStatus: "running"
                }
              }
            },
            {
              id: "openreactor:issue:204",
              kind: "issue",
              label: "Expose contributor support state",
              state: "running",
              currentNodeId: "execution",
              assignedActorId: "openreactor:actor:204",
              enteredStateAt: "2026-03-12T11:55:00.000Z",
              updatedAt: "2026-03-12T11:57:00.000Z",
              relatedResourceUrls: ["https://github.com/rayzhudev/openreactor/issues/204"],
              extensions: {
                openreactor: {
                  issueNumber: 204,
                  issueTitle: "Expose contributor support state",
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/204",
                  branchName: "openreactor/issue-204",
                  iteration: 1,
                  toolName: "spawn_codex_issue_agent",
                  toolLabel: "Codex issue agent",
                  provider: "codex",
                  primaryUse: "general",
                  updatedAt: "2026-03-12T11:57:00.000Z",
                  lastHeartbeatAt: "2026-03-12T11:58:30.000Z",
                  rawStatus: "running"
                }
              }
            },
            {
              id: "openreactor:issue:205",
              kind: "issue",
              label: "Retry something",
              state: "retrying",
              currentNodeId: "execution",
              updatedAt: "2026-03-12T11:57:30.000Z",
              relatedResourceUrls: ["https://github.com/rayzhudev/openreactor/issues/205"],
              extensions: {
                openreactor: {
                  issueNumber: 205,
                  issueTitle: "Retry something",
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/205",
                  rawStatus: "retry"
                }
              }
            },
            {
              id: "openreactor:issue:186",
              kind: "issue",
              label: "Issue #186",
              state: "paused",
              currentNodeId: "waiting",
              updatedAt: "2026-03-12T11:45:00.000Z",
              relatedResourceUrls: ["https://github.com/rayzhudev/openreactor/issues/186"],
              extensions: {
                openreactor: {
                  issueNumber: 186,
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/186",
                  autoHealAttempts: 3,
                  lastFailureClass: "schema_mismatch",
                  lastAutoHealAt: "2026-03-12T11:40:00.000Z",
                  lastEscalatedAt: "2026-03-12T11:45:00.000Z",
                  repairIssueNumber: 188,
                  repairIssueUrl: "https://github.com/rayzhudev/openreactor/issues/188",
                  blockerKind: "paused"
                }
              }
            },
            {
              id: "openreactor:issue:143",
              kind: "pull-request",
              label: "Add GitHub login",
              state: "waiting",
              currentNodeId: "waiting",
              updatedAt: "2026-03-12T11:35:00.000Z",
              relatedResourceUrls: ["https://github.com/rayzhudev/openreactor/issues/143"],
              extensions: {
                openreactor: {
                  issueNumber: 143,
                  issueTitle: "Add GitHub login",
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/143",
                  branchName: "openreactor/issue-143",
                  prUrl: "https://github.com/rayzhudev/openreactor/pull/147",
                  instructions:
                    "Set GITHUB_APP_CLIENT_SECRET and SESSION_SECRET in Cloudflare Pages.",
                  blockerKind: "maintainer-handoff"
                }
              }
            }
          ],
          actors: [
            {
              id: "openreactor:actor:201",
              kind: "agent",
              label: "Codex UI agent",
              role: "ui",
              status: "working",
              currentNodeId: "execution",
              currentItemId: "openreactor:issue:201",
              provider: "codex",
              startedAt: "2026-03-12T11:50:00.000Z",
              lastHeartbeatAt: "2026-03-12T11:59:00.000Z",
              extensions: {
                openreactor: {
                  issueNumber: 201,
                  issueTitle: "Polish the public queue cards",
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/201",
                  branchName: "openreactor/issue-201",
                  iteration: 2,
                  toolName: "spawn_codex_ui_agent",
                  toolLabel: "Codex UI agent",
                  primaryUse: "ui",
                  updatedAt: "2026-03-12T11:58:00.000Z",
                  rawStatus: "running"
                }
              }
            },
            {
              id: "openreactor:actor:204",
              kind: "agent",
              label: "Codex issue agent",
              role: "general",
              status: "working",
              currentNodeId: "execution",
              currentItemId: "openreactor:issue:204",
              provider: "codex",
              startedAt: "2026-03-12T11:55:00.000Z",
              lastHeartbeatAt: "2026-03-12T11:58:30.000Z",
              extensions: {
                openreactor: {
                  issueNumber: 204,
                  issueTitle: "Expose contributor support state",
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/204",
                  branchName: "openreactor/issue-204",
                  iteration: 1,
                  toolName: "spawn_codex_issue_agent",
                  toolLabel: "Codex issue agent",
                  primaryUse: "general",
                  updatedAt: "2026-03-12T11:57:00.000Z",
                  rawStatus: "running"
                }
              }
            }
          ],
          incidents: [
            {
              id: "openreactor:incident:paused:186",
              kind: "paused-issue",
              label: "Issue #186 is paused",
              severity: "warning",
              status: "active",
              scope: {
                nodeIds: ["waiting"],
                itemIds: ["openreactor:issue:186"]
              },
              startedAt: "2026-03-12T11:40:00.000Z",
              updatedAt: "2026-03-12T11:45:00.000Z",
              reason: "schema_mismatch",
              extensions: {
                openreactor: {
                  issueNumber: 186,
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/186",
                  autoHealAttempts: 3,
                  repairIssueNumber: 188,
                  repairIssueUrl: "https://github.com/rayzhudev/openreactor/issues/188"
                }
              }
            },
            {
              id: "openreactor:incident:maintainer-handoff:143",
              kind: "maintainer-handoff",
              label: "Issue #143 requires maintainer action",
              severity: "warning",
              status: "active",
              scope: {
                nodeIds: ["waiting"],
                itemIds: ["openreactor:issue:143"]
              },
              startedAt: "2026-03-12T11:35:00.000Z",
              updatedAt: "2026-03-12T11:35:00.000Z",
              reason:
                "Set GITHUB_APP_CLIENT_SECRET and SESSION_SECRET in Cloudflare Pages.",
              extensions: {
                openreactor: {
                  issueNumber: 143,
                  issueTitle: "Add GitHub login",
                  issueUrl: "https://github.com/rayzhudev/openreactor/issues/143",
                  branchName: "openreactor/issue-143",
                  prUrl: "https://github.com/rayzhudev/openreactor/pull/147",
                  instructions:
                    "Set GITHUB_APP_CLIENT_SECRET and SESSION_SECRET in Cloudflare Pages."
                }
              }
            }
          ],
          services: [
            {
              id: "reactor",
              label: "Reactor",
              status: "healthy",
              active: true,
              updatedAt: "2026-03-12T12:00:00.000Z",
              restarts: 1,
              metadata: {
                execMainPid: 4242
              },
              extensions: {
                openreactor: {
                  active: true,
                  activeState: "active",
                  subState: "running",
                  result: "success",
                  restarts: 1,
                  execMainPid: 4242,
                  snapshotGeneratedAt: "2026-03-12T12:00:00.000Z",
                  snapshotFresh: true
                }
              }
            },
            {
              id: "watchdog",
              label: "Watchdog",
              status: "healthy",
              active: true,
              updatedAt: "2026-03-12T12:00:00.000Z",
              restarts: 0,
              metadata: {
                execMainPid: 4343
              },
              extensions: {
                openreactor: {
                  active: true,
                  activeState: "active",
                  subState: "running",
                  result: "success",
                  restarts: 0,
                  execMainPid: 4343,
                  snapshotGeneratedAt: "2026-03-12T12:00:00.000Z",
                  snapshotFresh: true
                }
              }
            }
          ]
        },
        activity: {
          recentEvents: [
            {
              id: "event-1",
              at: "2026-03-12T11:59:00.000Z",
              kind: "status",
              level: "info",
              subjectType: "item",
              subjectId: "openreactor:issue:201",
              message: "Codex UI agent is actively iterating on the queue cards.",
              extensions: {
                openreactor: {
                  title: "Agent heartbeat",
                  issueNumber: 201,
                  iteration: 2
                }
              }
            }
          ]
        },
        metrics: {
          totals: {
            activeAgents: 2,
            blockedItems: 2,
            pendingRetryItems: 1
          },
          capacities: {
            maxConcurrentIssues: 3
          }
        },
        extensions: {
          openreactor: {
            nodeOrder: [
              "intake",
              "triage-planning",
              "execution",
              "waiting",
              "completed",
              "rejected",
              "watchdog"
            ]
          }
        }
      })
    });
  });
});

test("renders the redesign and submits a request through the mocked API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: /pressure builds the brief/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /submit a request/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /my requests/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /requests in the open/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /watch the system work/i })).toBeVisible();
  await expect(page.locator("#my-requests-list")).toContainText(
    "Rejected under the one-change-per-issue scope rule."
  );
  await expect(page.getByRole("link", { name: /reply on github to clarify/i })).toBeVisible();
  await expect(page.getByText("Radically improve the homepage art direction").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /leaderboard/i })).toBeVisible();
  await expect(page.locator("#auth-login")).toHaveText("supporter");
  await expect(page.locator("#auth-avatar")).toHaveAttribute("alt", "@supporter");
  await expect(page.getByRole("button", { name: /support with github \(5 supports\)/i }).first()).toBeVisible();
  await expect(page.getByText("Requester").first()).toBeVisible();
  await expect(page.locator("#openreactor-live-reactor")).toContainText("Running");
  await expect(page.locator("#openreactor-live-watchdog")).toContainText("Running");
  await expect(page.locator("#openreactor-live-active")).toContainText("2");
  await expect(page.locator("#openreactor-live-blocked")).toContainText("2");
  await expect(page.locator("openreactor-factory-floor")).toBeVisible();
  const factoryNodeCount = await page.locator("openreactor-factory-floor").evaluate((element) => {
    return element.shadowRoot?.querySelectorAll(".ff-node").length ?? 0;
  });
  expect(factoryNodeCount).toBeGreaterThan(0);
  await expect(page.locator("#openreactor-live-agents")).toContainText("Polish the public queue cards");
  await expect(page.locator("#openreactor-live-agents")).toContainText("Codex UI agent");
  await expect(page.locator("#openreactor-live-blockers")).toContainText("Maintainer action");
  await expect(page.locator("#openreactor-live-blockers")).toContainText("schema_mismatch");

  await page.getByRole("button", { name: /support with github/i }).first().click();
  await expect(page.getByLabel(/supported \(6 supports\)/i).first()).toBeVisible();

  await page.locator("#request").fill(
    "The landing page feels generic. Redesign it into a more editorial layout with stronger hierarchy while keeping the form and public queue on the same page."
  );
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.locator("#form-status")).toContainText("Request queued as issue #777. Added to My requests.");
  await expect(page.locator("#my-requests-list")).toContainText("Issue #777");
  await expect(page.locator("#queue-status")).toContainText("Archive page 1.");
});

test("paginates archived requests independently from active queue items", async ({ page }) => {
  await page.goto("/");

  await page.locator("#queue-archive").click();
  await expect(page.locator("#queue-archive-count")).toContainText("2 requests");
  await expect(page.getByText("Expose co-author credit on the intake form")).toBeVisible();

  await page.getByRole("button", { name: "Older" }).click();

  await expect(page.locator("#queue-page-label")).toContainText("Archive page 2");
  await expect(page.locator("#queue-archive-list").getByText("Archive older queue experiments cleanly")).toBeVisible();
  await expect(page.getByText("Radically improve the homepage art direction").first()).toBeVisible();
});
