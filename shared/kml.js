import { DOMParser, DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import { Inflate, zipSync, strToU8 } from "fflate";
import {
  readAnnotations,
  featureCollection,
  GEOMETRY_LABELS,
} from "./annotations.js";

export const LIMITS = Object.freeze({
  kmlBytes: 2 * 1024 * 1024,
  kmzBytes: 5 * 1024 * 1024,
  entries: 32,
  expandedBytes: 8 * 1024 * 1024,
  apiBytes: 480 * 1024,
});
const NS = "http://www.opengis.net/kml/2.2";
const namespaces = new Set([
  NS,
  "http://earth.google.com/kml/2.1",
  "http://earth.google.com/kml/2.0",
  "",
]);
const geometryNames = new Set([
  "Point",
  "LineString",
  "Polygon",
  "MultiGeometry",
  "LinearRing",
  "Model",
  "Track",
  "MultiTrack",
]);
const unsupported = new Set([
  "NetworkLink",
  "NetworkLinkControl",
  "GroundOverlay",
  "ScreenOverlay",
  "PhotoOverlay",
  "Model",
  "Track",
  "MultiTrack",
  "Tour",
  "Update",
]);
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
const invalidXmlCharacters =
  /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u;
const elements = (node) =>
  Array.from(node.childNodes || []).filter((child) => child.nodeType === 1);
const children = (node, name) =>
  elements(node).filter(
    (child) =>
      child.localName === name && child.namespaceURI === node.namespaceURI,
  );
function one(node, name) {
  const found = children(node, name);
  if (found.length !== 1)
    throw new Error(`KML ${node.localName} 需要唯一的 ${name} 幾何／座標元素`);
  return found[0];
}
function text(node, name) {
  const found = children(node, name);
  if (found.length > 1) throw new Error(`KML ${name} 不可重複`);
  return found[0]?.textContent || "";
}

function coordinates(node) {
  const value = one(node, "coordinates");
  if (elements(value).length) throw new Error("KML 座標不可包含其他 XML 元素");
  const tuples = value.textContent.trim().split(/\s+/),
    decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  return tuples.map((tuple) => {
    const parts = tuple.split(",");
    if (
      ![2, 3].includes(parts.length) ||
      !parts.every(
        (part) => decimal.test(part) && Number.isFinite(Number(part)),
      )
    )
      throw new Error("KML 座標需為經度,緯度[,高程]");
    return parts.map(Number).slice(0, 2);
  });
}

function geometries(node) {
  const type = node.localName;
  if (type === "MultiGeometry") {
    const parts = elements(node);
    if (
      !parts.length ||
      parts.some(
        (part) =>
          !geometryNames.has(part.localName) ||
          part.namespaceURI !== node.namespaceURI,
      )
    )
      throw new Error("KML MultiGeometry 包含不支援或空白的幾何");
    return parts.flatMap(geometries);
  }
  if (type === "Point") {
    const points = coordinates(node);
    if (points.length !== 1) throw new Error("KML Point 只能有一組座標");
    return [{ type, coordinates: points[0] }];
  }
  if (type === "LineString") return [{ type, coordinates: coordinates(node) }];
  if (type === "Polygon") {
    const outer = one(node, "outerBoundaryIs"),
      rings = [outer, ...children(node, "innerBoundaryIs")];
    return [
      {
        type,
        coordinates: rings.map((boundary) =>
          coordinates(one(boundary, "LinearRing")),
        ),
      },
    ];
  }
  throw new Error(`不支援 KML ${type} 幾何，請轉換成點、線或面`);
}

// KML stores WGS84 longitude,latitude. Only the application's ground geometry is retained.
export function readKml(source) {
  if (typeof source !== "string") throw new Error("KML 需提供 XML 文字");
  if (encoder.encode(source).length > LIMITS.kmlBytes)
    throw new Error("KML 大小需小於 2 MB");
  if (invalidXmlCharacters.test(source))
    throw new Error("KML 含有 XML 不接受的字元");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source))
    throw new Error("KML 不接受 DTD 或自訂實體");
  let doc;
  try {
    doc = new DOMParser({
      onError: () => {
        throw new Error("XML 格式錯誤");
      },
    }).parseFromString(source, "application/xml");
  } catch {
    throw new Error("KML XML 格式錯誤，請確認標籤、命名空間與實體");
  }
  const root = doc.documentElement,
    namespace = root?.namespaceURI || "";
  if (root?.localName !== "kml" || !namespaces.has(namespace))
    throw new Error("KML 根元素或命名空間不正確");
  const placemarks = [],
    stack = [[root, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (depth > 64) throw new Error("KML 巢狀層級過深，最多 64 層");
    if (unsupported.has(node.localName))
      throw new Error(
        `不支援 KML ${node.localName}，請先轉換為獨立點、線、面標註`,
      );
    if (
      (geometryNames.has(node.localName) || node.localName === "Placemark") &&
      (node.namespaceURI || "") !== namespace
    )
      throw new Error("KML 幾何命名空間不正確");
    if (node.localName === "Placemark") placemarks.push(node);
    for (const child of elements(node).reverse())
      stack.push([child, depth + 1]);
  }
  const features = [];
  for (const placemark of placemarks) {
    const shapes = elements(placemark).filter((child) =>
      geometryNames.has(child.localName),
    );
    if (shapes.length !== 1)
      throw new Error(
        "KML Placemark 需要唯一幾何；多種幾何請放入 MultiGeometry",
      );
    const parts = geometries(shapes[0]),
      description = text(placemark, "description");
    const name =
      text(placemark, "name").trim() || `${GEOMETRY_LABELS[parts[0].type]}標註`;
    parts.forEach((geometry, index) =>
      features.push({
        type: "Feature",
        properties: {
          name:
            parts.length > 1 ? `${name} · ${index + 1}/${parts.length}` : name,
          description,
        },
        geometry,
      }),
    );
    if (features.length > 100)
      throw new Error("每次可匯入 1 至 100 筆標註，MultiGeometry 拆分後亦計入");
  }
  const rows = readAnnotations({ type: "FeatureCollection", features });
  // Leave room for Turnstile and the request envelope within the worker's 512000-byte limit.
  if (
    encoder.encode(JSON.stringify({ geojson: featureCollection(rows) }))
      .length > LIMITS.apiBytes
  )
    throw new Error("標註資料容量超過 480 KB，請分批匯入");
  return rows;
}

