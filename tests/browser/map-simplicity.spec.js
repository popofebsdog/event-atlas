import { API_BASE, UI_ORIGIN } from "./support/api";
import { test, expect } from "@playwright/test";
const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
test("basemaps, data layers and annotation creation have independent tools on desktop and mobile", async ({
  page,
  request,
}) => {
  const project = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "簡潔地圖操作", lat: 24, lng: 121 },
    })
    .then((r) => r.json());
  try {
    await request.post(`${API_BASE}/api/projects/${project.id}/events`, {
      headers,
      data: {
        title: "固定顯示事件",
        description: "",
        occurred_at: "2026-11-20T01:00:00Z",
        lat: 24,
        lng: 121,
      },
    });
    await request.post(`${API_BASE}/api/projects/${project.id}/features`, {
      headers,
      data: {
        geojson: {
          type: "Feature",
          properties: { name: "可選標註" },
          geometry: { type: "Point", coordinates: [121.001, 24.001] },
        },
      },
    });
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto(`/#/projects/${project.id}`);
    await expect(
      page.getByRole("button", { name: "瀏覽", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "事件", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: "顯示事件圖層" }),
    ).toHaveCount(0);
    await expect(page.locator(".map-legend")).toHaveCount(0);
    const sidebar = page.getByRole("complementary", { name: "專案事件時間軸" });
    await expect(
      sidebar.getByRole("heading", { name: "事件時間軸" }),
    ).toBeVisible();
    await expect(sidebar.getByText("地圖標註")).toHaveCount(0);
    const event = page.locator(
        '.leaflet-marker-icon[title="事件：固定顯示事件"]',
      ),
      annotation = page.locator('.leaflet-marker-icon[title="標註：可選標註"]');
    await expect(event).toBeVisible();
    await expect(annotation).toHaveCount(0);
    const basemapTool = page.getByRole("button", {
      name: "地圖底圖",
      exact: true,
    });
    const layerTool = page.getByRole("button", {
      name: "地圖圖層",
      exact: true,
    });
    const createTool = page.getByRole("button", {
      name: "建立標註",
      exact: true,
    });
    await expect(basemapTool).toBeVisible();
    await expect(layerTool).toBeVisible();
    await expect(createTool).toBeVisible();
    await basemapTool.click();
    await expect(
      page.getByRole("group", { name: "底圖", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("radio", { name: "基本地圖", exact: true }).check();
    await expect(
      page.getByRole("radio", { name: "衛星影像", exact: true }),
    ).not.toBeChecked();
    await layerTool.click();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "資料圖層", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".layer-popover")
        .getByRole("button", { name: /標註|標點|畫線|畫面/ }),
    ).toHaveCount(0);
    await expect(page.getByText("事件固定顯示", { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "顯示標註圖層" }).check();
    await expect(annotation).toBeVisible();
    await page.getByRole("checkbox", { name: "顯示標註圖層" }).uncheck();
    await expect(annotation).toHaveCount(0);
    await expect(event).toBeVisible();
    await page.getByRole("checkbox", { name: "顯示標註圖層" }).check();
    await expect(annotation).toBeVisible();
    await createTool.click();
    await expect(page.locator(".layer-popover")).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "地圖標註管理" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "標點", exact: true }),
    ).toBeVisible();
    await basemapTool.click();
    await expect(
      page.getByRole("complementary", { name: "地圖標註管理" }),
    ).not.toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".layer-popover")).toHaveCount(0);
    const extent = page
      .locator(".leaflet-control-zoom")
      .getByRole("button", { name: "專案範圍", exact: true });
    await expect(extent).toBeVisible();
    await extent.click();
    await sidebar
      .getByRole("button", { name: "地圖選點新增事件", exact: true })
      .click();
    await page.locator("#map").click({ position: { x: 120, y: 180 } });
    await expect(
      page.getByRole("heading", { name: "新增時間軸事件", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "關閉表單", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(
      page.getByRole("button", { name: "標註", exact: true }),
    ).toHaveCount(0);
    for (const tool of [basemapTool, layerTool, createTool]) {
      await expect(tool).toBeInViewport();
      expect((await tool.boundingBox()).height).toBe(44);
    }
    await basemapTool.click();
    await expect(
      page.getByRole("radio", { name: "基本地圖", exact: true }),
    ).toBeChecked();
    await layerTool.click();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: "顯示標註圖層" }),
    ).toBeVisible();
    await createTool.click();
    await expect(
      page.getByRole("button", { name: "標點", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await request.delete(`${API_BASE}/api/projects/${project.id}`, { headers });
  }
});
