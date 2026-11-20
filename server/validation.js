import { EVENT_TYPES } from "../shared/records.js";
export class InputError extends Error {}
export function text(value, label, max, optional = false) {
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > max
  )
    throw new InputError(`${label}不正確（最多 ${max} 字）`);
  return value.trim();
}
export function validateProject(body) {
  const name = text(body.name, "地區名稱", 100);
  const { lat, lng } = body;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    Math.abs(lng) > 180
  )
    throw new InputError("座標超出有效範圍");
  const kind = body.kind ?? "area";
  if (!["area", "rainfall_station"].includes(kind))
    throw new InputError("地點類型無效");
  return { name, lat, lng, kind };
}
export function validateEvent(body) {
  const title = text(body.title, "事件名稱", 160);
  const description = text(body.description, "事件敘述", 5000, true);
  const category = body.category ?? "other";
  if (typeof category !== "string" || !Object.hasOwn(EVENT_TYPES, category))
    throw new InputError("事件類型無效");
  const source = text(body.source ?? "", "資料來源", 200, true);
  const url = text(body.url ?? "", "網頁網址", 2048, true);
  let parsed;
  try {
    if (url) parsed = new URL(url);
  } catch {
    throw new InputError("請輸入完整 HTTPS 網址");
  }
  if (
    parsed &&
    (parsed.protocol !== "https:" || parsed.username || parsed.password)
  )
    throw new InputError("請使用不含帳密的 HTTPS 網址");
  const time = text(body.occurred_at, "時間", 40);
  const { lat = null, lng = null } = body;
  if ("lat" in body !== "lng" in body)
    throw new InputError("事件座標需同時填寫經緯度");
  if (
    !(
      (lat === null && lng === null) ||
      (typeof lat === "number" &&
        Number.isFinite(lat) &&
        Math.abs(lat) <= 90 &&
        typeof lng === "number" &&
        Number.isFinite(lng) &&
        Math.abs(lng) <= 180)
    )
  )
    throw new InputError("事件座標需同時填寫有效的經緯度");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(time) ||
    !Number.isFinite(Date.parse(time)) ||
    new Date(time).toISOString().slice(0, 19) !== time.slice(0, 19)
  )
    throw new InputError("事件時間無效");
  return {
    title,
    description,
    category,
    source,
    lat,
    lng,
    url: parsed?.href || "",
    occurred_at: new Date(time).toISOString(),
  };
}
