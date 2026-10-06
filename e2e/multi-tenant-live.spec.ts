import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The whole product in one story:
 *   An Acme ADMIN removes a widget and saves the layout.
 *   An Acme VIEWER sees the widget disappear live (no reload) and can't edit.
 *   A Nova VIEWER, in another tenant, sees no change at all.
 *
 * Covers: login, JWT + tenant scoping, RBAC in the UI, the WebSocket push of
 * dashboard updates, live data, and tenant isolation, end to end.
 */

const ORG_ROW = { acme: 0, nova: 1 } as const;
const WIDGET = "Events by source (1h)";

async function signIn(browser: Browser, org: keyof typeof ORG_ROW, role: "Admin" | "Viewer"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  // Demo account buttons fill the form; each organisation has its own row.
  await page.getByRole("button", { name: role, exact: true }).nth(ORG_ROW[org]).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  // Live: the WebSocket connected and the first snapshot arrived.
  await expect(page.locator("header").getByRole("status").first()).toHaveText(/Live/);
  await expect(page.getByText("events/s")).toBeVisible();
  return page;
}

test("an admin's layout change reaches viewers of the same tenant live, and no one else", async ({ browser }) => {
  const admin = await signIn(browser, "acme", "Admin");
  const acmeViewer = await signIn(browser, "acme", "Viewer");
  const novaViewer = await signIn(browser, "nova", "Viewer");

  // Live data is flowing: the first KPI shows a number.
  await expect(admin.locator("main p.tabular").first()).toHaveText(/\d/);

  // RBAC in the UI: viewers can't edit (the server would refuse anyway).
  await expect(acmeViewer.getByRole("button", { name: "Edit layout" })).toBeDisabled();
  await expect(acmeViewer.getByText(WIDGET)).toBeVisible();
  await expect(novaViewer.getByText(WIDGET)).toBeVisible();

  // The admin removes a widget and saves.
  await admin.getByRole("button", { name: "Edit layout" }).click();
  await admin.getByRole("button", { name: `Remove ${WIDGET}` }).click();
  await admin.getByRole("button", { name: "Save layout" }).click();
  await expect(admin.getByText("Layout saved")).toBeVisible();
  await expect(admin.getByText(WIDGET)).toHaveCount(0);

  // Same tenant: pushed over the WebSocket, no reload.
  await expect(acmeViewer.getByText(WIDGET)).toHaveCount(0);
  await expect(acmeViewer.getByText(/^Version 2,/)).toBeVisible();

  // Other tenant: untouched.
  await novaViewer.waitForTimeout(1500);
  await expect(novaViewer.getByText(WIDGET)).toBeVisible();
  await expect(novaViewer.getByText(/^Version 1,/)).toBeVisible();
});
