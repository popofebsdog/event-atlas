import { expect } from "@playwright/test";
export async function openAnnotations(page) {
  const drawer = page.getByRole("complementary", {
    name: "地圖標註管理",
    exact: true,
  });
  if (await drawer.isVisible()) return;
  const mapTab = page.getByRole("button", { name: "地圖", exact: true });
  if (await mapTab.isVisible()) await mapTab.click();
  await page.getByRole("button", { name: "建立標註", exact: true }).click();
  await expect(drawer).toBeVisible();
}
