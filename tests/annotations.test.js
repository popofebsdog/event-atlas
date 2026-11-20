import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

const point = {
  type: "Feature",
  properties: { name: "雨量站位置", description: "操作示範" },
  geometry: { type: "Point", coordinates: [121.4063, 24.673] },
};
const env = {
  ADMIN_TOKEN: "test-key",
  LOCAL_DEV: "true",
  ALLOWED_ORIGINS: "http://localhost:5174",
  DB: {
    prepare() {
      throw new Error("Invalid input must not reach the database");
    },
  },
};
function post(geojson, authorization = "Bearer test-key") {
  return worker.fetch(
    new Request("http://localhost/api/projects/example/features", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({ geojson }),
    }),
    env,
  );
}
test("project annotations require administrator permission before database access", async () => {
  assert.equal((await post(point, "")).status, 403);
  assert.equal(
    (
      await worker.fetch(
        new Request("http://localhost/api/features/example", {
          method: "DELETE",
        }),
        env,
      )
    ).status,
    403,
  );
});
test("production annotation creation retains website verification even with LOCAL_DEV set", async () => {
  const DB = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return { id: "example" };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://api.example.com/api/projects/example/features", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
      },
      body: JSON.stringify({ geojson: point }),
    }),
    { ...env, DB },
  );
  assert.equal(response.status, 403);
});
test("annotation input rejects malformed, oversized and non-WGS84 geometry before database access", async () => {
  for (const geometry of [
    { type: "Point", coordinates: [250000, 2700000] },
    { type: "Point", coordinates: ["121", 24] },
    { type: "LineString", coordinates: [[121, 24]] },
    {
      type: "Polygon",
      coordinates: [
        [
          [121, 24],
          [122, 24],
          [122, 25],
          [121, 25],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [121, 24],
          [121, 24],
          [121, 24],
          [121, 24],
        ],
      ],
    },
    { type: "GeometryCollection", geometries: [] },
    {
      type: "LineString",
      coordinates: Array.from({ length: 2001 }, () => [121, 24]),
    },
  ])
    assert.equal(
      (await post({ ...point, geometry })).status,
      400,
      JSON.stringify(geometry).slice(0, 100),
    );
  assert.equal(
    (
      await post({
        ...point,
        crs: { type: "name", properties: { name: "EPSG:3826" } },
      })
    ).status,
    400,
  );
  assert.equal(
    (await post({ ...point, properties: { name: "a".repeat(161) } })).status,
    400,
  );
  assert.equal(
    (
      await post({
        type: "FeatureCollection",
        features: Array(101).fill(point),
      })
    ).status,
    400,
  );
});
