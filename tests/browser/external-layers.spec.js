import { test, expect } from "@playwright/test";
import { API_BASE, UI_ORIGIN } from "./support/api";
const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC0sAAAAASUVORK5CYII=",
  "base64",
);
test("basemaps are exclusive while geology and annotations are independent overlays with source, opacity and recovery", async ({
  page,
  request,
}) => {
  const project = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "外部地質圖層驗收", lat: 24.2, lng: 121 },
    })
    .then((r) => r.json());
  let fail = false;
  const requests = [];
  try {
    await request.post(`${API_BASE}/api/projects/${project.id}/events`, {
      headers,
      data: {
        title: "地質圖上的事件",
        description: "",
        occurred_at: "2026-11-20T01:00:00Z",
        lat: 24.2,
        lng: 121,
      },
    });
    await request.post(`${API_BASE}/api/projects/${project.id}/features`, {
      headers,
      data: {
        geojson: {
          type: "Feature",
          properties: { name: "獨立標註" },
          geometry: { type: "Point", coordinates: [121.001, 24.201] },
        },
      },
    });
    await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
    await page.route("**/services.arcgisonline.com/**", (route) =>
      route.abort(),
    );
    await page.route(
      (url) =>
        url.hostname === "geomap.gsmma.gov.tw" &&
        url.pathname.includes("mapagent.fcgi"),
      async (route) => {
        requests.push(new URL(route.request().url()));
        if (fail) await route.abort();
        else await route.fulfill({ contentType: "image/png", body: png });
      },
    );
    await page.goto(`/#/projects/${project.id}`);
    await page.getByRole("button", { name: "地圖圖層", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "底圖", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "資料圖層", exact: true }),
    ).toBeVisible();
    const geology = page.getByRole("checkbox", {
      name: "顯示地質圖圖層",
      exact: true,
    });
    await expect(geology).not.toBeChecked();
    expect(requests).toHaveLength(0);
    await geology.check();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect(
      page.locator(".leaflet-external-data-pane .leaflet-tile-loaded").first(),
    ).toBeVisible();
    const parameters = new URLSearchParams(
      [...requests[0].searchParams].map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    expect(parameters.get("layers")).toBe("WMS/50K_Geomap_strata");
    expect(parameters.get("srs")).toBe("EPSG:4326");
    await expect(page.getByText("1:50,000", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "地質圖來源", exact: true }),
    ).toHaveAttribute("href", /geomap\.gsmma\.gov\.tw/);
    await page.getByRole("radio", { name: "基本地圖", exact: true }).check();
    await expect(
      page.getByRole("radio", { name: "衛星影像", exact: true }),
    ).not.toBeChecked();
    await expect(geology).toBeChecked();
    await page.getByRole("checkbox", { name: "顯示標註圖層" }).check();
    await expect(page.locator(".annotation-marker")).toHaveCount(1);
    await page
      .getByRole("slider", { name: "地質圖不透明度", exact: true })
      .evaluate((element) => {
        element.value = "40";
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await expect
      .poll(() =>
        page
          .locator(".leaflet-external-data-pane .leaflet-layer")
          .evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("0.4");
    await geology.uncheck();
    await expect(
      page.locator(".leaflet-external-data-pane .leaflet-tile"),
    ).toHaveCount(0);
    fail = true;
    await geology.check();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "地圖圖層", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("地質圖");
    await expect(
      page.locator('.leaflet-marker-icon[title="事件：地質圖上的事件"]'),
    ).toBeVisible();
    fail = false;
    await page
      .getByRole("button", { name: "重新載入地質圖", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(
      page.locator(".leaflet-external-data-pane .leaflet-tile-loaded").first(),
    ).toBeVisible();
    expect(
      (
        await request
          .get(`${API_BASE}/api/projects/${project.id}/features`)
          .then((r) => r.json())
      ).items,
    ).toHaveLength(1);
  } finally {
    await fetch(`${API_BASE}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
  }
});
