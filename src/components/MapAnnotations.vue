<script setup>
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import L from "leaflet";
import { api } from "../services/api";
import {
  readAnnotations,
  featureCollection,
  GEOMETRY_LABELS,
} from "../../shared/annotations";
import Challenge from "./Challenge.vue";

const props = defineProps({
  map: Object,
  projectId: String,
  features: Array,
  adminKey: String,
  visible: { type: Boolean, default: true },
});
const emit = defineEmits([
  "saved",
  "removed",
  "update:adminKey",
  "drawing-change",
  "locate",
  "inspect",
]);
const selectedFeatureId = ref("");
const exportFormat = ref("kml");
const panel = ref(null),
  listOpen = ref(true),
  drawing = ref(""),
  vertices = ref([]),
  dialog = ref(null),
  actionDialog = ref(null);
const pending = ref([]),
  failure = ref(""),
  busy = ref(false),
  token = ref(""),
  challengeKey = ref(0),
  action = ref(""),
  target = ref(null),
  modalOpen = ref(false);
const enoughPoints = computed(
  () => vertices.value.length >= (drawing.value === "Polygon" ? 3 : 2),
);
const canSave = computed(
  () =>
    !busy.value &&
    props.adminKey?.trim() &&
    (!import.meta.env.VITE_TURNSTILE_SITE_KEY || token.value),
);
let layer,
  draft,
  doubleClickEnabled = false,
  fileVersion = 0,
  disposed = false;
