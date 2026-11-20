import { ref } from "vue";
import L from "leaflet";
import { EXTERNAL_LAYERS } from "../config/externalLayers";
import { createBaseLayers, changeBaseLayer } from "../lib/mapControls";

export function useMapLayers() {
  const baseMap = ref("satellite");
  const externalLayers = ref(
    EXTERNAL_LAYERS.map((definition) => ({
      ...definition,
      enabled: false,
      loading: false,
      error: "",
      opacity: definition.opacity ?? 0.65,
    })),
  );
  let map, basemaps;
  const overlays = new Map(),
    timers = new Map();
  function clearTimer(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
  function beginLoading(state) {
    clearTimer(state.id);
    state.loading = true;
    state.error = "";
    timers.set(
      state.id,
      setTimeout(() => {
        if (state.enabled && state.loading) {
          state.loading = false;
          state.error = `${state.name}載入逾時，可重試或關閉此圖層。`;
        }
      }, 15000),
    );
  }
  function attach(instance) {
    map = instance;
    basemaps = createBaseLayers(map);
    baseMap.value = "satellite";
    const pane = map.createPane("external-data");
    pane.style.zIndex = "300";
    pane.style.pointerEvents = "none";
  }
  function setBaseMap(kind) {
    if (!basemaps?.[kind]) return;
    changeBaseLayer(map, basemaps, kind);
    baseMap.value = kind;
  }
  function makeLayer(state) {
    const { params = {}, url, type } = state;
    const options = {
      ...params,
      pane: "external-data",
      opacity: state.opacity,
      attribution: state.attribution,
      maxZoom: 19,
      crossOrigin: false,
    };
    if (type === "wms")
      options.crs =
        params.crs === "EPSG:4326" ? L.CRS.EPSG4326 : L.CRS.EPSG3857;
    const layer =
      type === "wms"
        ? L.tileLayer.wms(url, options)
        : L.tileLayer(url, options);
    let failed = false;
    layer.on("loading", () => {
      if (!state.enabled) return;
      failed = false;
      beginLoading(state);
    });
    layer.on("tileerror", () => {
      if (state.enabled) {
        failed = true;
        state.error = `${state.name}部分圖資無法載入，可重試或關閉此圖層。`;
      }
    });
    layer.on("load", () => {
      if (state.enabled) {
        state.loading = false;
        if (!failed) state.error = "";
      }
      clearTimer(state.id);
    });
    return layer;
  }
  function toggleExternalLayer(id, enabled) {
    const state = externalLayers.value.find((item) => item.id === id);
    if (!state || !map) return;
    state.enabled = !!enabled;
    state.error = "";
    clearTimer(id);
    let layer = overlays.get(id);
    if (state.enabled) {
      if (!layer) {
        layer = makeLayer(state);
        overlays.set(id, layer);
      }
      beginLoading(state);
      layer.addTo(map);
    } else {
      state.loading = false;
      layer?.remove();
    }
  }
  function setExternalOpacity(id, value) {
    const state = externalLayers.value.find((item) => item.id === id),
      opacity = Number(value);
    if (!state || !Number.isFinite(opacity)) return;
    state.opacity = Math.min(1, Math.max(0, opacity));
    overlays.get(id)?.setOpacity(state.opacity);
  }
  function retryExternalLayer(id) {
    const state = externalLayers.value.find((item) => item.id === id),
      layer = overlays.get(id);
    if (!state?.enabled || !layer) return;
    beginLoading(state);
    layer.redraw();
  }
  function detach() {
    for (const id of timers.keys()) clearTimer(id);
    for (const layer of overlays.values()) {
      layer.off();
      layer.remove();
    }
    overlays.clear();
    for (const state of externalLayers.value) {
      state.enabled = false;
      state.loading = false;
      state.error = "";
    }
    map = null;
    basemaps = null;
  }
  return {
    baseMap,
    externalLayers,
    attach,
    detach,
    setBaseMap,
    toggleExternalLayer,
    setExternalOpacity,
    retryExternalLayer,
  };
}
