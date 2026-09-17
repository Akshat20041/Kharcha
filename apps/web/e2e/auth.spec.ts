import { test, expect, type Page } from "@playwright/test";

test("reopening a saved session recovers from network errors and a slow API without another login", async ({ page, context }) => {
  await login(page, "a@example.test");
  await page.close();
  const reopened = await context.newPage();
  let attempts = 0;
  await reopened.route("http://localhost:3311/me", async (route) => {
    attempts++;
    if (attempts === 1) return route.abort("failed");
    if (attempts === 2) return route.fulfill({ status: 503, body: "Service waking up" });
    await new Promise((resolve) => setTimeout(resolve, 14000));
    await route.continue();
  });
  await reopened.goto("/");
  await expect(reopened.getByRole("status")).toContainText("retry automatically");
  await expect(reopened.getByRole("heading", { name: "Your expenses" })).toBeVisible({ timeout: 25000 });
  expect(attempts).toBe(3);
  await expect(reopened.getByRole("heading", { name: "Welcome back" })).toHaveCount(0);
  await reopened.close();
});

test("account retries are bounded and the error screen can recover or sign out", async ({ page }) => {
  await login(page, "a@example.test");
  let attempts = 0;
  await page.route("http://localhost:3311/me", (route) => { attempts++; return route.fulfill({ status: 503, body: "Unavailable" }); });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Couldn’t open your account" })).toBeVisible({ timeout: 15000 });
  expect(attempts).toBe(4);
  await page.unroute("http://localhost:3311/me");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your expenses" })).toBeVisible();
  await page.route("http://localhost:3311/me", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }) }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Couldn’t open your account" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("password recovery verifies the email code, validates confirmation and changes the password", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Forgot password?" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("b@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  const email = await request.get("http://127.0.0.1:3312/__test/recovery-link?email=b@example.test");
  const { url } = await email.json();
  await page.goto(url);
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("Reset-password-456!");
  await page.getByLabel("Confirm new password").fill("Not-matching-123!");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("Passwords do not match");
  await page.getByLabel("Confirm new password").fill("Reset-password-456!");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("b@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Reset-password-456!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your expenses" })).toBeVisible();
  // Restore the fixture password for the remaining account-isolation tests.
  await page.goto("/reset-password");
  await page.getByLabel("New password", { exact: true }).fill("Test-only-pass-123!");
  await page.getByLabel("Confirm new password").fill("Test-only-pass-123!");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await page.goto(url);
  await expect(page.locator("main [role=alert]")).toContainText("invalid or expired");
  await expect(page.getByRole("button", { name: "Update password" })).toHaveCount(0);
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Test-only-pass-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your expenses" })).toBeVisible();
}
async function expense(page: Page, description: string) {
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount INR").fill("100");
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Food & Dining" });
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("article", { name: description, exact: true })).toBeVisible();
}

test("protected pages, signup, confirmation and useful sign-in errors", async ({ page }) => {
  const response = await page.goto("/dashboard");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-powered-by"]).toBeUndefined();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(0);
  await page.getByLabel("Email").fill("a@example.test"); await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("Email or password is incorrect");
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Email").fill("confirm@example.test"); await page.getByLabel("Password").fill("Test-only-pass-123!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.getByLabel("Email").fill("new@example.test"); await page.getByLabel("Password").fill("Test-only-pass-123!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your expenses" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
});

test("sessions survive refresh, profile timezone persists, exports authenticate and accounts remain isolated", async ({ page, browser }) => {
  await login(page, "a@example.test"); await expense(page, "Only account A");
  await page.reload(); await expect(page.getByRole("article", { name: "Only account A", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Display name").fill("Account A"); await page.getByLabel("Timezone", { exact: true }).fill("America/Los_Angeles");
  await page.getByRole("button", { name: "Save settings" }).click(); await expect(page.getByRole("status")).toContainText("saved");
  await page.reload(); await expect(page.getByLabel("Display name")).toHaveValue("Account A");
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("America/Los Angeles");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Export Excel" }).click();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download Excel" }).click();
  expect((await download).suggestedFilename()).toBe("KharCha_all_expenses.xlsx");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const second = await browser.newContext(); const b = await second.newPage();
  try {
    await login(b, "b@example.test"); await expect(b.getByRole("article", { name: "Only account A", exact: true })).toHaveCount(0);
    await expense(b, "Only account B");
    await b.getByRole("link", { name: "Settings", exact: true }).click(); await expect(b.getByLabel("Display name")).toHaveValue("");
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
    await login(page, "b@example.test");
    await expect(page.getByRole("article", { name: "Only account A", exact: true })).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Only account B", exact: true })).toBeVisible();
  } finally { await second.close(); }
});

test("expired persisted sessions refresh and rejected API sessions return to login", async ({ page }) => {
  await login(page, "a@example.test");
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.endsWith("-auth-token"))!;
    const session = JSON.parse(localStorage.getItem(key)!); session.expires_at = 1;
    localStorage.setItem(key, JSON.stringify(session));
  });
  const refreshed = page.waitForResponse((response) => response.url().includes("grant_type=refresh_token") && response.status() === 200);
  await page.reload(); await refreshed;
  await expect(page.getByRole("heading", { name: "Your expenses" })).toBeVisible();
  await page.route("http://localhost:3311/transactions**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Session expired" }) }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("article")).toHaveCount(0);
});
