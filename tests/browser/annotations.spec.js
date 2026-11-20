import { API_BASE, UI_ORIGIN } from "./support/api";
import { writeKml, readKml } from "../../shared/kml.js";
import { openAnnotations } from "./support/maps";
import { test, expect } from "@playwright/test";
const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
const collection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "匯入站點", description: "示範點" },
      geometry: { type: "Point", coordinates: [121, 24] },
    },
    {
      type: "Feature",
      properties: { name: "巡查路線" },
      geometry: {
        type: "LineString",
        coordinates: [
          [121, 24],
          [121.01, 24.01],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "調查範圍" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [121, 24],
            [121.01, 24],
            [121.01, 24.01],
            [121, 24],
          ],
        ],
      },
    },
  ],
};
test("project geometry imports atomically, stays isolated, exports and deletes with administrator checks", async ({
  page,
  request,
}) => {
  const project = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "標註專案測試", lat: 24, lng: 121 },
    })
    .then((r) => r.json());
  const other = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "另一地區專案", lat: 25, lng: 121 },
    })
    .then((r) => r.json());
  const path = `${API_BASE}/api/projects/${project.id}/features`;
  try {
    expect(
      (await request.post(path, { data: { geojson: collection } })).status(),
    ).toBe(403);
    const invalid = structuredClone(collection);
    invalid.features[2].geometry.coordinates[0][0] = [999, 24];
    expect(
      (
        await request.post(path, { headers, data: { geojson: invalid } })
      ).status(),
    ).toBe(400);
    expect((await request.get(path).then((r) => r.json())).items).toHaveLength(
      0,
    );
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto("/");
    await page.locator(`[data-project-id="${project.id}"]`).click();
    await openAnnotations(page, 0);
    await expect(page.getByText("地圖標註 · 0", { exact: true })).toBeVisible();
    await page
      .getByLabel("匯入 KML 或 KMZ")
      .setInputFiles({
        name: "sample.kml",
        mimeType: "application/vnd.google-earth.kml+xml",
        buffer: Buffer.from(
          writeKml(
            collection.features.map((feature) => ({
              ...feature.properties,
              description: feature.properties.description || "",
              geometry: feature.geometry,
            })),
          ),
        ),
      });
    const dialog = page.getByRole("dialog", { name: "儲存地圖標註" });
    await expect(dialog.getByText("將新增 3 筆標註")).toBeVisible();
    await dialog
      .getByLabel("管理員金鑰")
      .fill("local-development-only-not-for-production");
    await dialog.getByRole("button", { name: "儲存標註", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "定位標註：匯入站點" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnnotations(page);
    await page.getByRole("button", { name: "定位標註：匯入站點" }).click();
    await expect(page.locator("#map")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    const rows = await request.get(path).then((r) => r.json());
    expect(rows.items).toHaveLength(3);
    expect(new Set(rows.items.map((f) => f.geometry.type))).toEqual(
      new Set(["Point", "LineString", "Polygon"]),
    );
    expect(await page.locator(".annotation-layer").count()).toBe(3);
    await page.reload();
    await openAnnotations(page, 3);
    await expect(
      page.getByRole("button", { name: "定位標註：匯入站點" }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "匯出 KML／KMZ", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "匯出地圖標註" })
      .getByLabel("管理員金鑰")
      .fill("local-development-only-not-for-production");
    await page
      .getByRole("dialog", { name: "匯出地圖標註" })
      .getByRole("button", { name: "驗證並匯出" })
      .click();
    const file = await (await download).path();
    const { readFile } = await import("node:fs/promises");
    const exported = readKml(await readFile(file, "utf8"));
    expect(exported).toHaveLength(3);
    await page
      .getByRole("button", { name: "所有地區專案", exact: true })
      .click();
    await page.locator(`[data-project-id="${other.id}"]`).click();
    await openAnnotations(page, 0);
    await page.getByRole("button", { name: "畫線", exact: true }).click();
    await page.locator("#map").click({ position: { x: 240, y: 180 } });
    await page.getByRole("button", { name: "取消繪製", exact: true }).click();
    expect(await page.locator(".drawing-progress").count()).toBe(0);
    expect(
      (
        await request
          .get(`${API_BASE}/api/projects/${other.id}/features`)
          .then((r) => r.json())
      ).items,
    ).toHaveLength(0);
    await expect(page.getByText("地圖標註 · 0", { exact: true })).toBeVisible();
    expect(await page.locator(".annotation-layer").count()).toBe(0);
    await page
      .getByRole("button", { name: "所有地區專案", exact: true })
      .click();
    await page.locator(`[data-project-id="${project.id}"]`).click();
    await openAnnotations(page, 3);
    await expect(
      page.getByRole("button", { name: "定位標註：匯入站點" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "刪除標註：匯入站點" }).click();
    await page
      .getByRole("dialog", { name: "刪除地圖標註" })
      .getByRole("button", { name: "確認刪除" })
      .click();
    await expect(
      page.getByRole("button", { name: "定位標註：匯入站點" }),
    ).toHaveCount(0);
    expect((await request.get(path).then((r) => r.json())).items).toHaveLength(
      2,
    );
  } finally {
    await fetch(`${API_BASE}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
    expect((await fetch(path).then((r) => r.json())).items).toHaveLength(0);
    await fetch(`${API_BASE}/api/projects/${other.id}`, {
      method: "DELETE",
      headers,
    });
  }
});
test("map drawing saves a point, line and polygon without creating extra projects or events", async ({
  page,
  request,
}) => {
  const project = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "地圖繪製測試", lat: 24, lng: 121 },
    })
    .then((r) => r.json());
  try {
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto("/");
    await page.locator(`[data-project-id="${project.id}"]`).click();
    await openAnnotations(page, 0);
    for (const [tool, name, positions] of [
      ["標點", "繪製觀測點", [{ x: 240, y: 180 }]],
      [
        "畫線",
        "繪製巡查線",
        [
          { x: 240, y: 180 },
          { x: 320, y: 280 },
        ],
      ],
      [
        "畫面",
        "繪製調查面",
        [
          { x: 240, y: 180 },
          { x: 320, y: 180 },
          { x: 320, y: 280 },
        ],
      ],
    ]) {
      await page.getByRole("button", { name: tool, exact: true }).click();
      for (const position of positions)
        await page.locator("#map").click({ position });
      if (positions.length > 1)
        await page
          .getByRole("button", { name: "完成繪製", exact: true })
          .click();
      const dialog = page.getByRole("dialog", { name: "儲存地圖標註" });
      await dialog.getByLabel("標註名稱").fill(name);
      await dialog
        .getByLabel("管理員金鑰")
        .fill("local-development-only-not-for-production");
      await dialog
        .getByRole("button", { name: "儲存標註", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: `定位標註：${name}` }),
      ).toBeVisible();
    }
    const rows = await request
      .get(`${API_BASE}/api/projects/${project.id}/features`)
      .then((r) => r.json());
    expect(rows.items).toHaveLength(3);
    const events = await request
      .get(`${API_BASE}/api/projects/${project.id}/events`)
      .then((r) => r.json());
    expect(events.items).toHaveLength(0);
    await page.screenshot({
      path: "test-results/project-annotations-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator("#map").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/project-annotations-mobile.png",
    });
  } finally {
    await fetch(`${API_BASE}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
  }
});
