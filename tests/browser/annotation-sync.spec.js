import { test, expect } from "@playwright/test";
import { API_BASE, UI_ORIGIN } from "./support/api";
import { openAnnotations } from "./support/maps";
import { writeKml } from "../../shared/kml.js";

const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
const annotation = {
  name: "同步回應前匯入的測點",
  description: "標註變更必須保留",
  geometry: { type: "Point", coordinates: [121.005, 24.204] },
};

async function projectFixture(request, name) {
  const response = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { name, lat: 24.204, lng: 121.005 },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function blockTiles(page) {
  await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
  await page.route("**/services.arcgisonline.com/**", (route) => route.abort());
}
async function delayNextFeatureRead(page, projectId) {
  let unblock, started, delivered;
  const gate = new Promise((resolve) => {
      unblock = resolve;
    }),
    reading = new Promise((resolve) => {
      started = resolve;
    }),
    delivery = new Promise((resolve) => {
      delivered = resolve;
    });
  let intercepted = false;
  await page.route(
    `${API_BASE}/api/projects/${projectId}/features?*`,
    async (route) => {
      if (intercepted || route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      intercepted = true;
      const response = await route.fetch(),
        snapshot = await response.json();
      started();
      await gate;
      try {
        await route.fulfill({ response, json: snapshot });
      } finally {
        delivered();
      }
    },
  );
  return {
    reading,
    unblock,
    async release() {
      unblock();
      await delivery;
      // Let the delivered body and Vue's queued render settle before checking retained state.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    },
  };
}

test("a delayed project read cannot erase a successfully imported KML annotation", async ({
  page,
  request,
}) => {
  const project = await projectFixture(request, "標註新增與舊同步回應"),
    path = `${API_BASE}/api/projects/${project.id}/features`;
  let delayed;
  try {
    await blockTiles(page);
    delayed = await delayNextFeatureRead(page, project.id);
    await page.goto("/");
    await page.locator(`[data-project-id="${project.id}"]`).click();
    await delayed.reading;
    await openAnnotations(page, 0);
    await page
      .getByLabel("匯入 KML 或 KMZ", { exact: true })
      .setInputFiles({
        name: "new-point.kml",
        mimeType: "application/vnd.google-earth.kml+xml",
        buffer: Buffer.from(writeKml([annotation])),
      });
    const dialog = page.getByRole("dialog", {
      name: "儲存地圖標註",
      exact: true,
    });
    await dialog
      .getByLabel("管理員金鑰", { exact: true })
      .fill("local-development-only-not-for-production");
    await dialog.getByRole("button", { name: "儲存標註", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const card = page.getByRole("article", {
      name: `標註資訊：${annotation.name}`,
      exact: true,
    });
    await expect(card).toBeVisible();
    expect(
      (await request.get(path).then((response) => response.json())).items,
    ).toHaveLength(1);
    await delayed.release();
    await expect(card).toBeVisible();
    await expect(page.locator(".annotation-marker")).toHaveCount(1);
  } finally {
    delayed?.unblock();
    await request.delete(`${API_BASE}/api/projects/${project.id}`, { headers });
  }
});

test("a delayed synchronization cannot restore an annotation after successful deletion", async ({
  page,
  request,
}) => {
  const project = await projectFixture(request, "標註刪除與舊同步回應"),
    path = `${API_BASE}/api/projects/${project.id}/features`;
  let delayed;
  try {
    const created = await request.post(path, {
      headers,
      data: {
        geojson: {
          type: "Feature",
          properties: {
            name: annotation.name,
            description: annotation.description,
          },
          geometry: annotation.geometry,
        },
      },
    });
    expect(created.status()).toBe(201);
    await blockTiles(page);
    await page.goto(`/#/projects/${project.id}`);
    await openAnnotations(page, 1);
    delayed = await delayNextFeatureRead(page, project.id);
    await page.getByRole("button", { name: "重新同步", exact: true }).click();
    await delayed.reading;
    await page
      .getByRole("button", {
        name: `刪除標註：${annotation.name}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "刪除地圖標註",
      exact: true,
    });
    await dialog
      .getByLabel("管理員金鑰", { exact: true })
      .fill("local-development-only-not-for-production");
    await dialog.getByRole("button", { name: "確認刪除", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const card = page.getByRole("article", {
      name: `標註資訊：${annotation.name}`,
      exact: true,
    });
    await expect(card).toHaveCount(0);
    expect(
      (await request.get(path).then((response) => response.json())).items,
    ).toHaveLength(0);
    await delayed.release();
    await expect(card).toHaveCount(0);
    await expect(page.locator(".annotation-marker")).toHaveCount(0);
  } finally {
    delayed?.unblock();
    await request.delete(`${API_BASE}/api/projects/${project.id}`, { headers });
  }
});
