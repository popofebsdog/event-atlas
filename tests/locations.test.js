import test from "node:test";
import assert from "node:assert/strict";
import { validateProject, validateEvent } from "../server/validation.js";
import { linkedMedia } from "../src/lib/media.js";
import { filterEvents } from "../src/lib/timeline.js";
const event = {
  title: "觀測",
  description: "",
  occurred_at: "2026-11-19T12:00:00Z",
};
test("legacy station projects remain compatible while region projects default to area", () => {
  assert.equal(
    validateProject({
      name: "站點",
      lat: 24,
      lng: 121,
      kind: "rainfall_station",
    }).kind,
    "rainfall_station",
  );
  assert.equal(
    validateProject({ name: "地區", lat: 24, lng: 121 }).kind,
    "area",
  );
  assert.throws(() =>
    validateProject({ name: "站點", lat: 24, lng: 121, kind: "unknown" }),
  );
});
test("events accept explicit or inherited coordinates and reject partial/invalid pairs", () => {
  assert.equal(validateEvent(event).lat, null);
  assert.equal(validateEvent({ ...event, lat: null, lng: null }).lng, null);
  assert.equal(validateEvent({ ...event, lat: 0, lng: 0 }).lat, 0);
  for (const coords of [
    { lat: 24 },
    { lng: 121 },
    { lat: null },
    { lat: 24, lng: null },
    { lat: "24", lng: 121 },
    { lat: 91, lng: 121 },
    { lat: 24, lng: 181 },
  ])
    assert.throws(() => validateEvent({ ...event, ...coords }));
});
test("known NCDR framing restriction gets external fallback without weakening URL validation", () => {
  assert.equal(
    linkedMedia("https://den.ncdr.nat.gov.tw/article/123").kind,
    "external",
  );
  assert.equal(
    linkedMedia("https://den.ncdr.nat.gov.tw.evil.test/").kind,
    "web",
  );
  assert.equal(linkedMedia("http://den.ncdr.nat.gov.tw/").kind, "none");
});
test("timeline metadata validates bounded source and known event types", () => {
  assert.equal(
    validateEvent({ ...event, category: "rainfall", source: " 現地調查 " })
      .source,
    "現地調查",
  );
  assert.equal(validateEvent(event).category, "other");
  assert.throws(() => validateEvent({ ...event, category: "unknown" }));
  assert.throws(() => validateEvent({ ...event, source: "a".repeat(201) }));
});
test("date filters use inclusive Taiwan days and combine with event type", () => {
  const rows = [
    { id: 1, occurred_at: "2026-11-18T15:59:00Z", category: "rainfall" },
    { id: 2, occurred_at: "2026-11-18T16:00:00Z", category: "rainfall" },
    { id: 3, occurred_at: "2026-11-19T15:59:00Z", category: "survey" },
    { id: 4, occurred_at: "2026-11-19T16:00:00Z", category: "rainfall" },
  ];
  assert.deepEqual(
    filterEvents(rows, { from: "2026-11-19", to: "2026-11-19" }).map(
      (e) => e.id,
    ),
    [2, 3],
  );
  assert.deepEqual(
    filterEvents(rows, {
      category: "rainfall",
      from: "2026-11-19",
      to: "2026-11-19",
    }).map((e) => e.id),
    [2],
  );
  assert.equal(
    filterEvents(rows, { from: "2026-11-20", to: "2026-11-19" }).length,
    0,
  );
  assert.equal(filterEvents(rows).length, 4);
});
