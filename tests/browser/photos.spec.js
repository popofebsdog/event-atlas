import { API_BASE, UI_ORIGIN } from "./support/api";
import { test, expect } from "@playwright/test";
const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
test("upload photo without URL, view it, edit and remove it on desktop and mobile", async ({
  page,
  request,
}) => {
  const created = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { name: "照片介面測試", lat: 24, lng: 121 },
  });
  expect(created.status()).toBe(201);
  const project = await created.json();
  try {
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto("/");
    await page.getByRole("button", { name: /● 照片介面測試/ }).click();
    await page
      .getByRole("button", { name: "＋ 新增事件", exact: true })
      .click();
    await page.getByLabel("事件時間（臺灣 UTC+8）").fill("2026-09-13T14:07");
    await page.getByLabel("事件名稱", { exact: true }).fill("梅花颱風強降雨");
    await page
      .getByLabel("事件敘述", { exact: true })
      .fill("直接放照片，無網址");
    const image = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 40;
      c.height = 30;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "green";
      ctx.fillRect(0, 0, 40, 30);
      return c.toDataURL("image/png").split(",")[1];
    });
    await page
      .getByLabel("上傳照片（最多 5 張）")
      .setInputFiles({
        name: "slope.png",
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
    await expect(page.getByAltText("照片 1 預覽")).toBeVisible();
    await page
      .locator("dialog[open]")
      .getByLabel("管理員金鑰", { exact: true })
      .fill("local-development-only-not-for-production");
    await page.getByRole("button", { name: "儲存並公開", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "梅花颱風強降雨" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /查看紀錄・1 張照片/ }).click();
    const photo = page.getByAltText("梅花颱風強降雨・照片 1");
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img) => img.naturalWidth)).toBe(40);
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.screenshot({ path: "test-results/photos-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(photo).toBeVisible();
    await page.screenshot({ path: "test-results/photos-mobile.png" });
    await page.getByRole("button", { name: "關閉事件網頁" }).click();
    await page.getByRole("button", { name: "時間軸", exact: true }).click();
    await page
      .getByRole("button", { name: "編輯事件：梅花颱風強降雨" })
      .click();
    await expect(page.getByAltText("照片 1 預覽")).toBeVisible();
    await page.getByRole("button", { name: "移除照片 1" }).click();
    await page.getByRole("button", { name: "儲存修改", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /查看紀錄・1 張照片/ }),
    ).toHaveCount(0);
  } finally {
    await request.delete(`${API_BASE}/api/projects/${project.id}`, { headers });
  }
});
