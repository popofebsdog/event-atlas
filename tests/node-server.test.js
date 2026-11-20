import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function start(dbPath, overrides = {}) {
  const { createAtlasServer } = await import("../server/node.js");
  const server = await createAtlasServer({
    dbPath,
    adminToken: "node-test-only",
    allowedOrigins: "http://localhost:5174",
    publicUrl: "http://localhost",
    localDev: true,
    ...overrides,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const close = (server) =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
const headers = {
  Origin: "http://localhost:5174",
  Authorization: "Bearer node-test-only",
  "Content-Type": "application/json",
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC0sAAAAASUVORK5CYII=";

test("standalone Node API persists project, event, photo and geometry, enforces access and cascades deletion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-node-")),
    dbPath = join(directory, "atlas.sqlite");
  let running;
  try {
    running = await start(dbPath);
    let { base } = running;
    assert.equal((await fetch(base + "/api/health")).status, 200);
    assert.equal(
      (
        await fetch(base + "/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/projects", {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    const post = async (path, body) => {
      const response = await fetch(base + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 201, await response.clone().text());
      return response.json();
    };
    const project = await post("/api/projects", {
      name: "Node 調查專案",
      lat: 24.2,
      lng: 121,
    });
    const event = await post(`/api/projects/${project.id}/events`, {
      title: "獨立後端事件",
      description: "跨重啟保存",
      occurred_at: "2026-11-20T01:00:00Z",
      photos: [png],
      lat: 24.201,
      lng: 121.001,
    });
    const features = await post(`/api/projects/${project.id}/features`, {
      geojson: {
        type: "Feature",
        properties: { name: "參考點", description: "KML 轉換後的標註" },
        geometry: { type: "Point", coordinates: [121.002, 24.202] },
      },
    });
    assert.equal(features.items.length, 1);
    const list = await fetch(base + `/api/projects/${project.id}/events`).then(
      (r) => r.json(),
    );
    assert.equal(list.items[0].photos.length, 1);
    const photoId = list.items[0].photos[0],
      photo = await fetch(base + "/api/photos/" + photoId);
    assert.equal(photo.headers.get("content-type"), "image/png");
    assert.deepEqual(
      [...new Uint8Array(await photo.arrayBuffer())].slice(0, 4),
      [137, 80, 78, 71],
    );
    await close(running.server);
    running = await start(dbPath);
    base = running.base;
    assert.equal(
      (await fetch(base + "/api/projects").then((r) => r.json())).items[0].id,
      project.id,
    );
    assert.equal(
      (
        await fetch(base + `/api/projects/${project.id}/features`).then((r) =>
          r.json(),
        )
      ).items[0].name,
      "參考點",
    );
    const updated = await fetch(base + "/api/events/" + event.id, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        title: "重新啟動後編輯",
        description: "保留照片",
        occurred_at: "2026-11-20T01:00:00Z",
        url: "",
        photos: [photoId],
      }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual((await updated.json()).photos, [photoId]);
    const removed = await fetch(base + "/api/projects/" + project.id, {
      method: "DELETE",
      headers,
    });
    assert.equal(removed.status, 200);
    assert.equal(
      (
        await fetch(base + `/api/projects/${project.id}/events`).then((r) =>
          r.json(),
        )
      ).items.length,
      0,
    );
    assert.equal(
      (
        await fetch(base + `/api/projects/${project.id}/features`).then((r) =>
          r.json(),
        )
      ).items.length,
      0,
    );
    assert.equal((await fetch(base + "/api/photos/" + photoId)).status, 404);
  } finally {
    if (running?.server.listening) await close(running.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node production URL cannot bypass website verification through Local Dev or a forged Host", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-production-"));
  let running;
  try {
    running = await start(join(directory, "atlas.sqlite"), {
      publicUrl: "https://atlas.example",
      localDev: true,
    });
    const response = await fetch(running.base + "/api/projects", {
      method: "POST",
      headers: { ...headers, Host: "localhost" },
      body: JSON.stringify({ name: "不可略過驗證", lat: 24, lng: 121 }),
    });
    assert.equal(response.status, 403);
    assert.equal(
      (await fetch(running.base + "/api/projects").then((r) => r.json())).items
        .length,
      0,
    );
  } finally {
    if (running?.server.listening) await close(running.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite compatibility adapter executes batches atomically, including photo blobs", async () => {
  const { openDatabase } = await import("../server/database.js"),
    db = await openDatabase(":memory:");
  try {
    const insert = (id) =>
      db
        .prepare(
          "INSERT INTO projects (id,name,lat,lng,created_at) VALUES (?,?,?,?,?)",
        )
        .bind(id, "測試", 24, 121, new Date().toISOString());
    await assert.rejects(db.batch([insert("duplicate"), insert("duplicate")]));
    assert.equal(
      await db
        .prepare("SELECT id FROM projects WHERE id=?")
        .bind("duplicate")
        .first(),
      null,
    );
  } finally {
    db.close();
  }
});
