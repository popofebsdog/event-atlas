import test from "node:test";
import assert from "node:assert/strict";
import { validateProject, validateEvent } from "../worker/validation.js";
import worker from "../worker/index.js";
const event = {
  title: "崩塌",
  description: "調查紀錄",
  occurred_at: "2025-10-17T00:00:00.000Z",
  url: "https://example.com/story",
};
test("accepts valid coordinates including zero, rejects coercion and out-of-range values", () => {
  assert.equal(
    validateProject({ name: " 地點 ", lat: 0, lng: 0 }).name,
    "地點",
  );
  for (const lat of ["", null, "24", 91, NaN])
    assert.throws(() => validateProject({ name: "地點", lat, lng: 121 }));
});
test("rejects active URL schemes, credentials, malformed dates and oversized text", () => {
  assert.equal(validateEvent(event).url, event.url);
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://example.com",
    "https://user:pass@example.com",
  ])
    assert.throws(() => validateEvent({ ...event, url }));
  for (const occurred_at of ["tomorrow", "2025-02-30T00:00:00Z", "2025-10-17"])
    assert.throws(() => validateEvent({ ...event, occurred_at }));
  assert.throws(() => validateEvent({ ...event, title: "a".repeat(161) }));
});
test("untrusted origins and unauthenticated deletion fail before database access", async () => {
  const env = { ALLOWED_ORIGINS: "https://example.com" };
  assert.equal(
    (
      await worker.fetch(
        new Request("https://api.example.com/api/projects", {
          headers: { Origin: "https://evil.test" },
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://api.example.com/api/projects/a", {
          method: "DELETE",
        }),
        env,
      )
    ).status,
    403,
  );
});
test("public writes fail closed without Turnstile secret, even if LOCAL_DEV accidentally set", async () => {
  const response = await worker.fetch(
    new Request("https://api.example.com/api/projects", {
      method: "POST",
      headers: {
        Origin: "https://example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "a", lat: 24, lng: 121 }),
    }),
    { ALLOWED_ORIGINS: "https://example.com", LOCAL_DEV: "true" },
  );
  assert.equal(response.status, 403);
});
test("rejects oversized request before parsing or DB writes", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "Content-Type": "application/json",
      },
      body: "a".repeat(24001),
    }),
    { ALLOWED_ORIGINS: "http://localhost:5174", LOCAL_DEV: "true" },
  );
  assert.equal(response.status, 400);
});
