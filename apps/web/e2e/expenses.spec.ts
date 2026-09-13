import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });
const shots = resolve("../../Docs/verification");

async function beginExpense(page: Page, description: string, amount: string) {
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add expense", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Amount INR").fill(amount);
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Food & Dining" });
  return dialog;
}

test("normal, split, past, edit, delete, persistence, and mobile layout", async ({ page, request }) => {
  await mkdir(shots, { recursive: true });
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.goto("/");
  await expect(page.getByText("No expenses recorded yet.", { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(shots, "m4-empty.png"), fullPage: true });

  let dialog = await beginExpense(page, "Dinner", "500");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Expense saved");
  await expect(page.getByRole("status")).toContainText("₹500.00");
  const dinner = page.getByRole("article", { name: "Dinner", exact: true });
  await expect(dinner).toContainText("Food & Dining");
  const normal = (await (await request.get("http://localhost:3311/transactions")).json()).data.find((row: { description: string }) => row.description === "Dinner");
  expect(normal.my_share).toBe("500.00"); expect(normal.recoverable_amount).toBe("0.00");

  dialog = await beginExpense(page, "Dinner with friends", "1200");
  await dialog.getByRole("switch").check();
  await dialog.getByLabel("Number of people").fill("4");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("₹300.00");
  await expect(page.getByRole("status")).toContainText("₹900.00");
  await expect(page.getByRole("article", { name: "Dinner with friends", exact: true })).toContainText("4 people");

  dialog = await beginExpense(page, "Past dinner", "600");
  await dialog.getByLabel("Date", { exact: true }).fill("2026-09-05");
  await dialog.getByLabel("Time", { exact: true }).fill("20:30:00");
  await dialog.getByLabel("Notes Optional").fill("A meal to remember");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("region", { name: "5 Sept 2026", exact: true }).getByRole("article", { name: "Past dinner", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("article", { name: "Past dinner", exact: true })).toContainText("8:30 pm");
  await expect(page.getByRole("article", { name: "Past dinner", exact: true })).toContainText("A meal to remember");
  await page.screenshot({ path: resolve(shots, "m4-desktop.png"), fullPage: true });
  await dinner.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit expense", exact: true });
  await dialog.getByLabel("Amount INR").fill("600");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Expense updated");
  await expect(dinner).toContainText("₹600.00");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dismiss message" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(shots, "m4-mobile.png"), fullPage: true });
  await dinner.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit expense", exact: true });
  await dialog.getByRole("switch").check();
  await dialog.getByLabel("Number of people").fill("3");
  await page.screenshot({ path: resolve(shots, "m4-form.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dinner).toContainText("₹200.00");
  await dinner.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByRole("switch").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(dinner).not.toContainText("people");
  await dinner.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete expense?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep expense" }).click();
  await expect(dinner).toBeVisible();
  await dinner.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete expense", exact: true }).click();
  await expect(dinner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(2);
  expect((await request.get(`http://localhost:3311/transactions/${normal.id}`)).status()).toBe(404);
});

test("validation, save progress, duplicate prevention, and deletion errors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("highlighted fields");
  await expect(dialog.getByLabel("Amount INR")).toBeFocused();
  await dialog.getByLabel("Amount INR").fill("500");
  await dialog.getByLabel("Description", { exact: true }).fill("Delayed save");
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Food & Dining" });
  let posts = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/transactions", async (route) => {
    if (route.request().method() === "POST") { posts++; await gate; }
    await route.continue();
  });
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(page.getByRole("status")).toContainText("Expense saved");
  expect(posts).toBe(1);
  await page.unroute("**/transactions");
  const row = page.getByRole("article", { name: "Delayed save", exact: true });
  await page.route("**/transactions/*?confirm=true", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Internal server error"}' }));
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete expense", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("couldn't complete");
  await page.getByRole("button", { name: "Keep expense" }).click();
  await expect(row).toBeVisible();
});

test("daily groups show exact summaries and explain page boundaries", async ({ page, request }) => {
  const categories = (await (await request.get("http://localhost:3311/categories")).json()).data;
  const ids: string[] = [];
  async function add(description: string, date: string, amount: string, split = false) {
    const response = await request.post("http://localhost:3311/transactions", { data: {
      description, category_id: categories[0].id, total_amount: amount,
      transaction_date: date, transaction_time: split ? "12:00:00" : "20:00:00",
      is_split: split, participant_count: split ? 2 : null,
    } });
    expect(response.status()).toBe(201);
    ids.push((await response.json()).id);
  }
  try {
    await add("Shared meal", "2026-10-08", "2000", true);
    await add("Lunch party", "2026-10-08", "2000");
    await add("Shoes", "2026-10-03", "1234");
    await page.setViewportSize({ width: 1365, height: 1000 });
    await page.goto("/");
    const day = page.getByRole("region", { name: "8 Oct 2026", exact: true });
    await expect(day.locator(".day-spent")).toHaveText("₹3,000.00 personal spending");
    await expect(day.locator(".day-paid")).toContainText("Paid ₹4,000.00");
    await expect(day.locator(".day-paid")).toContainText("₹1,000.00 recoverable");
    await expect(day.getByRole("article").first()).toHaveAccessibleName("Lunch party");
    const older = page.getByRole("region", { name: "3 Oct 2026", exact: true });
    await expect(older.locator(".day-spent")).toHaveText("₹1,234.00 personal spending");
    await expect(older.locator(".day-paid")).toHaveText("Paid ₹1,234.00");
    await page.screenshot({ path: resolve(shots, "day-groups-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(shots, "day-groups-mobile.png"), fullPage: true });
    for (let i = 0; i < 21; i++) await add(`Page boundary ${i}`, "2026-10-09", "1");
    await page.reload();
    const boundary = page.getByRole("region", { name: "9 Oct 2026", exact: true });
    await expect(boundary.locator(".day-spent")).toHaveText("₹20.00 personal spending");
    await expect(page.getByText("Daily summaries include only expenses on this page. A day may continue on another page.")).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(boundary.locator(".day-spent")).toHaveText("₹1.00 personal spending");
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(boundary.getByRole("article")).toHaveCount(20);
  } finally {
    for (const id of ids) await request.delete(`http://localhost:3311/transactions/${id}?confirm=true`);
  }
});

test("recurring create, generate, edit, history, and deactivate", async ({ page }) => {
  await page.goto("/recurring");
  await page.getByRole("button", { name: "Add recurring expense", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Home WiFi");
  await dialog.getByLabel("Amount paid (INR)").fill("1500");
  await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Utilities" });
  await dialog.getByLabel("Start date", { exact: true }).fill("2026-09-01");
  await dialog.getByRole("switch").check();
  await dialog.getByLabel("Number of people").fill("3");
  await dialog.getByRole("button", { name: "Save recurring expense" }).click();
  const rule = page.getByRole("article", { name: "Home WiFi", exact: true });
  await expect(rule).toContainText("₹500.00 my share");
  await page.reload();
  await rule.getByRole("button", { name: "Generate due expenses" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toContainText("1 expense generated");
  await rule.getByRole("button", { name: "Generate due expenses" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toContainText("0 expenses generated");
  await rule.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Start date", { exact: true })).toBeDisabled();
  await dialog.getByLabel("Amount paid (INR)").fill("1800");
  await dialog.getByRole("button", { name: "Save recurring expense" }).click();
  await expect(rule).toContainText("₹600.00 my share");
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.screenshot({ path: resolve(shots, "m5-recurring-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(shots, "m5-recurring-mobile.png"), fullPage: true });
  await rule.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(rule).toContainText("Inactive");
  await expect(rule.getByRole("button", { name: "Generate due expenses" })).toHaveCount(0);
  await page.getByRole("navigation").getByRole("link", { name: "Transactions" }).click();
  const generated = page.getByRole("article", { name: "Home WiFi", exact: true });
  await expect(generated).toContainText("₹500.00");
  await expect(generated).toContainText("₹1,000.00 recoverable");
  await expect(generated).toContainText("Recurring");
});

test("dashboard monthly totals, expense entry, empty/errors, and mobile navigation", async ({ page, request }) => {
  const categories = (await (await request.get("http://localhost:3311/categories")).json()).data;
  const food = categories.find((item: { name: string }) => item.name === "Food & Dining");
  for (const split of [true, false]) {
    const response = await request.post("http://localhost:3311/transactions", { data: {
      description: "Dashboard sample", category_id: food.id, total_amount: "2000",
      transaction_date: "2026-07-08", is_split: split, participant_count: split ? 2 : null,
    } });
    expect(response.status()).toBe(201);
  }
  const rule = await request.post("http://localhost:3311/recurring-expenses", { data: {
    name: "Dashboard rent", category_id: food.id, total_amount: "14000", frequency: "monthly",
    start_date: "2026-07-01", end_date: "2026-07-31",
  } });
  expect(rule.status()).toBe(201);
  await request.post(`http://localhost:3311/recurring-expenses/${(await rule.json()).id}/generate`, { data: {} });
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Quick expense entry" })).toHaveCount(0);
  await expect(page.getByLabel("Month", { exact: true })).toBeEnabled();
  await page.getByLabel("Month", { exact: true }).fill("2026-07");
  const metric = (name: string) => page.getByRole("article", { name, exact: true });
  await expect(metric("Total personal spending")).toContainText("₹17,000.00");
  await expect(metric("Variable spending")).toContainText("₹3,000.00");
  await expect(metric("Fixed / recurring")).toContainText("₹14,000.00");
  await expect(metric("Total paid")).toContainText("₹18,000.00");
  await expect(metric("Recoverable")).toContainText("₹1,000.00");
  await expect(metric("Daily variable average")).toContainText("₹96.77");
  await expect(page.getByRole("region", { name: "Personal spending by category" })).toContainText("₹17,000.00");
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.screenshot({ path: resolve(shots, "m6-dashboard-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(shots, "m6-dashboard-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Amount INR")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Add Expense", exact: true })).toBeFocused();
  const dialog = await beginExpense(page, "Dashboard coffee", "500");
  await dialog.getByLabel("Date", { exact: true }).fill("2026-07-10");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(metric("Total personal spending")).toContainText("₹17,500.00");
  await page.getByRole("button", { name: "Previous month", exact: true }).click();
  await expect(page.getByText("No expenses for this month yet.")).toBeVisible();
  await expect(metric("Total paid")).toContainText("₹0.00");
  await page.route("**/analytics/monthly?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{}' }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("couldn't complete");
  await expect(metric("Total paid")).toHaveCount(0);
  await page.unroute("**/analytics/monthly?*");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(metric("Total paid")).toContainText("₹0.00");
  await page.getByRole("button", { name: "Current month", exact: true }).click();
  await expect(page.getByLabel("Month", { exact: true })).not.toHaveValue("2026-06");
  await page.getByRole("navigation").getByRole("link", { name: "Transactions" }).click();
  await expect(page.getByRole("heading", { name: "Your expenses", exact: true })).toBeVisible();
});

test("V2 quick entry requires confirmation, supports corrections, and preserves failed input", async ({ page, request }) => {
  await page.goto("/");
  const text = page.getByRole("textbox", { name: "What did you spend?", exact: true });
  await expect(page.getByRole("button", { name: "Review expense", exact: true })).toBeEnabled();
  const before = (await (await request.get("http://localhost:3311/transactions?limit=100")).json()).data.length;
  await text.fill("450 dinner at Meghana");
  await page.getByRole("button", { name: "Review expense", exact: true }).click();
  let review = page.getByRole("dialog", { name: "Review expense", exact: true });
  await expect(review.getByLabel("Amount INR")).toHaveValue("450.00");
  await expect(review.getByLabel("Merchant Optional")).toHaveValue("Meghana");
  expect((await (await request.get("http://localhost:3311/transactions?limit=100")).json()).data.length).toBe(before);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(text).toHaveValue("450 dinner at Meghana");
  await page.getByRole("button", { name: "Review expense", exact: true }).click();
  review = page.getByRole("dialog", { name: "Review expense", exact: true });
  await review.getByRole("button", { name: "Confirm expense", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Expense saved");
  let records = (await (await request.get("http://localhost:3311/transactions?limit=100")).json()).data;
  expect(records.length).toBe(before + 1); expect(records.some((row: { merchant: string }) => row.merchant === "Meghana")).toBe(true);
  await text.fill("1200 dinner yesterday split 4");
  await page.getByRole("button", { name: "Review expense", exact: true }).click();
  review = page.getByRole("dialog", { name: "Review expense", exact: true });
  await expect(review.getByLabel("Number of people")).toHaveValue("4");
  await review.getByLabel("Number of people").fill("2");
  await review.getByLabel("Description", { exact: true }).fill("Quick split dinner");
  await page.setViewportSize({ width: 390, height: 844 });
  await review.evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: resolve(shots, "v2-review-mobile.png") });
  await review.getByRole("button", { name: "Confirm expense", exact: true }).click();
  await expect(page.getByRole("article", { name: "Quick split dinner" })).toContainText("₹600.00");
  records = (await (await request.get("http://localhost:3311/transactions?limit=100")).json()).data;
  expect(records.find((row: { description: string }) => row.description === "Quick split dinner").my_share).toBe("600.00");
  await text.fill("coffee at Starbucks");
  await page.getByRole("button", { name: "Review expense", exact: true }).click();
  review = page.getByRole("dialog", { name: "Review expense", exact: true });
  await expect(review.getByLabel("Amount INR")).toHaveValue("");
  await expect(review).toContainText("No reliable amount found");
  await review.getByRole("button", { name: "Confirm expense", exact: true }).click();
  await expect(review.getByLabel("Amount INR")).toBeFocused();
  await review.getByLabel("Amount INR").fill("80");
  await review.getByRole("button", { name: "Confirm expense", exact: true }).click();
  await expect(page.getByRole("article", { name: "coffee", exact: true })).toBeVisible();
  await text.fill("provider unavailable");
  await page.getByRole("button", { name: "Review expense", exact: true }).click();
  await expect(page.getByRole("region", { name: "Quick expense entry" }).getByRole("alert")).toContainText("unavailable");
  await expect(text).toHaveValue("provider unavailable");
  await page.getByRole("button", { name: "Enter manually", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add expense", exact: true })).toBeVisible();
});

test("V3 ranges, daily values, category percentages, and trends render on desktop/mobile", async ({ page, request }) => {
  const food = (await (await request.get("http://localhost:3311/categories")).json()).data.find((item: { name: string }) => item.name === "Food & Dining");
  await request.post("http://localhost:3311/transactions", { data: { total_amount: "2000", description: "Range split", category_id: food.id,
    transaction_date: "2025-02-03", is_split: true, participant_count: 2 } });
  await page.goto("/analytics");
  await page.getByLabel("From", { exact: true }).fill("2025-02-01");
  await page.getByLabel("Through", { exact: true }).fill("2025-02-28");
  await page.getByRole("button", { name: "Apply range", exact: true }).click();
  await expect(page.getByRole("region", { name: "Range totals" })).toContainText("₹1,000.00");
  await expect(page.getByRole("region", { name: "Personal spending by category" })).toContainText("100.00%");
  await expect(page.getByRole("region", { name: "Period comparison" })).toContainText("No percentage comparison");
  await page.getByText("View daily values", { exact: true }).click();
  await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "3 Feb 2025", exact: true }) })).toContainText("₹1,000.00");
  await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "2 Feb 2025", exact: true }) })).toContainText("₹0.00");
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.screenshot({ path: resolve(shots, "v3-analytics-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(shots, "v3-analytics-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "This year", exact: true }).click();
  await expect(page.getByRole("region", { name: "Daily personal spending" })).toBeVisible();
});

test("Excel export downloads all records or a selected period, and preserves controls on failure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Export Excel", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export to Excel" });
  await expect(dialog).toBeVisible();
  let pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download Excel" }).click();
  let download = await pending;
  expect(download.suggestedFilename()).toBe("KharCha_all_expenses.xlsx");
  expect(await download.failure()).toBeNull();
  expect((await readFile((await download.path())!)).subarray(0, 2).toString()).toBe("PK");
  await expect(dialog.getByRole("status")).toContainText("workbook is ready");
  await dialog.getByLabel("Include").selectOption("range");
  await dialog.getByLabel("From", { exact: true }).fill("2026-07-01");
  await dialog.getByLabel("Through", { exact: true }).fill("2026-07-31");
  pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download Excel" }).click();
  download = await pending;
  expect(download.suggestedFilename()).toBe("KharCha_2026-07-01_to_2026-07-31.xlsx");
  await page.route("**/exports/expenses.xlsx?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Internal server error"}' }));
  await dialog.getByRole("button", { name: "Download Excel" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Couldn't prepare your export");
  await expect(dialog.getByLabel("From", { exact: true })).toHaveValue("2026-07-01");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(shots, "v5-export-mobile.png") });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
});

test("real backend outage preserves the draft and gives load/save errors", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  const dialog = await beginExpense(page, "Unsaved dinner", "500");
  await request.post("http://localhost:3311/__test/stop");
  await expect.poll(async () => {
    try { await request.get("http://localhost:3311/health", { timeout: 1000 }); return false; } catch { return true; }
  }).toBe(true);
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Couldn't confirm the change");
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue("Unsaved dinner");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("backend is running");
  await expect(page.getByText("No expenses recorded yet.", { exact: true })).toHaveCount(0);
});
