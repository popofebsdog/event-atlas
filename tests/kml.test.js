import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { zipSync, strToU8, unzipSync } from "fflate";

import * as kml from "../shared/kml.js";
const fixture = await readFile(
  new URL("./fixtures/kml-annotations.kml", import.meta.url),
  "utf8",
);
const wrap = (body) =>
  `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`;
const mark = (geometry, name = "測點") =>
  `<Placemark><name>${name}</name>${geometry}</Placemark>`;
const point = "<Point><coordinates>121,24</coordinates></Point>";
const bytes = (files) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
    ),
  );

test("KML imports folders, Unicode names, literal descriptions and polygon inner rings", () => {
  assert.equal(typeof kml.readKml, "function");
  const rows = kml.readKml(fixture);
  assert.deepEqual(
    rows.map((row) => row.geometry.type),
    ["Point", "LineString", "Polygon"],
  );
  assert.equal(rows[0].name, "觀測 & 測點");
  assert.equal(rows[0].description, "第一行\n<b>原始敘述</b> & 安全保留");
  assert.deepEqual(rows[0].geometry.coordinates, [121.005, 24.204]);
  assert.deepEqual(rows[1].geometry.coordinates, [
    [121, 24],
    [121.01, 24.01],
  ]);
  assert.equal(rows[2].geometry.coordinates.length, 2);
  assert.deepEqual(rows[2].geometry.coordinates[1][0], [121.005, 24.005]);
});

test("prefixed KML and nested MultiGeometry split into named independent cards in source order", () => {
  assert.equal(typeof kml.readKml, "function");
  const text = wrap(
    mark(
      `<MultiGeometry>${point}<MultiGeometry><LineString><coordinates>121,24 122,25</coordinates></LineString>${point}</MultiGeometry></MultiGeometry>`,
      "共用名稱",
    ),
  );
  const rows = kml.readKml(
    text
      .replaceAll(/<(\/?)([A-Za-z][A-Za-z0-9]*)/g, "<$1k:$2")
      .replace("xmlns=", "xmlns:k="),
  );
  assert.deepEqual(
    rows.map((row) => row.name),
    ["共用名稱 · 1/3", "共用名稱 · 2/3", "共用名稱 · 3/3"],
  );
  assert.deepEqual(
    rows.map((row) => row.geometry.type),
    ["Point", "LineString", "Point"],
  );
});

test("KML exports escaped text, ground geometry and closed rings without changing its input", () => {
  assert.equal(typeof kml.writeKml, "function");
  const rows = kml.readKml(fixture),
    original = structuredClone(rows);
  rows[0].description = '</description><NetworkLink> & "字"';
  original[0].description = rows[0].description;
  const text = kml.writeKml(rows);
  assert.match(text, /xmlns="http:\/\/www.opengis.net\/kml\/2.2"/);
  assert.match(text, /<innerBoundaryIs>/);
  assert.deepEqual(kml.readKml(text), original);
  assert.deepEqual(rows, original);
});

test("KML export preserves every valid project annotation even above the import batch limit", () => {
  assert.equal(typeof kml.writeKml, "function");
  const rows = Array.from({ length: 101 }, (_, i) => ({
    name: `測點${i}`,
    description: "",
    geometry: { type: "Point", coordinates: [121, 24] },
  }));
  const text = kml.writeKml(rows);
  assert.equal((text.match(/<Placemark>/g) || []).length, 101);
  assert.throws(() => kml.readKml(text), /100/);
});

test("KML exports polygon front faces and holes using the KML winding convention", () => {
  const row = kml.readKml(fixture)[2];
  row.geometry.coordinates = row.geometry.coordinates.map((ring) =>
    [...ring].reverse(),
  );
  const original = structuredClone(row),
    [roundtrip] = kml.readKml(kml.writeKml([row]));
  const signedArea = (ring) =>
    ring
      .slice(1)
      .reduce(
        (sum, [x, y], index) => sum + ring[index][0] * y - x * ring[index][1],
        0,
      );
  assert.ok(
    signedArea(roundtrip.geometry.coordinates[0]) > 0,
    "outer ring faces up in Google Earth",
  );
  assert.ok(
    signedArea(roundtrip.geometry.coordinates[1]) < 0,
    "inner ring has the opposite winding",
  );
  assert.deepEqual(row, original);
});

test("KML rejects invalid XML characters during export rather than creating an unreadable backup", () => {
  const row = kml.readKml(fixture)[0];
  row.description = "invalid\u0000text";
  assert.throws(() => kml.writeKml([row]), /XML|字元/);
});

