export const GEOMETRY_LABELS = { Point: "點", LineString: "線", Polygon: "面" };

export function readAnnotations(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("請使用 GeoJSON 點、線或面資料");
  const crs = data.crs?.properties?.name;
  if (
    data.crs &&
    ![
      "EPSG:4326",
      "urn:ogc:def:crs:OGC:1.3:CRS84",
      "urn:ogc:def:crs:EPSG::4326",
    ].includes(crs)
  )
    throw new Error("GeoJSON 請先轉換為 WGS84 經緯度");
  const features = data.type === "FeatureCollection" ? data.features : [data];
  if (!Array.isArray(features) || !features.length || features.length > 100)
    throw new Error("每次可匯入 1 至 100 筆標註");
  let total = 0;
  return features.map((feature) => {
    if (
      !feature ||
      typeof feature !== "object" ||
      (feature.crs && feature !== data)
    )
      throw new Error("GeoJSON 標註格式不正確");
    const geometry = feature.type === "Feature" ? feature.geometry : feature;
    if (!geometry || !Object.hasOwn(GEOMETRY_LABELS, geometry.type))
      throw new Error("目前支援 Point、LineString 及 Polygon");
    let count = 0;
    const position = (value) => {
      if (
        !Array.isArray(value) ||
        ![2, 3].includes(value.length) ||
        !value.every(Number.isFinite) ||
        Math.abs(value[0]) > 180 ||
        Math.abs(value[1]) > 90
      )
        throw new Error("標註座標必須是 WGS84 [經度, 緯度]");
      if (++count > 2000 || ++total > 10000)
        throw new Error("每筆最多 2000 個座標，每次匯入最多 10000 個座標");
      return value.slice(0, 2);
    };
    const line = (values, min) => {
      if (!Array.isArray(values) || values.length < min || values.length > 2000)
        throw new Error(`此標註需要 ${min} 至 2000 個座標`);
      const points = values.map(position);
      if (new Set(points.map((p) => p.join(","))).size < (min === 4 ? 3 : 2))
        throw new Error("請使用不同位置繪製標註");
      return points;
    };
    let coordinates;
    if (geometry.type === "Point") coordinates = position(geometry.coordinates);
    if (geometry.type === "LineString")
      coordinates = line(geometry.coordinates, 2);
    if (geometry.type === "Polygon") {
      if (
        !Array.isArray(geometry.coordinates) ||
        !geometry.coordinates.length ||
        geometry.coordinates.length > 100
      )
        throw new Error("面標註需要封閉的外框");
      coordinates = geometry.coordinates.map((values) => {
        const points = line(values, 4),
          first = points[0],
          last = points.at(-1);
        if (first[0] !== last[0] || first[1] !== last[1])
          throw new Error("面標註的起點與終點必須相同");
        const area = points
          .slice(1)
          .reduce(
            (sum, p, i) =>
              sum +
              (points[i][0] - first[0]) * (p[1] - first[1]) -
              (p[0] - first[0]) * (points[i][1] - first[1]),
            0,
          );
        if (Math.abs(area) < Number.EPSILON)
          throw new Error("面標註必須包圍有效範圍");
        return points;
      });
    }
    const properties = feature.type === "Feature" ? feature.properties : {};
    const name =
      properties?.name ??
      properties?.title ??
      `${GEOMETRY_LABELS[geometry.type]}標註`;
    const description = properties?.description ?? "";
    if (typeof name !== "string" || !name.trim() || name.length > 160)
      throw new Error("標註名稱需為 1 至 160 字");
    if (typeof description !== "string" || description.length > 5000)
      throw new Error("標註說明最多 5000 字");
    return {
      name: name.trim(),
      description: description.trim(),
      geometry: { type: geometry.type, coordinates },
    };
  });
}

export function featureCollection(features) {
  return {
    type: "FeatureCollection",
    features: features.map(({ name, description, geometry }) => ({
      type: "Feature",
      properties: { name, description },
      geometry,
    })),
  };
}
