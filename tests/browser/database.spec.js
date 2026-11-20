import { test } from "@playwright/test";
import { execFileSync } from "node:child_process";
test("D1 photo and existing CRUD integration regression checks", () => {
  execFileSync(process.execPath, ["tests/integration.mjs"], { stdio: "pipe" });
});
