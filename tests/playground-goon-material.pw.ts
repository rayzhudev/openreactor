import { expect, test } from "@playwright/test";

test("playground links to the goon material recommender", async ({ page }) => {
  await page.goto("/playground/");

  const card = page.getByRole("link", { name: /Goon Material Recommender/i });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", "/playground/goon-material/");
});

test("goon material page renders on desktop and mobile", async ({ browser }) => {
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await desktopPage.goto("/playground/goon-material/");

  await expect(desktopPage.getByRole("heading", { level: 1, name: "Goon Material Recommender" })).toBeVisible();
  await expect(desktopPage.getByText(/No explicit content required/i)).toBeVisible();
  await expect(desktopPage.getByText(/Starter kit by category/i)).toBeVisible();
  await desktopPage.screenshot({
    path: "test-results/goon-material-desktop.png",
    fullPage: true
  });
  await desktopPage.close();

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto("/playground/goon-material/");

  await expect(mobilePage.getByRole("heading", { level: 1, name: "Goon Material Recommender" })).toBeVisible();
  await expect(mobilePage.getByRole("link", { name: /Back to playground/i })).toBeVisible();
  await mobilePage.screenshot({
    path: "test-results/goon-material-mobile.png",
    fullPage: true
  });
  await mobilePage.close();
});
