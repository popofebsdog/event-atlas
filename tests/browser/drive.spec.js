import { API_BASE, UI_ORIGIN } from "./support/api";
import { test, expect } from "@playwright/test";
const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
test("Drive denied preview can be retried after sharing; account URLs normalize and public image links render", async ({
  page,
  request,
}) => {
  const projectResponse = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { name: "Drive 回歸測試", lat: 24, lng: 121 },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  try {
    const eventResponse = await request.post(
      `${API_BASE}/api/projects/${project.id}/events`,
      {
        headers,
        data: {
          title: "Drive 權限測試",
          description: "測試",
          occurred_at: "2026-11-19T12:00:00Z",
          url: "https://drive.google.com/file/u/0/d/test-drive-file/view?resourcekey=test-key",
        },
      },
    );
    expect(eventResponse.status()).toBe(201);
    const event = await eventResponse.json();
    let shared = false,
      requests = 0;
    await page.route("https://drive.google.com/**", (route) => {
      requests++;
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: shared ? "<h1>公開測試圖片</h1>" : "<h1>需要存取權</h1>",
      });
    });
    await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
    await page.route("**/services.arcgisonline.com/**", (route) =>
      route.abort(),
    );
    await page.goto("/");
    await page.getByRole("button", { name: /● Drive 回歸測試/ }).click();
    await page
      .getByRole("button", { name: /Drive 權限測試.*查看紀錄/ })
      .click();
    const frame = page.frameLocator("iframe");
    await expect(page.locator("iframe")).toHaveAttribute(
      "src",
      "https://drive.google.com/file/d/test-drive-file/preview?resourcekey=test-key",
    );
    await expect(
      frame.getByRole("heading", { name: "需要存取權" }),
    ).toBeVisible();
    await expect(page.getByText(/知道連結的任何人／檢視者/)).toBeVisible();
    shared = true;
    await page.getByRole("button", { name: "重新載入預覽" }).click();
    await expect(
      frame.getByRole("heading", { name: "公開測試圖片" }),
    ).toBeVisible();
    expect(requests).toBe(2);
    await page.getByRole("button", { name: "關閉事件網頁" }).click();
    const update = await request.put(`${API_BASE}/api/events/${event.id}`, {
      headers,
      data: { ...event, url: "https://example.com/photo.png?version=1" },
    });
    expect(update.status()).toBe(200);
    await page.route("https://example.com/photo.png?version=1", (route) =>
      route.fulfill({
        contentType: "image/png",
        path: "test-results/link-photo.png",
      }),
    );
    await page
      .evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 16;
        c.getContext("2d").fillRect(0, 0, 16, 16);
        return c.toDataURL();
      })
      .then(async (uri) => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(
          "test-results/link-photo.png",
          Buffer.from(uri.split(",")[1], "base64"),
        );
      });
    const refreshed = page.waitForResponse(
      (response) =>
        response.url().includes(`/projects/${project.id}/events`) &&
        response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "重新同步" }).click();
    await refreshed;
    await page
      .getByRole("button", { name: /Drive 權限測試.*查看紀錄/ })
      .click();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect
      .poll(() =>
        page.getByAltText("Drive 權限測試").evaluate((img) => img.naturalWidth),
      )
      .toBe(16);
  } finally {
    await request.delete(`${API_BASE}/api/projects/${project.id}`, { headers });
  }
});
