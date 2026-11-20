import { test, expect } from "@playwright/test";
import { API_BASE, UI_ORIGIN } from "./support/api";

const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
async function fixture(page, request, name) {
  const response = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { name, lat: 24.204, lng: 121.005 },
  });
  expect(response.status()).toBe(201);
  const project = await response.json(),
    pending = new Set();
  let releasing = false;
  await page.clock.install();
  await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/services.arcgisonline.com/**", (route) => route.abort());
  await page.route(
    (url) =>
      url.hostname === "geomap.gsmma.gov.tw" &&
      url.pathname.includes("mapagent.fcgi"),
    async (route) => {
      if (releasing) {
        await route.abort();
        return;
      }
      pending.add(route);
    },
  );
  return {
    project,
    pending,
    async cleanup() {
      releasing = true;
      await Promise.all(
        [...pending].map((route) => route.abort().catch(() => {})),
      );
      pending.clear();
      await request.delete(`${API_BASE}/api/projects/${project.id}`, {
        headers,
      });
    },
  };
}
async function enableGeology(page, project, pending) {
  await page.goto(`/#/projects/${project.id}`);
  await page.getByRole("button", { name: "地圖圖層", exact: true }).click();
  const toggle = page.getByRole("checkbox", {
    name: "顯示地質圖圖層",
    exact: true,
  });
  await toggle.check();
  await expect.poll(() => pending.size).toBeGreaterThan(0);
  await expect(page.locator(".layer-loading")).toContainText("正在載入地質圖");
  return toggle;
}
async function expectNewTimeout(page) {
  await page.clock.fastForward(15_100);
  await expect(page.locator('.layer-error [role="alert"]')).toContainText(
    "地質圖載入逾時",
  );
  await expect(page.locator(".layer-loading")).toHaveCount(0);
}

test("retrying a pending geology service starts a fresh timeout after the first timeout", async ({
  page,
  request,
}) => {
  const context = await fixture(page, request, "地質圖逾時重試驗收");
  try {
    await enableGeology(page, context.project, context.pending);
    await expectNewTimeout(page);
    await page
      .getByRole("button", { name: "重新載入地質圖", exact: true })
      .click();
    await expect(page.locator(".layer-loading")).toContainText(
      "正在載入地質圖",
    );
    await expect(page.locator(".layer-error")).toHaveCount(0);
    await expectNewTimeout(page);
  } finally {
    await context.cleanup();
  }
});

test("disabling and reopening a pending geology layer also starts a fresh timeout", async ({
  page,
  request,
}) => {
  const context = await fixture(page, request, "地質圖關閉重開逾時驗收");
  try {
    const toggle = await enableGeology(page, context.project, context.pending);
    await page.clock.fastForward(5_000);
    await toggle.uncheck();
    await expect(page.locator(".layer-loading,.layer-error")).toHaveCount(0);
    await toggle.check();
    await expect(page.locator(".layer-loading")).toContainText(
      "正在載入地質圖",
    );
    await expectNewTimeout(page);
  } finally {
    await context.cleanup();
  }
});