export function writeKml(features) {
  if (!Array.isArray(features)) throw new Error("KML 匯出需提供標註陣列");
  const doc = new DOMImplementation().createDocument(NS, "kml", null),
    root = doc.documentElement;
  const add = (parent, name, value) => {
    if (value !== undefined && invalidXmlCharacters.test(value))
      throw new Error("標註含有 XML 不接受的字元，無法匯出 KML");
    const element = doc.createElementNS(NS, name);
    parent.appendChild(element);
    if (value !== undefined) element.appendChild(doc.createTextNode(value));
    return element;
  };
  const document = add(root, "Document");
  for (const feature of features) {
    const [row] = readAnnotations(featureCollection([feature]));
    const placemark = add(document, "Placemark");
    add(placemark, "name", row.name);
    add(placemark, "description", row.description);
    const shape = add(placemark, row.geometry.type);
    add(shape, "altitudeMode", "clampToGround");
    const coordinateText = (points) =>
      points.map((point) => point.join(",")).join(" ");
    if (row.geometry.type === "Point")
      add(shape, "coordinates", row.geometry.coordinates.join(","));
    else if (row.geometry.type === "LineString")
      add(shape, "coordinates", coordinateText(row.geometry.coordinates));
    else
      row.geometry.coordinates.forEach((ring, index) => {
        const boundary = add(
          shape,
          index ? "innerBoundaryIs" : "outerBoundaryIs",
        );
        const [x, y] = ring[0],
          area = ring
            .slice(1)
            .reduce(
              (sum, point, i) =>
                sum +
                (ring[i][0] - x) * (point[1] - y) -
                (point[0] - x) * (ring[i][1] - y),
              0,
            );
        // KML outer rings face up counterclockwise; holes use the opposite winding.
        const oriented =
          area > 0 === (index === 0) ? ring : [...ring].reverse();
        add(
          add(boundary, "LinearRing"),
          "coordinates",
          coordinateText(oriented),
        );
      });
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    new XMLSerializer().serializeToString(doc)
  );
}

function archiveEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    u16 = (offset) => view.getUint16(offset, true),
    u32 = (offset) => view.getUint32(offset, true);
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)
  )
    end--;
  if (end < 0 || end < bytes.length - 65557)
    throw new Error("KMZ ZIP 目錄遺失或檔案損毀");
  const count = u16(end + 10),
    start = u32(end + 16);
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    u16(end + 8) !== count ||
    count === 65535 ||
    start === 0xffffffff ||
    start + u32(end + 12) !== end
  )
    throw new Error("KMZ 不支援 ZIP64、多磁碟或損毀的 ZIP");
  if (!count || count > LIMITS.entries)
    throw new Error("KMZ 需包含 1 至 32 個 ZIP 條目");
  let offset = start,
    total = 0;
  const result = [],
    names = new Set();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50)
      throw new Error("KMZ ZIP 目錄損毀");
    const flags = u16(offset + 8),
      method = u16(offset + 10),
      crc = u32(offset + 16),
      compressed = u32(offset + 20),
      size = u32(offset + 24),
      nameLength = u16(offset + 28),
      local = u32(offset + 42);
    const next = offset + 46 + nameLength + u16(offset + 30) + u16(offset + 32);
    if (
      next > end ||
      u16(offset + 34) ||
      local + 30 > start ||
      u32(local) !== 0x04034b50
    )
      throw new Error("KMZ ZIP 條目損毀");
    if (flags & 1 || ![0, 8].includes(method))
      throw new Error("KMZ 不支援加密或此 ZIP 壓縮格式");
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (
      !name ||
      /[\\\u0000-\u001f]/.test(name) ||
      /^(?:\/|[A-Za-z]:)/.test(name) ||
      name.split("/").some((part) => part === ".." || part === ".")
    )
      throw new Error("KMZ ZIP 路徑不安全");
    if (names.has(name.toLowerCase()))
      throw new Error("KMZ ZIP 包含重複檔案名稱");
    names.add(name.toLowerCase());
    if (
      compressed > bytes.length ||
      size > LIMITS.expandedBytes ||
      (total += size) > LIMITS.expandedBytes
    )
      throw new Error("KMZ 解壓後大小超過 8 MB");
    const localNameLength = u16(local + 26),
      data = local + 30 + localNameLength + u16(local + 28);
    if (
      data > start ||
      data + compressed > start ||
      u16(local + 6) !== flags ||
      u16(local + 8) !== method ||
      decoder.decode(
        bytes.subarray(local + 30, local + 30 + localNameLength),
      ) !== name
    )
      throw new Error("KMZ ZIP 檔頭損毀");
    if (
      !(flags & 8) &&
      (u32(local + 18) !== compressed || u32(local + 22) !== size)
    )
      throw new Error("KMZ ZIP 大小紀錄損毀");
    result.push({ name, method, crc, compressed, size, local, data });
    offset = next;
  }
  if (offset !== end) throw new Error("KMZ ZIP 目錄大小不一致");
  const physical = [...result].sort((a, b) => a.local - b.local);
  for (let index = 1; index < physical.length; index++)
    if (
      physical[index].local <
      physical[index - 1].data + physical[index - 1].compressed
    )
      throw new Error("KMZ ZIP 條目範圍重疊");
  return result;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function readKmz(input) {
  const bytes =
    input instanceof Uint8Array
      ? input
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : null;
  if (!bytes) throw new Error("KMZ 需提供 Uint8Array 或 ArrayBuffer");
  if (bytes.length > LIMITS.kmzBytes) throw new Error("KMZ 大小需小於 5 MB");
  if (bytes.length < 22) throw new Error("KMZ ZIP 檔案損毀");
  let entries;
  try {
    entries = archiveEntries(bytes);
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError)
      throw new Error("KMZ ZIP 檔案或 UTF-8 檔名損毀");
    throw error;
  }
  const mains = entries.filter((entry) => /\.kml$/i.test(entry.name));
  if (mains.length !== 1)
    throw new Error("KMZ 需包含唯一的 .kml 主檔，請合併或移除額外的 KML");
  const main = mains[0];
  let total = 0;
  const chunks = [];
  for (const entry of entries) {
    let length = 0,
      crc = 0xffffffff;
    const receive = (chunk) => {
      length += chunk.length;
      total += chunk.length;
      if (length > entry.size || total > LIMITS.expandedBytes)
        throw new Error("KMZ 解壓大小超出限制或 ZIP 紀錄損毀");
      if (entry === main && length > LIMITS.kmlBytes)
        throw new Error("KMZ 主 KML 大小超過 2 MB");
      for (const byte of chunk)
        crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      if (entry === main) chunks.push(chunk.slice());
    };
    try {
      if (entry.method === 0)
        receive(bytes.subarray(entry.data, entry.data + entry.compressed));
      else {
        const inflater = new Inflate(receive);
        // Small input chunks bound transient allocations even when ZIP size metadata is forged.
        for (let offset = 0; offset < entry.compressed; offset += 1024)
          inflater.push(
            bytes.subarray(
              entry.data + offset,
              entry.data + Math.min(offset + 1024, entry.compressed),
            ),
            offset + 1024 >= entry.compressed,
          );
        if (!entry.compressed) throw new Error("KMZ 壓縮串流損毀");
      }
    } catch (error) {
      throw new Error(`KMZ 解壓失敗：${error.message}`);
    }
    if (length !== entry.size || (crc ^ 0xffffffff) >>> 0 !== entry.crc)
      throw new Error("KMZ CRC 校驗或解壓大小不符，檔案可能損毀");
  }
  const textBytes = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    textBytes.set(chunk, offset);
    offset += chunk.length;
  }
  let source;
  try {
    source = decoder.decode(textBytes);
  } catch {
    throw new Error("KMZ 主 KML 必須使用 UTF-8 編碼");
  }
  return readKml(source);
}

export function writeKmz(features) {
  return zipSync({ "doc.kml": strToU8(writeKml(features)) }, { level: 6 });
}