test("KML rejects DTD, custom entities, malformed XML and misleading namespaces", () => {
  assert.equal(typeof kml.readKml, "function");
  for (const text of [
    '<!DOCTYPE kml [<!ENTITY xxe SYSTEM "https://example.com/private">]>' +
      wrap(mark(point, "&xxe;")),
    '<!DOCTYPE kml SYSTEM "https://example.com/schema.dtd">' +
      wrap(mark(point)),
    wrap(mark(point, "&unknown;")),
    "<kml><Placemark><Point></Placemark></kml>",
    wrap(mark(point)).slice(0, -6),
    wrap(mark(point)).replace(
      "http://www.opengis.net/kml/2.2",
      "https://attacker.invalid/kml",
    ),
    wrap(mark(point))
      .replace("<Point>", '<x:Point xmlns:x="https://attacker.invalid/">')
      .replace("</Point>", "</x:Point>"),
  ])
    assert.throws(
      () => kml.readKml(text),
      /KML|XML|DTD|實體|命名空間/,
      text.slice(0, 100),
    );
});

test("unsupported geographic content fails the whole import instead of silently disappearing", () => {
  assert.equal(typeof kml.readKml, "function");
  for (const extra of [
    "<NetworkLink><Link><href>https://example.com/map.kml</href></Link></NetworkLink>",
    "<GroundOverlay><Icon><href>image.png</href></Icon></GroundOverlay>",
    "<ScreenOverlay/>",
    "<PhotoOverlay/>",
    "<Placemark><Model/></Placemark>",
    '<Placemark><gx:Track xmlns:gx="http://www.google.com/kml/ext/2.2"/></Placemark>',
    "<Placemark><MultiGeometry><Point><coordinates>121,24</coordinates></Point><Model/></MultiGeometry></Placemark>",
  ])
    assert.throws(
      () => kml.readKml(wrap(mark(point) + extra)),
      /不支援|不支持/,
      extra,
    );
  assert.throws(
    () => kml.readKml(wrap("<Placemark><name>只有名稱</name></Placemark>")),
    /幾何|座標/,
  );
});

test("KML validates coordinate tuples, ring closure, duplicate geometry and shared API limits", () => {
  assert.equal(typeof kml.readKml, "function");
  for (const geometry of [
    "<Point><coordinates>181,24</coordinates></Point>",
    "<Point><coordinates>121,NaN</coordinates></Point>",
    "<Point><coordinates>121,24,0,4</coordinates></Point>",
    "<Point><coordinates>0x79,24</coordinates></Point>",
    "<Point><coordinates>121,24 122,25</coordinates></Point>",
    "<LineString><coordinates>121,24</coordinates></LineString>",
    "<Polygon><outerBoundaryIs><LinearRing><coordinates>121,24 122,24 122,25 121,25</coordinates></LinearRing></outerBoundaryIs></Polygon>",
    point + point,
  ])
    assert.throws(
      () => kml.readKml(wrap(mark(geometry))),
      /座標|幾何|位置|相同|Point|KML|外框|封閉/,
    );
  assert.throws(() => kml.readKml(wrap(mark(point, "x".repeat(161)))), /名稱/);
  assert.throws(() => kml.readKml(wrap(mark(point).repeat(101))), /100/);
  const coordinates = Array.from(
    { length: 2001 },
    (_, i) => `${121 + i / 100000},24`,
  ).join(" ");
  assert.throws(
    () =>
      kml.readKml(
        wrap(
          mark(
            `<LineString><coordinates>${coordinates}</coordinates></LineString>`,
          ),
        ),
      ),
    /2000/,
  );
  assert.throws(
    () =>
      kml.readKml(
        wrap(
          mark(
            `<LineString><coordinates>${coordinates.split(" ").slice(0, 2000).join(" ")}</coordinates></LineString>`,
          ).repeat(6),
        ),
      ),
    /10000/,
  );
});

test("KML rejects oversized text, deep nesting and payloads too large for the annotation API", () => {
  assert.equal(typeof kml.readKml, "function");
  assert.throws(() => kml.readKml(" ".repeat(2 * 1024 * 1024 + 1)), /大小|MB/);
  assert.throws(
    () =>
      kml.readKml(
        wrap("<Folder>".repeat(100) + mark(point) + "</Folder>".repeat(100)),
      ),
    /層|深/,
  );
  const large = wrap(
    Array.from({ length: 60 }, (_, i) =>
      mark(point, `測點${i}`).replace(
        "</name>",
        "</name><description>" + "字".repeat(4999) + "</description>",
      ),
    ).join(""),
  );
  assert.throws(() => kml.readKml(large), /容量|分批|KB/);
});

