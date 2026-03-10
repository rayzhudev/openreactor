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

  await page.route("**/api/requests", async (route) => {
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

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repoUrl: "https://github.com/rayzhudev/openreactor",
        items: [
          {
            number: 101,
            title: "Radically improve the homepage art direction",
            status: "in-progress",
            url: "https://github.com/rayzhudev/openreactor/issues/101",
            createdAt: "2026-03-10T13:32:11.567Z"
          },
          {
            number: 98,
            title: "Expose co-author credit on the intake form",
            status: "complete",
            url: "https://github.com/rayzhudev/openreactor/issues/98",
            createdAt: "2026-03-10T09:14:00.000Z"
          }
        ]
      })
    });
  });
});

test("renders the redesign and submits a request through the mocked API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: /pressure builds the brief/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /write the next pressure point/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /requests in the open/i })).toBeVisible();
  await expect(page.getByText("Radically improve the homepage art direction")).toBeVisible();

  await page.locator("#request").fill(
    "The landing page feels generic. Redesign it into a more editorial layout with stronger hierarchy while keeping the form and public queue on the same page."
  );
  await page.locator("#github-username").fill("@designreviewer");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.locator("#form-status")).toContainText("Request queued as issue #777.");
  await expect(page.getByText("2 requests.")).toBeVisible();
});