function syncInteraction() {
  emit("drawing-change", !!drawing.value || modalOpen.value);
}
function render() {
  layer?.eachLayer((item) => item.unbindTooltip());
  layer?.remove();
  const items = props.visible ? props.features || [] : [],
    collection = featureCollection(items);
  collection.features.forEach(
    (feature, index) => (feature.id = items[index].id),
  );
  layer = L.geoJSON(collection, {
    interactive: !drawing.value,
    bubblingMouseEvents: false,
    style: (feature) => ({
      color: "#245fa8",
      weight: feature.id === selectedFeatureId.value ? 7 : 5,
      fillColor: "#367acb",
      fillOpacity: 0.24,
      className: `annotation-layer annotation-${feature.geometry.type}`,
    }),
    pointToLayer: (feature, point) =>
      L.marker(point, {
        interactive: !drawing.value,
        title: `標註：${feature.properties.name}`,
        icon: L.divIcon({
          className: "annotation-marker annotation-layer",
          html: `<span class="annotation-point-symbol${feature.id === selectedFeatureId.value ? " selected" : ""}"></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }),
    onEachFeature(feature, item) {
      const label = document.createElement("button");
      label.type = "button";
      label.className = "map-label-link";
      label.textContent = `${GEOMETRY_LABELS[feature.geometry.type]} · ${feature.properties.name}`;
      label.disabled = !!drawing.value;
      label.setAttribute("aria-label", `查看標註：${feature.properties.name}`);
      L.DomEvent.disableClickPropagation(label);
      const inspect = () => {
        if (!drawing.value)
          inspectFeature(items.find((item) => item.id === feature.id));
      };
      label.addEventListener("click", inspect);
      item.on("click", inspect);
      const area = feature.geometry.type === "Polygon";
      item.bindTooltip(label, {
        permanent: true,
        interactive: !drawing.value,
        direction: area ? "bottom" : "top",
        offset: [0, area ? 16 : -16],
        className: "map-name-label annotation-name-label",
        opacity: 1,
      });
    },
  }).addTo(props.map);
}
async function inspectFeature(feature) {
  if (!feature) return;
  selectedFeatureId.value = feature.id;
  listOpen.value = true;
  emit("inspect", feature);
  render();
  await nextTick();
  const card = panel.value?.querySelector(`[data-feature-id="${feature.id}"]`);
  card?.scrollIntoView({ block: "nearest" });
  card?.focus({ preventScroll: true });
}
function coordinateSummary(feature) {
  const { type, coordinates } = feature.geometry,
    format = ([lng, lat]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (type === "Point") return format(coordinates);
  if (type === "LineString")
    return `${coordinates.length} 個節點\n起點 ${format(coordinates[0])}\n終點 ${format(coordinates.at(-1))}`;
  const points = coordinates.flat(),
    bounds = L.latLngBounds(points.map(([lng, lat]) => [lat, lng]));
  return `${points.length - coordinates.length} 個頂點${coordinates.length > 1 ? ` · ${coordinates.length - 1} 個內環` : ""}\n範圍 ${format([bounds.getWest(), bounds.getSouth()])}\n至 ${format([bounds.getEast(), bounds.getNorth()])}`;
}
function renderDraft() {
  draft?.remove();
  draft = L.layerGroup().addTo(props.map);
  const points = vertices.value.map(([lng, lat]) => [lat, lng]);
  if (points.length > 1)
    (drawing.value === "Polygon" && points.length > 2
      ? L.polygon(points, { color: "#cf8e36", dashArray: "6 4" })
      : L.polyline(points, { color: "#cf8e36", dashArray: "6 4" })
    ).addTo(draft);
  for (const point of points)
    L.circleMarker(point, {
      radius: 5,
      color: "#cf8e36",
      fillOpacity: 1,
      interactive: false,
    }).addTo(draft);
}
function clearDrawing() {
  drawing.value = "";
  vertices.value = [];
  draft?.remove();
  draft = null;
  if (doubleClickEnabled) props.map.doubleClickZoom.enable();
  syncInteraction();
  render();
}
function start(type) {
  clearDrawing();
  failure.value = "";
  drawing.value = type;
  doubleClickEnabled = props.map.doubleClickZoom.enabled();
  props.map.doubleClickZoom.disable();
  syncInteraction();
  render();
}
function mapClick(event) {
  if (!drawing.value || modalOpen.value) return;
  if (vertices.value.length >= 1999) {
    failure.value = "已達繪製上限，請完成或取消";
    return;
  }
  vertices.value.push([
    Number(event.latlng.lng.toFixed(6)),
    Number(event.latlng.lat.toFixed(6)),
  ]);
  renderDraft();
  if (drawing.value === "Point") finish();
}
function openEditor(items) {
  pending.value = items;
  failure.value = "";
  token.value = "";
  challengeKey.value++;
  modalOpen.value = true;
  syncInteraction();
  dialog.value.showModal();
}
function finish() {
  try {
    let coordinates = vertices.value.map((p) => [...p]);
    if (drawing.value === "Point") coordinates = coordinates[0];
    if (drawing.value === "Polygon")
      coordinates = [[...coordinates, coordinates[0]]];
    openEditor(readAnnotations({ type: drawing.value, coordinates }));
  } catch (e) {
    failure.value = e.message;
  }
}
async function importFile(event) {
  failure.value = "";
  const version = ++fileVersion,
    projectId = props.projectId;
  try {
    const file = event.target.files[0];
    if (!file) return;
    const extension = file.name.split(".").at(-1).toLowerCase();
    if (!["kml", "kmz"].includes(extension))
      throw new Error("請選擇 KML 或 KMZ 檔案");
    const { readKml, readKmz, LIMITS } = await import("../../shared/kml");
    if (disposed || version !== fileVersion || props.projectId !== projectId)
      return;
    if (file.size > (extension === "kml" ? LIMITS.kmlBytes : LIMITS.kmzBytes))
      throw new Error(
        extension === "kml" ? "KML 檔案需在 2 MB 內" : "KMZ 檔案需在 5 MB 內",
      );
    const contents =
      extension === "kmz" ? await file.arrayBuffer() : await file.text();
    if (disposed || version !== fileVersion || props.projectId !== projectId)
      return;
    openEditor(extension === "kmz" ? readKmz(contents) : readKml(contents));
  } catch (e) {
    if (!disposed && version === fileVersion) failure.value = e.message;
  } finally {
    event.target.value = "";
  }
}
async function save() {
  if (!canSave.value) return;
  busy.value = true;
  failure.value = "";
  const projectId = props.projectId;
  try {
    const result = await api(`/projects/${props.projectId}/features`, {
      method: "POST",
      headers: { Authorization: `Bearer ${props.adminKey}` },
      body: JSON.stringify({
        geojson: featureCollection(pending.value),
        token: token.value,
      }),
    });
    if (disposed || props.projectId !== projectId) return;
    emit("saved", result.items);
    listOpen.value = true;
    dialog.value?.close();
  } catch (e) {
    failure.value = e.message;
    token.value = "";
    challengeKey.value++;
  } finally {
    busy.value = false;
  }
}
function locate(feature) {
  emit("locate", feature);
}
function askAction(kind, feature) {
  action.value = kind;
  target.value = feature;
  exportFormat.value = "kml";
  failure.value = "";
  modalOpen.value = true;
  syncInteraction();
  actionDialog.value.showModal();
}
async function confirmAction() {
  if (busy.value || !props.adminKey?.trim()) return;
  busy.value = true;
  failure.value = "";
  const projectId = props.projectId,
    snapshot = props.features.map((feature) => ({ ...feature }));
  try {
    const headers = { Authorization: `Bearer ${props.adminKey}` };
    if (action.value === "delete") {
      const id = target.value.id;
      await api(`/features/${id}`, { method: "DELETE", headers });
      if (disposed || props.projectId !== projectId) return;
      emit("removed", { id, projectId });
    } else {
      await api("/admin/verify", { method: "POST", headers });
      if (disposed || props.projectId !== projectId) return;
      const { writeKml, writeKmz } = await import("../../shared/kml");
      if (disposed || props.projectId !== projectId) return;
      const kmz = exportFormat.value === "kmz",
        contents = kmz ? writeKmz(snapshot) : writeKml(snapshot);
      const href = URL.createObjectURL(
          new Blob([contents], {
            type: kmz
              ? "application/vnd.google-earth.kmz"
              : "application/vnd.google-earth.kml+xml;charset=utf-8",
          }),
        ),
        link = document.createElement("a");
      link.href = href;
      link.download = `project-${projectId}.${kmz ? "kmz" : "kml"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
    actionDialog.value?.close();
  } catch (e) {
    failure.value = e.message;
  } finally {
    busy.value = false;
  }
}
function closed() {
  modalOpen.value = false;
  pending.value = [];
  failure.value = "";
  clearDrawing();
}
function escape(event) {
  if (event.key === "Escape" && drawing.value && !modalOpen.value)
    clearDrawing();
}
watch(
  [() => props.features, () => props.visible],
  () => {
    if (
      !props.features.some((feature) => feature.id === selectedFeatureId.value)
    )
      selectedFeatureId.value = "";
    render();
  },
  { deep: true },
);
watch(
  () => props.projectId,
  () => {
    dialog.value?.close();
    actionDialog.value?.close();
    closed();
    listOpen.value = false;
  },
);
onMounted(() => {
  L.DomEvent.disableClickPropagation(panel.value);
  L.DomEvent.disableScrollPropagation(panel.value);
  props.map.on("click", mapClick);
  document.addEventListener("keydown", escape);
  render();
});
onBeforeUnmount(() => {
  disposed = true;
  fileVersion++;
  props.map.off("click", mapClick);
  document.removeEventListener("keydown", escape);
  layer?.remove();
  draft?.remove();
  if (doubleClickEnabled) props.map.doubleClickZoom.enable();
  emit("drawing-change", false);
});
</script>

<template>
  <section ref="panel" class="annotations-control" aria-label="專案地圖標註">
    <details :open="listOpen" @toggle="listOpen = $event.target.open">
      <summary>地圖標註 · {{ features.length }}</summary>
      <div class="annotation-tools">
        <button
          v-for="(label, type) in GEOMETRY_LABELS"
          :key="type"
          :aria-pressed="drawing === type"
          @click="start(type)"
        >
          {{ type === "Point" ? "標點" : "畫" + label }}
        </button>
        <label class="button import-geometry"
          >匯入 KML／KMZ<input
            aria-label="匯入 KML 或 KMZ"
            type="file"
            accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
            @change="importFile"
            :disabled="!!drawing || busy"
        /></label>
      </div>
      <p v-if="!drawing" class="annotation-hint">
        點線面是參考圖層，不屬於事件時間軸。KML 2 MB、KMZ 5 MB
        內；匯入名稱與說明，高程與樣式不保留。
      </p>
      <ul v-if="features.length" class="annotation-list">
        <li v-for="feature in features" :key="feature.id">
          <article
            :data-feature-id="feature.id"
            class="annotation-card"
            :class="{ chosen: selectedFeatureId === feature.id }"
            :aria-label="`標註資訊：${feature.name}`"
            tabindex="-1"
          >
            <span class="annotation-kind"
              ><i
                :class="'annotation-kind-' + feature.geometry.type"
                aria-hidden="true"
              ></i
              >地圖標註 · {{ GEOMETRY_LABELS[feature.geometry.type] }}</span
            >
            <h3>{{ feature.name }}</h3>
            <p>{{ feature.description || "尚未填寫說明" }}</p>
            <small class="annotation-coordinates">{{
              coordinateSummary(feature)
            }}</small>
            <div class="annotation-card-actions">
              <button
                :aria-label="`定位標註：${feature.name}`"
                @click="
                  selectedFeatureId = feature.id;
                  render();
                  locate(feature);
                "
              >
                地圖定位</button
              ><button
                class="danger-text"
                :aria-label="`刪除標註：${feature.name}`"
                @click="askAction('delete', feature)"
              >
                刪除
              </button>
            </div>
          </article>
        </li>
      </ul>
      <p v-else class="annotation-hint">尚無標註，選擇工具開始繪製。</p>
      <button
        v-if="features.length"
        class="annotation-export"
        @click="askAction('export')"
      >
        匯出 KML／KMZ
      </button>
    </details>
    <p v-if="failure && !modalOpen" class="error" role="alert">{{ failure }}</p>
  </section>
  <Teleport to="#map-drawing-controls">
    <div
      v-if="drawing"
      class="drawing-progress"
      role="status"
      @click.stop
      @dblclick.stop
      @mousedown.stop
      @pointerdown.stop
    >
      <p>
        {{
          drawing === "Point"
            ? "在地圖上選擇標註位置"
            : `在地圖依序選點，已選 ${vertices.length} 點`
        }}
      </p>
      <div class="annotation-tools">
        <button
          v-if="drawing !== 'Point'"
          :disabled="!enoughPoints"
          @click="finish"
        >
          完成繪製</button
        ><button
          :disabled="!vertices.length"
          @click="
            vertices.pop();
            renderDraft();
          "
        >
          復原一點</button
        ><button @click="clearDrawing">取消繪製</button>
      </div>
    </div>
  </Teleport>
  <Teleport to="body">
    <dialog
      ref="dialog"
      aria-label="儲存地圖標註"
      @close="closed"
      @cancel="busy && $event.preventDefault()"
    >
      <form @submit.prevent="save">
        <div class="dialog-heading">
          <h2>儲存地圖標註</h2>
          <button
            type="button"
            :disabled="busy"
            aria-label="關閉標註表單"
            @click="dialog.close()"
          >
            ×
          </button>
        </div>
        <p class="hint">將新增 {{ pending.length }} 筆標註</p>
        <template v-if="pending.length === 1"
          ><label
            >標註名稱<input
              v-model="pending[0].name"
              required
              maxlength="160" /></label
          ><label
            >標註說明<textarea
              v-model="pending[0].description"
              maxlength="5000"
              rows="3"
            ></textarea></label
        ></template>
        <ul v-else class="import-summary">
          <li v-for="(item, index) in pending" :key="index">
            {{ GEOMETRY_LABELS[item.geometry.type] }} · {{ item.name }}
          </li>
        </ul>
        <label
          >管理員金鑰<input
            type="password"
            autocomplete="off"
            required
            :value="adminKey"
            @input="emit('update:adminKey', $event.target.value)"
        /></label>
        <Challenge
          v-if="modalOpen && pending.length"
          :key="challengeKey"
          @token="token = $event"
        />
        <p v-if="failure" class="error" role="alert">{{ failure }}</p>
        <div class="form-footer">
          <button type="button" :disabled="busy" @click="dialog.close()">
            取消</button
          ><button class="primary" :disabled="!canSave">
            {{ busy ? "儲存中…" : "儲存標註" }}
          </button>
        </div>
      </form>
    </dialog>
    <dialog
      ref="actionDialog"
      :aria-label="action === 'delete' ? '刪除地圖標註' : '匯出地圖標註'"
      @close="closed"
      @cancel="busy && $event.preventDefault()"
    >
      <form @submit.prevent="confirmAction">
        <h2>{{ action === "delete" ? "刪除地圖標註" : "匯出地圖標註" }}</h2>
        <p class="hint">
          {{
            action === "delete"
              ? `確定刪除「${target?.name}」？此操作無法復原。`
              : `匯出此專案全部 ${features.length} 筆地圖標註。`
          }}
        </p>
        <label v-if="action === 'export'"
          >匯出格式<select v-model="exportFormat">
            <option value="kml">KML · 通用地理標記</option>
            <option value="kmz">KMZ · 壓縮 KML 檔案</option>
          </select></label
        >
        <label
          >管理員金鑰<input
            type="password"
            autocomplete="off"
            required
            :value="adminKey"
            @input="emit('update:adminKey', $event.target.value)"
        /></label>
        <p v-if="failure" class="error" role="alert">{{ failure }}</p>
        <div class="form-footer">
          <button type="button" :disabled="busy" @click="actionDialog.close()">
            取消</button
          ><button
            :class="action === 'delete' ? 'danger-button' : 'primary'"
            :disabled="busy || !adminKey?.trim()"
          >
            {{
              busy ? "處理中…" : action === "delete" ? "確認刪除" : "驗證並匯出"
            }}
          </button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style>
.annotations-control {
  padding: 16px;
  font-size: 14px;
  color: var(--ink);
}
.annotations-control summary {
  cursor: pointer;
  font-weight: 600;
}
.annotations-control details[open] summary {
  margin-bottom: 12px;
}
.annotation-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.annotation-tools .button {
  margin: 0;
}
.annotation-tools button,
.annotation-tools .button {
  padding: 8px 12px;
  font-size: 14px;
}
.annotation-tools button[aria-pressed="true"] {
  background: var(--accent);
  color: white;
}
.annotation-hint,
.drawing-progress {
  color: var(--muted);
  font-size: 14px;
  line-height: 22px;
  margin-top: 12px;
}
.drawing-progress .annotation-tools {
  margin-top: 8px;
}
.drawing-progress {
  position: absolute;
  z-index: 600;
  left: 16px;
  bottom: 32px;
  max-width: calc(100% - 88px);
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
}
.import-geometry {
  position: relative;
  overflow: hidden;
}
.import-geometry input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.import-geometry:focus-within {
  outline: 3px solid #dc9e3b;
  outline-offset: 3px;
}
.annotation-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
}
.annotation-list li {
  margin: 12px 0;
}
.annotation-card {
  padding: 16px;
  border: 1px solid #b9cfea;
  border-radius: 16px;
  background: #f7faff;
  overflow-wrap: anywhere;
}
.annotation-card.chosen {
  border-color: #245fa8;
  box-shadow: 0 0 0 2px #245fa822;
}
.annotation-card h3 {
  margin: 8px 0;
  font-size: 16px;
  line-height: 24px;
}
.annotation-card p {
  font-size: 14px;
  line-height: 24px;
  color: var(--muted);
  white-space: pre-wrap;
}
.annotation-kind {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #245fa8;
  font-size: 12px;
  font-weight: 600;
}
.annotation-kind i {
  display: inline-block;
  width: 12px;
  height: 12px;
  background: #245fa8;
  border-radius: 2px;
}
.annotation-kind .annotation-kind-LineString {
  height: 4px;
  transform: rotate(-30deg);
}
.annotation-kind .annotation-kind-Polygon {
  background: #b2cceb;
  border: 2px solid #245fa8;
}
.annotation-coordinates {
  display: block;
  white-space: pre-line;
  margin-top: 12px;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  line-height: 20px;
  color: var(--muted);
}
.annotation-card-actions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 12px;
}
.annotation-card-actions button {
  font-size: 12px;
  padding: 4px 8px;
  min-height: 44px;
}
.annotation-point-symbol {
  display: block;
  width: 28px;
  height: 28px;
  background: #245fa8;
  border: 3px solid white;
  border-radius: 4px;
  box-shadow: 0 1px 6px #173b6b99;
}
.annotation-point-symbol.selected {
  outline: 3px solid #245fa866;
  outline-offset: 3px;
}
.leaflet-tooltip.annotation-name-label {
  border-color: #9cb9df;
}
.leaflet-tooltip.annotation-name-label .map-label-link {
  color: #245fa8;
}
.annotation-export {
  margin-top: 8px;
  padding: 8px 12px;
  font-size: 14px;
}
.import-summary {
  max-height: 200px;
  overflow: auto;
  font-size: 14px;
}
.map-legend .legend-annotation {
  background: #245fa8;
  border-radius: 2px;
  width: 12px;
  height: 12px;
}
@media (max-width: 540px) {
  .annotations-control {
    padding: 16px;
  }
  .drawing-progress {
    left: 12px;
    bottom: 32px;
    padding: 8px;
  }
}
</style>
