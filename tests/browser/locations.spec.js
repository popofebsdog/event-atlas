import { API_BASE, UI_ORIGIN } from "./support/api";
import { test, expect } from "@playwright/test";
const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
test("regions stay projects; station observations are coordinate-bearing events with synchronized filters", async ({
  page,
  request,
}) => {
  const p = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { name: "事件測試地區", lat: 24, lng: 121 },
  });
  const project = await p.json();
  try {
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "地區專案", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "＋ 新增雨量站", exact: true }),
    ).toHaveCount(0);
    await page.locator(`[data-project-id="${project.id}"]`).click();
    await page
      .getByRole("button", { name: "＋ 新增事件", exact: true })
      .click();
    await expect(page.getByLabel("所屬地區專案")).toBeVisible();
    await expect(page.getByLabel("緯度 Latitude")).toHaveValue("24");
    await page
      .locator("dialog[open]")
      .getByLabel("管理員金鑰", { exact: true })
      .fill("local-development-only-not-for-production");
    await page.getByLabel("緯度 Latitude").fill("24.91");
    await page.getByLabel("經度 Longitude").fill("121.44");
    await page.getByLabel("事件時間（臺灣 UTC+8）").fill("2026-11-19T20:00");
    await page
      .getByLabel("事件名稱", { exact: true })
      .fill("有座標的雨量站事件");
    await page
      .locator("dialog[open]")
      .getByLabel("事件類型")
      .selectOption("rainfall");
    await page.getByLabel("資料來源（選填）").fill("自建站現地調查");
    await page
      .getByLabel("介紹網頁／圖片／雲端檔案網址（選填）")
      .fill("https://den.ncdr.nat.gov.tw/");
    await page.getByRole("button", { name: "儲存並公開", exact: true }).click();
    const card = page.getByRole("button", {
      name: /有座標的雨量站事件.*查看紀錄/,
    });
    await expect(card).toContainText("24.91000, 121.44000");
    await expect(
      page.locator('.leaflet-marker-icon[title="事件：有座標的雨量站事件"]'),
    ).toBeVisible();
    await card.click();
    await page.locator(".reader-event-info summary").click();
    await expect(
      page.getByText("資料來源：自建站現地調查", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("最後修改", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "開啟原網站", exact: true }),
    ).toHaveAttribute("href", "https://den.ncdr.nat.gov.tw/");
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByText("正在載入事件網頁…")).toHaveCount(0);
    await page.getByRole("button", { name: "關閉事件網頁" }).click();
    await page.getByText("篩選紀錄", { exact: true }).click();
    await page
      .locator(".timeline-filters")
      .getByLabel("事件類型")
      .selectOption("survey");
    await expect(card).toHaveCount(0);
    await expect(
      page.locator('.leaflet-marker-icon[title="事件：有座標的雨量站事件"]'),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "清除篩選" }).click();
    await expect(card).toBeVisible();
    await page
      .getByRole("button", { name: "地圖選點新增事件", exact: true })
      .click();
    await page.locator("#map").click({ position: { x: 110, y: 180 } });
    await expect(
      page.getByRole("heading", { name: "新增時間軸事件" }),
    ).toBeVisible();
    const pickedLat = await page.getByLabel("緯度 Latitude").inputValue();
    const pickedLng = await page.getByLabel("經度 Longitude").inputValue();
    await expect(page.getByLabel("所屬地區專案")).toBeDisabled();
    await expect(page.getByLabel("所屬地區專案")).toHaveValue(project.id);
    await expect(page.getByLabel("緯度 Latitude")).toHaveValue(pickedLat);
    await expect(page.getByLabel("經度 Longitude")).toHaveValue(pickedLng);
    await page.getByLabel("事件時間（臺灣 UTC+8）").fill("2026-11-19T21:00");
    await page.getByLabel("事件名稱", { exact: true }).fill("地圖選點事件");
    await page.getByRole("button", { name: "儲存並公開", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "地圖選點事件", exact: true }),
    ).toBeVisible();
    const data = await request
      .get(`${API_BASE}/api/projects/${project.id}/events`)
      .then((r) => r.json());
    expect(data.items[0].lat).toBe(Number(pickedLat));
    expect(data.items[0].lng).toBe(Number(pickedLng));
    await page.screenshot({ path: "test-results/workbench-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "＋ 新增事件", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "＋ 新增事件", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "時間軸", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/workbench-mobile.png" });
    await page.setViewportSize({ width: 320, height: 768 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await request.delete(`${API_BASE}/api/projects/${project.id}`, { headers });
  }
});
