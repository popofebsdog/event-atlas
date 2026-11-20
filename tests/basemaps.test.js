import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("map offers basic and satellite base layers, with satellite selected initially", async () => {
  const source = await readFile(
    new URL("../src/lib/mapControls.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /const basic\s*=\s*L\.tileLayer\(['"]https:\/\/tile\.openstreetmap\.org/,
  );
  assert.match(source, /const satellite\s*=\s*L\.tileLayer/);
  assert.match(source, /satellite\.addTo\(map\)/);
  assert.doesNotMatch(source, /basic\.addTo\(map\)/);
});
