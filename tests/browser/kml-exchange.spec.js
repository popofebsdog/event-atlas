import { API_BASE, UI_ORIGIN } from "./support/api";
import { openAnnotations } from "./support/maps";
import { test, expect } from "@playwright/test";
import { readKmz, writeKmz } from "../../shared/kml.js";
const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
const features = [
  {
    name: "交換測點",
    description: "名稱與說明原樣保存",
    geometry: { type: "Point", coordinates: [121, 24] },
  },
  {
    name: "交換範圍",
    description: "包含內環",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [121, 24],
          [121.02, 24],
          [121.02, 24.02],
          [121, 24.02],
          [121, 24],
        ],
        [
          [121.005, 24.005],
          [121.005, 24.01],
          [121.01, 24.01],
          [121.01, 24.005],
          [121.005, 24.005],
        ],
      ],
    },
  },
];
test("KMZ imports project annotation cards and exports selectable KMZ without creating timeline events", async ({
  page,
  request,
}) => {
  const project = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "KMZ 交換驗收", lat: 24, lng: 121 },
    })
    .then((r) => r.json());
  try {
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto(`/#/projects/${project.id}`);
    await openAnnotations(page, 0);
    await page
      .getByLabel("匯入 KML 或 KMZ")
      .setInputFiles({
        name: "field.kmz",
        mimeType: "application/vnd.google-earth.kmz",
        buffer: Buffer.from(writeKmz(features)),
      });
    const editor = page.getByRole("dialog", { name: "儲存地圖標註" });
    await expect(editor.getByText("將新增 2 筆標註")).toBeVisible();
    await editor
      .getByLabel("管理員金鑰")
      .fill("local-development-only-not-for-production");
    await editor.getByRole("button", { name: "儲存標註", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(
      page.getByRole("article", { name: "標註資訊：交換測點", exact: true }),
    ).toContainText("名稱與說明原樣保存");
    expect(
      (
        await request
          .get(`${API_BASE}/api/projects/${project.id}/events`)
          .then((r) => r.json())
      ).items,
    ).toHaveLength(0);
    await page
      .getByRole("button", { name: "匯出 KML／KMZ", exact: true })
      .click();
    const exporter = page.getByRole("dialog", { name: "匯出地圖標註" });
    await exporter.getByLabel("匯出格式").selectOption("kmz");
    const download = page.waitForEvent("download");
    await exporter
      .getByRole("button", { name: "驗證並匯出", exact: true })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.kmz$/);
    const { readFile } = await import("node:fs/promises");
    expect(readKmz(new Uint8Array(await readFile(await file.path())))).toEqual(
      features,
    );
  } finally {
    await fetch(`${API_BASE}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
  }
});
test("unsafe KML and the replaced GeoJSON upload fail before saving any annotations", async ({
  page,
  request,
}) => {
  const project = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "KML 輸入驗證", lat: 24, lng: 121 },
    })
    .then((r) => r.json());
  try {
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto(`/#/projects/${project.id}`);
    await openAnnotations(page, 0);
    const input = page.getByLabel("匯入 KML 或 KMZ");
    await input.setInputFiles({
      name: "unsafe.kml",
      mimeType: "application/vnd.google-earth.kml+xml",
      buffer: Buffer.from(
        '<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml/>',
      ),
    });
    await expect(page.getByRole("alert")).toContainText(
      /DOCTYPE|DTD|實體|ENTITY/,
    );
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await input.setInputFiles({
      name: "legacy.geojson",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
    await expect(page.getByRole("alert")).toContainText("KML");
    expect(
      (
        await request
          .get(`${API_BASE}/api/projects/${project.id}/features`)
          .then((r) => r.json())
      ).items,
    ).toHaveLength(0);
  } finally {
    await fetch(`${API_BASE}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
  }
});
