import { InputError } from "./validation.js";
export function validatePhotos(photos) {
  if (photos === undefined) return undefined;
  if (!Array.isArray(photos) || photos.length > 5)
    throw new InputError("每個事件最多 5 張照片");
  return photos.map((photo) => {
    if (typeof photo === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(photo))
      return { id: photo };
    if (typeof photo !== "string" || photo.length > 1400000)
      throw new InputError("每張照片最多 1 MB");
    const match = photo.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match) throw new InputError("照片僅支援 JPEG、PNG、WebP");
    let bytes;
    try {
      bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    } catch {
      throw new InputError("照片格式無效");
    }
    const signature = (...values) => values.every((v, i) => bytes[i] === v);
    const valid =
      match[1] === "image/jpeg"
        ? signature(255, 216, 255)
        : match[1] === "image/png"
          ? signature(137, 80, 78, 71, 13, 10, 26, 10)
          : signature(82, 73, 70, 70) &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!valid || bytes.length > 1024 * 1024)
      throw new InputError("照片格式或大小無效");
    return { id: crypto.randomUUID(), mime: match[1], bytes };
  });
}
export async function photoStatements(db, eventId, photos) {
  if (photos === undefined) return [];
  const existing = await db
    .prepare("SELECT id FROM photos WHERE event_id=?")
    .bind(eventId)
    .all();
  const owned = new Set(existing.results.map((p) => p.id));
  for (const p of photos)
    if (!p.bytes && !owned.has(p.id)) throw new InputError("照片不屬於此事件");
  const keep = new Set(photos.filter((p) => !p.bytes).map((p) => p.id));
  return [
    ...existing.results
      .filter((p) => !keep.has(p.id))
      .map((p) =>
        db
          .prepare("DELETE FROM photos WHERE id=? AND event_id=?")
          .bind(p.id, eventId),
      ),
    ...photos
      .filter((p) => p.bytes)
      .map((p) =>
        db
          .prepare(
            "INSERT INTO photos (id,event_id,mime,data) VALUES (?,?,?,?)",
          )
          .bind(p.id, eventId, p.mime, p.bytes.buffer),
      ),
  ];
}
export const eventSelect =
  "SELECT events.*, (SELECT json_group_array(id) FROM photos WHERE event_id=events.id) AS photos FROM events";
export const eventRow = (row) => ({
  ...row,
  photos: JSON.parse(row.photos || "[]"),
});
