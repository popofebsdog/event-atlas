import assert from "node:assert/strict";
const base = "http://localhost:8787/api";
const origin = "http://localhost:5174";
async function request(path, method = "GET", body, extra = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const p = await request("/projects", "POST", {
  name: "整合測試（完成後自動移除）",
  lat: 24.165,
  lng: 121.565,
});
assert.equal(p.status, 201, JSON.stringify(p.data));
try {
  const e = await request(`/projects/${p.data.id}/events`, "POST", {
    title: "燕子口事件",
    description: "<script>alert(1)</script> 僅以文字顯示",
    occurred_at: "2025-10-17T00:00:00.000Z",
    url: "https://yanzi-gorge-story.a0979310017.chatgpt.site/",
  });
  assert.equal(e.status, 201);
  const read = await request(`/projects/${p.data.id}/events`);
  assert.equal(read.data.items[0].id, e.data.id);
  assert.equal(
    read.data.items[0].description,
    "<script>alert(1)</script> 僅以文字顯示",
  );
  const invalid = await request(`/projects/${p.data.id}/events`, "POST", {
    title: "bad",
    description: "",
    occurred_at: "2025-10-17T00:00:00.000Z",
    url: "javascript:alert(1)",
  });
  assert.equal(invalid.status, 400);
  assert.equal((await request(`/events/${e.data.id}`, "DELETE")).status, 403);
  const auth = {Authorization:'Bearer local-development-only-not-for-production'};
  const changedProject = {name:'已更新測試地區', lat:24.2,lng:121.6};
  assert.equal((await request(`/projects/${p.data.id}`, 'PUT', changedProject)).status,403);
  const updated = await request(`/projects/${p.data.id}`, 'PUT', changedProject,auth);
  assert.equal(updated.status,200);
  assert.equal(updated.data.lat,24.2);
  assert.equal(updated.data.name,changedProject.name);
  const changedEvent = {...e.data,title:'已更新事件',occurred_at:'2025-10-18T02:30:00.000Z'};
  assert.equal((await request(`/events/${e.data.id}`, 'PUT', changedEvent)).status,403);
  assert.equal((await request(`/events/${e.data.id}`, 'PUT', {...changedEvent,url:'javascript:alert(1)'},auth)).status,400);
  assert.equal((await request(`/events/${e.data.id}`, 'PUT',changedEvent,auth)).status,200);
  const reread = await request(`/projects/${p.data.id}/events`);
  assert.equal(reread.data.items[0].title,changedEvent.title);
  assert.equal(reread.data.items[0].occurred_at,changedEvent.occurred_at);
  assert.equal((await request('/events/missing', 'PUT',changedEvent,auth)).status,404);
  assert.equal((await request(`/events/${e.data.id}`, 'DELETE',undefined,auth)).data.deleted,true);
  assert.equal((await request(`/projects/${p.data.id}/events`)).data.items.length,0);
  assert.equal((await request(`/projects/${p.data.id}/events`,'POST',changedEvent)).status,201);
  console.log('PASS: authorized edits, coordinate/time persistence, rejected invalid edits, event deletion');
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
