import { API_BASE, UI_ORIGIN } from "./support/api";
import { test, expect } from "@playwright/test";
const headers = {
  Origin: UI_ORIGIN,
  Authorization: "Bearer local-development-only-not-for-production",
};
test("PDF preview detects opaque links, opens the requested page and supports paging, zoom and mobile sizing", async ({
  page,
  request,
}) => {
  const project = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "PDF 閱讀測試", lat: 24, lng: 121 },
    })
    .then((r) => r.json());
  const event = await request
    .post(`${API_BASE}/api/projects/${project.id}/events`, {
      headers,
      data: {
        title: "PDF 專用預覽",
        description: "",
        url: "https://example.com/download?id=report#page=2",
        occurred_at: "2026-11-19T01:00:00Z",
      },
    })
    .then((r) => r.json());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.route(`**/api/events/${event.id}/media`, (r) =>
      r.fulfill({ json: { kind: "pdf", verified: true } }),
    );
    await page.route(`**/api/events/${event.id}/pdf`, (r) =>
      r.fulfill({
        contentType: "application/pdf",
        path: "tests/fixtures/basicapi.pdf",
      }),
    );
    await page.route("https://example.com/**", (r) =>
      r.fulfill({ contentType: "text/html", body: "PDF source" }),
    );
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto(`/#/projects/${project.id}`);
    await page.getByRole("button", { name: /PDF 專用預覽.*查看紀錄/ }).click();
    const canvas = page.getByRole("img", { name: "PDF 第 2 頁", exact: true });
    await expect(canvas).toBeVisible();
    await expect(page.getByLabel("PDF 頁碼")).toHaveValue("2");
    await expect(page.getByText("正在載入 PDF…", { exact: true })).toHaveCount(
      0,
    );
    expect(await canvas.evaluate((c) => c.width > 0 && c.height > 0)).toBe(
      true,
    );
    await page.getByRole("button", { name: "上一頁", exact: true }).click();
    await expect(
      page.getByRole("img", { name: "PDF 第 1 頁", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "下一頁", exact: true }).click();
    await expect(
      page.getByRole("img", { name: "PDF 第 2 頁", exact: true }),
    ).toBeVisible();
    await page.getByLabel("PDF 縮放").selectOption("1.5");
    await expect(page.locator(".pdf-preview")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(
      await page
        .locator(".pdf-stage")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
    await page.getByLabel("PDF 縮放").selectOption("1");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".pdf-preview")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/pdf-mobile.png" });
    expect(errors).toEqual([]);
  } finally {
    await fetch(`${API_BASE}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
  }
});
test("failed PDF reads show a retry and the original file instead of an endless empty iframe", async ({
  page,
  request,
}) => {
  const project = await request
    .post(`${API_BASE}/api/projects`, {
      headers,
      data: { name: "PDF 失敗測試", lat: 24, lng: 121 },
    })
    .then((r) => r.json());
  const url = "https://example.com/locked.pdf#page=1";
  const event = await request
    .post(`${API_BASE}/api/projects/${project.id}/events`, {
      headers,
      data: {
        title: "PDF 重試",
        description: "",
        url,
        occurred_at: "2026-11-19T01:00:00Z",
      },
    })
    .then((r) => r.json());
  let ready = false;
  try {
    await page.route(`**/api/events/${event.id}/pdf`, (r) =>
      ready
        ? r.fulfill({
            contentType: "application/pdf",
            path: "tests/fixtures/basicapi.pdf",
          })
        : r.fulfill({ status: 415, json: { error: "Not PDF" } }),
    );
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.route("**/services.arcgisonline.com/**", (r) => r.abort());
    await page.goto(`/#/projects/${project.id}`);
    await page.getByRole("button", { name: /PDF 重試.*查看紀錄/ }).click();
    await expect(
      page.getByRole("button", { name: "重新載入 PDF", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "開啟原始檔案", exact: true }),
    ).toHaveAttribute("href", url);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByText("正在載入 PDF…", { exact: true })).toHaveCount(
      0,
    );
    ready = true;
    await page
      .getByRole("button", { name: "重新載入 PDF", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: "PDF 第 1 頁", exact: true }),
    ).toBeVisible();
  } finally {
    await fetch(`${API_BASE}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
  }
});
