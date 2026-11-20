import assert from "node:assert/strict";
const base =
  (process.env.ATLAS_TEST_API_URL || "http://localhost:8787") + "/api";
const origin = process.env.ATLAS_TEST_ORIGIN || "http://localhost:5174";
const auth = {
  Authorization: "Bearer local-development-only-not-for-production",
};
async function request(path, method = "GET", body, extra = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const p = await request(
  "/projects",
  "POST",
  {
    name: "整合測試（完成後自動移除）",
    lat: 24.165,
    lng: 121.565,
  },
  auth,
);
assert.equal(p.status, 201, JSON.stringify(p.data));
try {
  const station = await request(
    "/projects",
    "POST",
    { name: "自建雨量站測試", lat: 25, lng: 121.5, kind: "rainfall_station" },
    auth,
  );
  assert.equal(station.status, 201);
  try {
    const fields = {
      title: "站點觀測",
      description: "",
      occurred_at: "2026-11-19T12:00:00Z",
      lat: 24.9,
      lng: 121.4,
      category: "rainfall",
      source: "自建站現地調查",
    };
    const observation = await request(
      `/projects/${station.data.id}/events`,
      "POST",
      fields,
      auth,
    );
    assert.equal(observation.status, 201);
    assert.equal(observation.data.lat, 24.9);
    const legacyEdit = await request(
      `/events/${observation.data.id}`,
      "PUT",
      {
        title: "舊客戶端編輯",
        description: "",
        occurred_at: fields.occurred_at,
      },
      auth,
    );
    assert.equal(legacyEdit.status, 200);
    assert.equal(legacyEdit.data.lat, 24.9);
    assert.equal(legacyEdit.data.lng, 121.4);
    assert.equal(legacyEdit.data.category, "rainfall");
    assert.equal(legacyEdit.data.source, "自建站現地調查");
    assert.equal(legacyEdit.data.created_at, observation.data.created_at);
    assert.ok(
      Date.parse(legacyEdit.data.updated_at) >=
        Date.parse(observation.data.updated_at),
    );
    const stationEdit = await request(
      `/projects/${station.data.id}`,
      "PUT",
      { name: "改名站點", lat: 25, lng: 121.5 },
      auth,
    );
    assert.equal(stationEdit.data.kind, "rainfall_station");
    assert.equal(
      (
        await request(
          `/events/${observation.data.id}`,
          "PUT",
          { ...fields, lat: 200 },
          auth,
        )
      ).status,
      400,
    );
    const explicitReset = await request(
      `/events/${observation.data.id}`,
      "PUT",
      { ...fields, lat: null, lng: null },
      auth,
    );
    assert.equal(explicitReset.data.lat, null);
    assert.equal(explicitReset.data.lng, null);
  } finally {
    await request(`/projects/${station.data.id}`, "DELETE", undefined, auth);
  }
  console.log(
    "PASS manual station, independent event coordinates, legacy edits preserve coordinates/type, explicit inheritance and invalid location rejection",
  );
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=";
  const photoEvent = {
    title: "只有照片，沒有網址",
    description: "照片測試",
    occurred_at: "2026-09-13T06:07:00Z",
    photos: [png],
  };
  assert.equal(
    (await request(`/projects/${p.data.id}/events`, "POST", photoEvent)).status,
    403,
  );
  const uploaded = await request(
    `/projects/${p.data.id}/events`,
    "POST",
    photoEvent,
    auth,
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  assert.equal(uploaded.data.url, "");
  assert.equal(uploaded.data.photos.length, 1);
  const photoId = uploaded.data.photos[0];
  const image = await fetch(base + `/photos/${photoId}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(
    Buffer.from(await image.arrayBuffer()),
    Buffer.from(png.split(",")[1], "base64"),
  );
  const list = await request(`/projects/${p.data.id}/events`);
  assert.deepEqual(
    list.data.items.find((e) => e.id === uploaded.data.id).photos,
    [photoId],
  );
  const unchanged = await request(
    `/events/${uploaded.data.id}`,
    "PUT",
    { ...photoEvent, photos: undefined },
    auth,
  );
  assert.deepEqual(unchanged.data.photos, [photoId]);
  const kept = await request(
    `/events/${uploaded.data.id}`,
    "PUT",
    { ...photoEvent, photos: [photoId, png] },
    auth,
  );
  assert.equal(kept.data.photos.length, 2);
  assert.equal(
    (
      await request(
        `/projects/${p.data.id}/events`,
        "POST",
        { ...photoEvent, photos: [photoId] },
        auth,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/events/${uploaded.data.id}`,
        "PUT",
        { ...photoEvent, photos: ["not-owned"] },
        auth,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/events/${uploaded.data.id}`,
        "PUT",
        { ...photoEvent, photos: ["data:image/jpeg;base64,PHNjcmlwdD4="] },
        auth,
      )
    ).status,
    400,
  );
  const replaced = await request(
    `/events/${uploaded.data.id}`,
    "PUT",
    { ...photoEvent, photos: [png] },
    auth,
  );
  assert.equal(replaced.status, 200);
  assert.equal((await fetch(base + `/photos/${photoId}`)).status, 404);
  const remaining = replaced.data.photos[0];
  assert.equal(
    (await request(`/events/${uploaded.data.id}`, "DELETE", undefined, auth))
      .status,
    200,
  );
  assert.equal((await fetch(base + `/photos/${remaining}`)).status, 404);
  console.log(
    "PASS: photo-only event; real image bytes; list; retain, replace and delete photos; ownership, invalid image and authorization checks",
  );
  const e = await request(
    `/projects/${p.data.id}/events`,
    "POST",
    {
      title: "燕子口事件",
      description: "<script>alert(1)</script> 僅以文字顯示",
      occurred_at: "2025-10-17T00:00:00.000Z",
      url: "https://yanzi-gorge-story.a0979310017.chatgpt.site/",
    },
    auth,
  );
  assert.equal(e.status, 201);
  const read = await request(`/projects/${p.data.id}/events`);
  assert.equal(read.data.items[0].id, e.data.id);
  assert.equal(
    read.data.items[0].description,
    "<script>alert(1)</script> 僅以文字顯示",
  );
  const invalid = await request(
    `/projects/${p.data.id}/events`,
    "POST",
    {
      title: "bad",
      description: "",
      occurred_at: "2025-10-17T00:00:00.000Z",
      url: "javascript:alert(1)",
    },
    auth,
  );
  assert.equal(invalid.status, 400);
  assert.equal((await request(`/events/${e.data.id}`, "DELETE")).status, 403);
  const changedProject = { name: "已更新測試地區", lat: 24.2, lng: 121.6 };
  assert.equal(
    (await request(`/projects/${p.data.id}`, "PUT", changedProject)).status,
    403,
  );
  const updated = await request(
    `/projects/${p.data.id}`,
    "PUT",
    changedProject,
    auth,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.lat, 24.2);
  assert.equal(updated.data.name, changedProject.name);
  const changedEvent = {
    ...e.data,
    title: "已更新事件",
    occurred_at: "2025-10-18T02:30:00.000Z",
  };
  assert.equal(
    (await request(`/events/${e.data.id}`, "PUT", changedEvent)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/events/${e.data.id}`,
        "PUT",
        { ...changedEvent, url: "javascript:alert(1)" },
        auth,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request(`/events/${e.data.id}`, "PUT", changedEvent, auth)).status,
    200,
  );
  const reread = await request(`/projects/${p.data.id}/events`);
  assert.equal(reread.data.items[0].title, changedEvent.title);
  assert.equal(reread.data.items[0].occurred_at, changedEvent.occurred_at);
  assert.equal(
    (await request("/events/missing", "PUT", changedEvent, auth)).status,
    404,
  );
  assert.equal(
    (await request(`/events/${e.data.id}`, "DELETE", undefined, auth)).data
      .deleted,
    true,
  );
  assert.equal(
    (await request(`/projects/${p.data.id}/events`)).data.items.length,
    0,
  );
  assert.equal(
    (await request(`/projects/${p.data.id}/events`, "POST", changedEvent))
      .status,
    403,
  );
  assert.equal(
    (await request(`/projects/${p.data.id}/events`, "POST", changedEvent, auth))
      .status,
    201,
  );
  console.log(
    "PASS: authorized edits, coordinate/time persistence, rejected invalid edits, event deletion",
  );
  console.log(
    "PASS: local D1 create project → create event → independent read → unsafe URL rejection → deletion authorization",
  );
} finally {
  const result = await request(`/projects/${p.data.id}`, "DELETE", undefined, {
    Authorization: "Bearer local-development-only-not-for-production",
  });
  assert.equal(result.status, 200);
  assert.equal(
    (await request(`/projects/${p.data.id}/events`)).data.items.length,
    0,
  );
  console.log("PASS: test project cleanup and cascading event deletion");
}
