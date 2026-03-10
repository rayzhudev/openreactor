import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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
            statusDetail: "PR open",
            statusUpdatedAt: "2026-03-10T13:40:00.000Z"
          },
        ],
        archivedItems: archivedPages[archivePage] || [],
        items: [
          {
            number: 101,
            title: "Radically improve the homepage art direction",
            status: "in-progress",
            url: "https://github.com/rayzhudev/openreactor/issues/101",
            createdAt: "2026-03-10T13:32:11.567Z",
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
});

test("renders the redesign and submits a request through the mocked API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: /pressure builds the brief/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /write the next pressure point/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /requests in the open/i })).toBeVisible();
  await expect(page.getByText("Radically improve the homepage art direction").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /leaderboard/i })).toBeVisible();
  await expect(page.getByText("Requester").first()).toBeVisible();

  await page.locator("#request").fill(
    "The landing page feels generic. Redesign it into a more editorial layout with stronger hierarchy while keeping the form and public queue on the same page."
  );
  await page.locator("#github-username").fill("@designreviewer");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.locator("#form-status")).toContainText("Request queued as issue #777.");
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
