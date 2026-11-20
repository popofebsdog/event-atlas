import test from "node:test";
import assert from "node:assert/strict";
import * as timeline from "../src/lib/timeline.js";

test("chronological browsing sorts by event time without changing the original collection", () => {
  assert.equal(typeof timeline.chronologicalEvents, "function");
  const events = [
    { id: "last", occurred_at: "2026-11-19T05:30:00Z" },
    { id: "first", occurred_at: "2026-11-19T01:00:00Z" },
    { id: "middle", occurred_at: "2026-11-19T02:30:00Z" },
  ];
  assert.deepEqual(
    timeline.chronologicalEvents(events).map((e) => e.id),
    ["first", "middle", "last"],
  );
  assert.deepEqual(
    events.map((e) => e.id),
    ["last", "first", "middle"],
  );
});
test("events at the same time retain a stable creation-time and ID order across refreshes", () => {
  assert.equal(typeof timeline.chronologicalEvents, "function");
  const occurred_at = "2026-11-19T01:00:00Z";
  const rows = [
    { id: "b", occurred_at, created_at: "2026-11-19T03:00:00Z" },
    { id: "a", occurred_at, created_at: "2026-11-19T03:00:00Z" },
    { id: "c", occurred_at, created_at: "2026-11-19T02:00:00Z" },
  ];
  assert.deepEqual(
    timeline.chronologicalEvents(rows).map((e) => e.id),
    ["c", "a", "b"],
  );
  assert.deepEqual(
    timeline.chronologicalEvents([...rows].reverse()).map((e) => e.id),
    ["c", "a", "b"],
  );
});
test("guide and event details display the same Taiwan event time", () => {
  assert.equal(typeof timeline.formatEventTime, "function");
  assert.match(
    timeline.formatEventTime("2026-11-18T16:05:00Z"),
    /2026\/11\/19.*00:05/,
  );
});