test("KMZ packages a single doc.kml and round trips through bytes and ArrayBuffer", () => {
  assert.equal(typeof kml.writeKmz, "function");
  assert.equal(typeof kml.readKmz, "function");
  const rows = kml.readKml(fixture),
    archive = kml.writeKmz(rows);
  assert.ok(archive instanceof Uint8Array);
  assert.deepEqual(Object.keys(unzipSync(archive)), ["doc.kml"]);
  assert.deepEqual(kml.readKmz(archive), rows);
  assert.deepEqual(
    kml.readKmz(
      archive.buffer.slice(
        archive.byteOffset,
        archive.byteOffset + archive.byteLength,
      ),
    ),
    rows,
  );
  assert.deepEqual(
    kml.readKmz(
      bytes({
        "nested/map.KML": fixture,
        "files/icon.png": "unread image bytes",
      }),
    ),
    rows,
  );
});

test("KMZ rejects missing or multiple main KML files, duplicate/unsafe paths and broken archives", () => {
  assert.equal(typeof kml.readKmz, "function");
  for (const archive of [
    bytes({ "image.png": "no map" }),
    bytes({ "doc.kml": fixture, "another.kml": fixture }),
    bytes({ "../doc.kml": fixture }),
    bytes({ "/doc.kml": fixture }),
    bytes({ "C:/doc.kml": fixture }),
    bytes({ "doc.kml": fixture, "DOC.KML": fixture }),
    new Uint8Array([1, 2, 3]),
    bytes({ "doc.kml": fixture }).slice(0, -5),
  ])
    assert.throws(() => kml.readKmz(archive), /KMZ|KML|ZIP|路徑|主檔|重複/);
});

test("KMZ enforces compressed size, entry count and expanded byte budgets", () => {
  assert.equal(typeof kml.readKmz, "function");
  assert.throws(
    () => kml.readKmz(new Uint8Array(5 * 1024 * 1024 + 1)),
    /5 MB|大小/,
  );
  const files = Object.fromEntries(
    Array.from({ length: 33 }, (_, i) => [`file${i}.txt`, "x"]),
  );
  files["doc.kml"] = fixture;
  assert.throws(() => kml.readKmz(bytes(files)), /32|條目/);
  assert.throws(
    () =>
      kml.readKmz(
        bytes({
          "doc.kml": wrap(mark(point)),
          "large.txt": "x".repeat(8 * 1024 * 1024),
        }),
      ),
    /解壓|大小/,
  );
});

test("KMZ verifies real inflated sizes and CRC instead of trusting ZIP metadata", () => {
  assert.equal(typeof kml.readKmz, "function");
  const archive = bytes({ "doc.kml": fixture }),
    directory = archive.findIndex(
      (_, i) =>
        archive[i] === 0x50 &&
        archive[i + 1] === 0x4b &&
        archive[i + 2] === 1 &&
        archive[i + 3] === 2,
    );
  const corrupted = archive.slice();
  corrupted[directory + 16] ^= 255;
  assert.throws(() => kml.readKmz(corrupted), /CRC|損毀|校驗/);
  const forged = archive.slice(),
    view = new DataView(forged.buffer);
  view.setUint32(directory + 24, 1, true);
  view.setUint32(22, 1, true);
  assert.throws(() => kml.readKmz(forged), /大小|解壓|損毀/);
});

test("KMZ stops a compressed bomb even when both directory and local size fields understate its output", () => {
  const archive = bytes({ "doc.kml": "x".repeat(3 * 1024 * 1024) }),
    view = new DataView(archive.buffer);
  const directory = archive.findIndex(
    (_, i) =>
      archive[i] === 0x50 &&
      archive[i + 1] === 0x4b &&
      archive[i + 2] === 1 &&
      archive[i + 3] === 2,
  );
  view.setUint32(directory + 24, 1, true);
  view.setUint32(22, 1, true);
  assert.throws(() => kml.readKmz(archive), /大小|解壓|損毀/);
});

test("KMZ handles streaming ZIP data descriptors without relying on local header sizes", async () => {
  const { Zip, ZipDeflate } = await import("fflate"),
    chunks = [];
  const archive = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  const file = new ZipDeflate("doc.kml");
  archive.add(file);
  file.push(strToU8(fixture), true);
  archive.end();
  const bytes = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  assert.deepEqual(kml.readKmz(bytes), kml.readKml(fixture));
});
