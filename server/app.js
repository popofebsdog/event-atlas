import { InputError, validateProject, validateEvent } from "./validation.js";
import {
  validatePhotos,
  photoStatements,
  eventSelect,
  eventRow,
} from "./photos.js";
import { readAnnotations } from "../shared/annotations.js";
import { inspectMedia, pdfResponse, MediaError } from "./remote-media.js";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    };
    if (allowed.includes(origin))
      headers["Access-Control-Allow-Origin"] = origin;
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    if (origin && !allowed.includes(origin))
      return json({ error: "此網站來源未獲允許" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization,Range",
        },
      });
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === "POST" && path === "/api/admin/verify") {
        if (
          !env.ADMIN_TOKEN ||
          request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`
        )
          return json({ error: "需要管理員權限" }, 403);
        return json({ ok: true });
      }
      if (request.method === "GET" && path === "/api/health")
        return json({ ok: true });
      const documentMatch = path.match(
        /^\/api\/events\/([a-zA-Z0-9-]{1,64})\/(media|pdf)$/,
      );
      if (request.method === "GET" && documentMatch) {
        const event = await env.DB.prepare("SELECT url FROM events WHERE id=?")
          .bind(documentMatch[1])
          .first();
        if (!event) return json({ error: "事件不存在" }, 404);
        if (documentMatch[2] === "pdf")
          return await pdfResponse(
            event.url,
            request,
            headers,
            env.PUBLIC_FETCH,
          );
        try {
          return json(
            await inspectMedia(event.url, url.hostname, env.PUBLIC_FETCH),
          );
        } catch (error) {
          if (error instanceof MediaError) throw error;
          return json({ kind: "web", verified: false });
        }
      }
      const photoMatch = path.match(/^\/api\/photos\/([a-zA-Z0-9-]{1,64})$/);
      if (request.method === "GET" && photoMatch) {
        const photo = await env.DB.prepare(
          "SELECT mime,data FROM photos WHERE id=?",
        )
          .bind(photoMatch[1])
          .first();
        if (!photo) return json({ error: "照片不存在" }, 404);
        return new Response(new Uint8Array(photo.data), {
          headers: {
            ...headers,
            "Content-Type": photo.mime,
            "Content-Security-Policy": "default-src 'none'; sandbox",
          },
        });
      }
      if (request.method === "GET" && path === "/api/projects") {
        const offset = pageOffset(url);
        const { results } = await env.DB.prepare(
          "SELECT * FROM projects ORDER BY created_at, id LIMIT 101 OFFSET ?",
        )
          .bind(offset)
          .all();
        return json({
          items: results.slice(0, 100),
          next: results.length > 100 ? offset + 100 : null,
        });
      }
      const match = path.match(
        /^\/api\/projects\/([a-zA-Z0-9-]{1,64})\/events$/,
      );
      const featureMatch = path.match(
        /^\/api\/projects\/([a-zA-Z0-9-]{1,64})\/features$/,
      );
      if (request.method === "GET" && featureMatch) {
        const offset = pageOffset(url);
        const { results } = await env.DB.prepare(
          "SELECT * FROM project_features WHERE project_id=? ORDER BY created_at,id LIMIT 101 OFFSET ?",
        )
          .bind(featureMatch[1], offset)
          .all();
        return json({
          items: results
            .slice(0, 100)
            .map((row) => ({ ...row, geometry: JSON.parse(row.geometry) })),
          next: results.length > 100 ? offset + 100 : null,
        });
      }
      if (request.method === "GET" && match) {
        const offset = pageOffset(url);
        const { results } = await env.DB.prepare(
          eventSelect +
            " WHERE project_id = ? ORDER BY occurred_at DESC, id LIMIT 101 OFFSET ?",
        )
          .bind(match[1], offset)
          .all();
        return json({
          items: results.slice(0, 100).map(eventRow),
          next: results.length > 100 ? offset + 100 : null,
        });
      }
      if (
        request.method === "POST" &&
        (path === "/api/projects" || match || featureMatch)
      ) {
        if (
          !env.ADMIN_TOKEN ||
          request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`
        )
          return json({ error: "需要管理員權限" }, 403);
        if (!origin || !allowed.includes(origin))
          return json({ error: "投稿必須透過平台進行" }, 403);
        if (!request.headers.get("content-type")?.includes("application/json"))
          return json({ error: "需使用 JSON" }, 415);
        const raw = await readLimited(
          request,
          featureMatch ? 512000 : match ? 7050000 : 24000,
        );
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new InputError("JSON 格式錯誤");
        }
        if (!body || typeof body !== "object")
          throw new InputError("資料格式錯誤");
        let fields;
        if (featureMatch) {
          try {
            fields = readAnnotations(body.geojson);
          } catch (e) {
            throw new InputError(e.message);
          }
        } else fields = match ? validateEvent(body) : validateProject(body);
        const photos = match ? validatePhotos(body.photos) : undefined;
        if (
          (match || featureMatch) &&
          !(await env.DB.prepare("SELECT id FROM projects WHERE id = ?")
            .bind((match || featureMatch)[1])
            .first())
        )
          return json({ error: "地區不存在" }, 404);
        if (!(await verifyChallenge(body.token, request, env)))
          return json({ error: "驗證未完成或已過期，請重新驗證" }, 403);
        if (featureMatch) {
          const created_at = new Date().toISOString();
          const items = fields.map((field) => ({
            id: crypto.randomUUID(),
            project_id: featureMatch[1],
            ...field,
            created_at,
          }));
          await env.DB.batch(
            items.map((item) =>
              env.DB.prepare(
                "INSERT INTO project_features (id,project_id,name,description,geometry,created_at) VALUES (?,?,?,?,?,?)",
              ).bind(
                item.id,
                item.project_id,
                item.name,
                item.description,
                JSON.stringify(item.geometry),
                created_at,
              ),
            ),
          );
          return json({ items }, 201);
        }
        const id = crypto.randomUUID(),
          now = new Date().toISOString();
        if (match) {
          const insert = env.DB.prepare(
            "INSERT INTO events (id,project_id,title,description,occurred_at,url,created_at,lat,lng,category,source,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          ).bind(
            id,
            match[1],
            fields.title,
            fields.description,
            fields.occurred_at,
            fields.url,
            now,
            fields.lat,
            fields.lng,
            fields.category,
            fields.source,
            now,
          );
          await env.DB.batch([
            insert,
            ...(await photoStatements(env.DB, id, photos)),
          ]);
        } else {
          await env.DB.prepare(
            "INSERT INTO projects (id,name,lat,lng,created_at,kind) VALUES (?,?,?,?,?,?)",
          )
            .bind(id, fields.name, fields.lat, fields.lng, now, fields.kind)
            .run();
        }
        return json(
          {
            id,
            ...fields,
            ...(match
              ? {
                  project_id: match[1],
                  photos: (photos || []).map((p) => p.id),
                  updated_at: now,
                }
              : {}),
            created_at: now,
          },
          201,
        );
      }
      const removal = path.match(
        /^\/api\/(events|projects|features)\/([a-zA-Z0-9-]{1,64})$/,
      );
      if (["PUT", "DELETE"].includes(request.method) && removal) {
        if (
          !env.ADMIN_TOKEN ||
          request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`
        )
          return json({ error: "需要管理員權限" }, 403);
        if (removal[1] === "features") {
          if (request.method !== "DELETE")
            return json({ error: "標註僅支援刪除後重新繪製" }, 405);
          const result = await env.DB.prepare(
            "DELETE FROM project_features WHERE id=?",
          )
            .bind(removal[2])
            .run();
          return json({ deleted: result.meta.changes > 0 });
        }
        if (request.method === "PUT") {
          if (
            !request.headers.get("content-type")?.includes("application/json")
          )
            return json({ error: "需使用 JSON" }, 415);
          let body;
          try {
            body = JSON.parse(
              await readLimited(
                request,
                removal[1] === "events" ? 7050000 : 24000,
              ),
            );
          } catch (e) {
            if (e instanceof InputError) throw e;
            throw new InputError("JSON 格式錯誤");
          }
          if (!body || typeof body !== "object")
            throw new InputError("資料格式錯誤");
          const isEvent = removal[1] === "events";
          const f = isEvent ? validateEvent(body) : validateProject(body);
          const photoOps = isEvent
            ? await photoStatements(
                env.DB,
                removal[2],
                validatePhotos(body.photos),
              )
            : [];
          const update = isEvent
            ? env.DB.prepare(
                "UPDATE events SET title=?, description=?, occurred_at=?, url=?, lat=CASE WHEN ? THEN ? ELSE lat END, lng=CASE WHEN ? THEN ? ELSE lng END, category=CASE WHEN ? THEN ? ELSE category END, source=CASE WHEN ? THEN ? ELSE source END, updated_at=? WHERE id=?",
              ).bind(
                f.title,
                f.description,
                f.occurred_at,
                f.url,
                body.lat !== undefined ? 1 : 0,
                f.lat,
                body.lng !== undefined ? 1 : 0,
                f.lng,
                body.category !== undefined ? 1 : 0,
                f.category,
                body.source !== undefined ? 1 : 0,
                f.source,
                new Date().toISOString(),
                removal[2],
              )
            : env.DB.prepare(
                "UPDATE projects SET name=?, lat=?, lng=?, kind=CASE WHEN ? THEN ? ELSE kind END WHERE id=?",
              ).bind(
                f.name,
                f.lat,
                f.lng,
                body.kind !== undefined ? 1 : 0,
                f.kind,
                removal[2],
              );
          if (
            isEvent &&
            !(await env.DB.prepare("SELECT id FROM events WHERE id=?")
              .bind(removal[2])
              .first())
          )
            return json({ error: "紀錄已不存在，請重新整理" }, 404);
          const [result] = await env.DB.batch([update, ...photoOps]);
          if (!result.meta.changes)
            return json({ error: "紀錄已不存在，請重新整理" }, 404);
          const row = await env.DB.prepare(
            isEvent
              ? eventSelect + " WHERE events.id=?"
              : "SELECT * FROM projects WHERE id=?",
          )
            .bind(removal[2])
            .first();
          return json(isEvent ? eventRow(row) : row);
        }
        // Table is selected from a fixed allowlist, never arbitrary input.
        const statement =
          removal[1] === "events"
            ? "DELETE FROM events WHERE id = ?"
            : "DELETE FROM projects WHERE id = ?";
        const result = await env.DB.prepare(statement).bind(removal[2]).run();
        return json({ deleted: result.meta.changes > 0 });
      }
      return json({ error: "找不到此 API" }, 404);
    } catch (error) {
      if (error instanceof MediaError)
        return json({ error: error.message }, error.status);
      if (error instanceof InputError)
        return json({ error: error.message }, 400);
      console.error("API failure:", error.name);
      return json(
        { error: "服務暫時無法處理，請稍後重試（可能已達免費額度）" },
        503,
      );
    }
  },
};
function pageOffset(url) {
  const value = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(value) || value < 0 || value > 100000)
    throw new InputError("分頁參數錯誤");
  return value;
}
async function readLimited(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("缺少資料");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new InputError("資料過大");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
async function verifyChallenge(token, request, env) {
  const local = ["localhost", "127.0.0.1"].includes(
    new URL(request.url).hostname,
  );
  if (local && env.LOCAL_DEV === "true") return true;
  if (!env.TURNSTILE_SECRET || typeof token !== "string" || token.length > 2048)
    return false;
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || "",
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = await response.json();
  return (
    result.success &&
    (env.TURNSTILE_HOSTNAMES || "")
      .split(",")
      .map((s) => s.trim())
      .includes(result.hostname)
  );
}
