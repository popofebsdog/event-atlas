import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('map offers basic and satellite base layers, with satellite selected initially', async () => {
  const source = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
  assert.match(source, /const basicMap = L\.tileLayer\("https:\/\/tile\.openstreetmap\.org/);
  assert.match(source, /const satelliteMap = L\.tileLayer/);
  assert.match(source, /L\.control\.layers\(\{\s*"基本地圖": basicMap,\s*"衛星影像": satelliteMap/);
  assert.match(source, /collapsed: false/);
  assert.match(source, /satelliteMap\.addTo\(map\)/);
  assert.doesNotMatch(source, /basicMap\.addTo\(map\)/);
});
