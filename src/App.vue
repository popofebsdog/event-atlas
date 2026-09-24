<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick,
} from "vue";
import L from "leaflet";
import proj4 from "proj4";
import { api, all } from "./api";
import Challenge from "./Challenge.vue";

const projects = ref([]),
  events = ref([]),
  selectedId = ref("");
const busy = ref(false),
  loading = ref(true),
  error = ref(""),
  notice = ref(""),
  synced = ref("");
const dialog = ref(null),
  readerDialog = ref(null),
  formKind = ref(""),
  challengeKey = ref(0),
  token = ref("");
const name = ref(""),
  lat = ref(""),
  lng = ref(""),
  crs = ref("wgs84"),
  east = ref(""),
  north = ref("");
const title = ref(""),
  description = ref(""),
  date = ref(""),
  url = ref(""),
  activeEvent = ref(null);
const embedLoading = ref(false);
const editingId = ref(''), adminKey = ref(''), deleteTarget = ref(null), deleteDialog = ref(null), deleteError = ref('');
const exportDialog = ref(null), exportError = ref('');
const coordinatePreview = ref(null), previewMapEl = ref(null);
let previewMap;
let map,
  markers,
  draftMarker,
  timer,
  fetching = false,
  generation = 0;
const selected = computed(() =>
  projects.value.find((p) => p.id === selectedId.value),
);
const dateFormat = (value) =>
  new Date(value).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const canSubmit = computed(
  () =>
    !busy.value && !!adminKey.value.trim() && (editingId.value || !import.meta.env.VITE_TURNSTILE_SITE_KEY || token.value),
);
const markerIcon = (active) =>
  L.divIcon({
    className: "",
    html: `<span class="map-pin ${active ? "active" : ""}"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

function paint() {
  if (!markers) return;
  markers.clearLayers();
  for (const p of projects.value) {
    const label = document.createElement("span");
    label.textContent = p.name;
    L.marker([p.lat, p.lng], {
      icon: markerIcon(p.id === selectedId.value),
      title: p.name,
    })
      .addTo(markers)
      .bindTooltip(label)
      .on("click", () => choose(p));
  }
}
async function loadEvents(id) {
  const version = ++generation;
  const data = await all(`/projects/${id}/events`);
  if (version === generation && id === selectedId.value) events.value = data;
}
async function refresh() {
  if (fetching) return;
  fetching = true;
  try {
    projects.value = await all("/projects");
    if (selectedId.value && !selected.value) {
      selectedId.value = "";
      events.value = [];
      activeEvent.value = null;
      generation++;
    }
    if (selectedId.value) await loadEvents(selectedId.value);
    synced.value = new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    });
    error.value = "";
  } catch (e) {
    error.value = `無法同步：${e.message}。請確認後端已啟動。`;
  } finally {
    loading.value = false;
    fetching = false;
  }
}
async function choose(p) {
  selectedId.value = p.id;
  events.value = [];
  activeEvent.value = null;
  map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 12), { duration: 0.5 });
  try {
    await loadEvents(p.id);
  } catch (e) {
    error.value = e.message;
  }
}
function openForm(kind) {
  editingId.value = '';
  formKind.value = kind;
  token.value = "";
  challengeKey.value++;
  notice.value = "";
  if (kind === "project") {
    name.value = "";
    crs.value = "wgs84";
  } else {
    title.value = "";
    description.value = "";
    url.value = "";
    date.value = "";
  }
  dialog.value.showModal();
  nextTick(() => dialog.value.querySelector("input")?.focus());
}
function editRecord(kind, record) {
  openForm(kind);
  editingId.value = record.id;
  if (kind === 'project') {
    name.value = record.name; lat.value = record.lat; lng.value = record.lng;
  } else {
    title.value = record.title; description.value = record.description; url.value = record.url;
    date.value = new Date(Date.parse(record.occurred_at) + 8 * 3600000).toISOString().slice(0,16);
  }
}
function askDelete(kind, record) {
  deleteTarget.value = {kind, id:record.id, name:record.name || record.title};
  deleteError.value = '';
  deleteDialog.value.showModal();
}
async function removeRecord() {
  busy.value = true; deleteError.value = '';
  const target = deleteTarget.value;
  try {
    await api(`/${target.kind}/${target.id}`, {method:'DELETE', headers:{Authorization:`Bearer ${adminKey.value}`}});
    generation++;
    if (target.kind === 'projects') {
      projects.value = projects.value.filter(p => p.id !== target.id);
      if (selectedId.value === target.id) { selectedId.value = ''; events.value = []; activeEvent.value = null; }
    } else {
      events.value = events.value.filter(e => e.id !== target.id);
      if (activeEvent.value?.id === target.id) activeEvent.value = null;
    }
    deleteDialog.value.close();
  } catch(e) { deleteError.value = e.message; }
  finally { busy.value = false; }
}
function pick(position) {
  lat.value = position.lat.toFixed(6);
  lng.value = position.lng.toFixed(6);
  if (draftMarker) draftMarker.remove();
  draftMarker = L.marker(position, { icon: markerIcon(true) }).addTo(map);
  openForm("project");
}
function closeForm() {
  if (!busy.value) dialog.value.close();
}
function cleanForm() {
  previewMap?.remove();
  previewMap = null;
  coordinatePreview.value = null;
  formKind.value = "";
  if (draftMarker) {
    draftMarker.remove();
    draftMarker = null;
  }
}
function coordinates() {
  let y = Number(lat.value),
    x = Number(lng.value);
  if (crs.value === "twd97") {
    if (!east.value || !north.value) throw new Error("請填寫 TWD97 X、Y 座標");
    [x, y] = proj4(
      "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs",
      "EPSG:4326",
      [Number(east.value), Number(north.value)],
    );
  } else if (lat.value === "" || lng.value === "")
    throw new Error("請填寫經緯度");
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    Math.abs(x) > 180 ||
    Math.abs(y) > 90
  )
    throw new Error("座標無效");
  return { lat: y, lng: x };
}
async function locateCoordinates() {
  notice.value = "";
  try {
    const point = coordinates();
    coordinatePreview.value = point;
    await nextTick();
    previewMap?.remove();
    previewMap = L.map(previewMapEl.value, { scrollWheelZoom: false }).setView([point.lat, point.lng], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(previewMap);
    L.marker([point.lat, point.lng], { icon: markerIcon(true) }).addTo(previewMap);
    map.setView([point.lat, point.lng], 15);
  } catch (e) { notice.value = e.message; }
}
watch([lat, lng, east, north, crs], () => {
  previewMap?.remove();
  previewMap = null;
  coordinatePreview.value = null;
});
async function save() {
  busy.value = true;
  notice.value = "";
  try {
    if (formKind.value === "project") {
      const p = await api(editingId.value ? `/projects/${editingId.value}` : "/projects", {
        method: editingId.value ? "PUT" : "POST",
        headers: {Authorization:`Bearer ${adminKey.value}`},
        body: JSON.stringify({
          name: name.value,
          ...coordinates(),
          token: token.value,
        }),
      });
      if (editingId.value) projects.value = projects.value.map(item => item.id === p.id ? p : item);
      else projects.value.push(p);
      await choose(p);
    } else {
      // datetime-local is explicitly Taiwan time, independent of the visitor's time zone.
      const occurred_at = new Date(`${date.value}:00+08:00`).toISOString();
      const saved = await api(editingId.value ? `/events/${editingId.value}` : `/projects/${selectedId.value}/events`, {
        method: editingId.value ? "PUT" : "POST",
        headers: {Authorization:`Bearer ${adminKey.value}`},
        body: JSON.stringify({
          title: title.value,
          description: description.value,
          occurred_at,
          url: url.value,
          token: token.value,
        }),
      });
      generation++;
      events.value = [...events.value.filter(e => e.id !== saved.id), saved].sort((a, b) =>
        b.occurred_at.localeCompare(a.occurred_at),
      );
    }
    dialog.value.close();
    error.value = "";
  } catch (e) {
    notice.value = e.message;
    token.value = "";
    challengeKey.value++;
  } finally {
    busy.value = false;
  }
}
function view(event) {
  embedLoading.value = true;
  activeEvent.value = event;
}
watch(activeEvent, async (value) => {
  if (value) {
    await nextTick();
    readerDialog.value?.showModal();
  }
});
function askExport() {
  exportError.value = '';
  exportDialog.value.showModal();
}
async function downloadData() {
  if (busy.value || !adminKey.value.trim() || !selected.value) return;
  busy.value = true;
  exportError.value = '';
  const projectId = selectedId.value;
  const snapshot = JSON.stringify({ version: 1, project: selected.value, events: events.value }, null, 2);
  try {
    await api('/admin/verify', { method: 'POST', headers: {Authorization: `Bearer ${adminKey.value}`} });
    const blob = new Blob([snapshot], { type: 'application/json' });
    const href = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = href;
    a.download = `event-atlas-${projectId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    exportDialog.value.close();
  } catch (e) {
    exportError.value = e.message;
  } finally {
    busy.value = false;
  }
}
watch([projects, selectedId], paint, { deep: true });
onMounted(() => {
  map = L.map("map", { zoomControl: false }).setView([23.85, 121], 7);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  markers = L.layerGroup().addTo(map);
  map.on("click", (e) => pick(e.latlng));
  refresh();
  timer = setInterval(() => {
    if (!document.hidden && !busy.value && !formKind.value && !deleteTarget.value) refresh();
  }, 15000);
});
onBeforeUnmount(() => {
  previewMap?.remove();
  clearInterval(timer);
  map?.remove();
  generation++;
});
</script>

<template>
  <header class="topbar">
    <a class="brand" href="./">GeoPORT調查報告紀事</a>
    <div class="sync">
      <span :class="['status-dot', { offline: error }]"></span
      >{{ loading ? "連線中" : error ? "同步中斷" : `已同步 ${synced}`
      }}<button class="icon-button" @click="refresh" aria-label="重新同步">
        ↻
      </button>
    </div>
  </header>
  <div v-if="error" role="alert" class="banner">{{ error }}</div>
  <main class="workspace">
    <aside class="places">
      <div class="section-heading">
        <div>
          <h1>地區專案</h1>
        </div>
        <span class="count">{{ projects.length }}</span>
      </div>
      <button
        class="primary wide"
        @click="
          lat = '';
          lng = '';
          openForm('project');
        "
      >
        ＋ 座標建立地區
      </button>
      <nav aria-label="地區專案" class="place-list">
        <button
          v-for="p in projects"
          :key="p.id"
          :class="['place', { chosen: selectedId === p.id }]"
          @click="choose(p)"
        >
          <span class="place-dot">●</span
          ><span
            ><strong>{{ p.name }}</strong
            ><small
              >{{ p.lat.toFixed(4) }} N · {{ p.lng.toFixed(4) }} E</small
            ></span
          ><span class="arrow">↗</span>
        </button>
        <p v-if="!loading && !projects.length" class="empty-small">尚無地區</p>
      </nav>
    </aside>
    <section class="map-panel" aria-label="地圖選點">
      <div id="map"></div>
      <div class="map-label">
        <span>＋ 點擊地圖新增地區</span>
      </div>
      <button class="map-reset" @click="map.setView([23.85, 121], 7)">
        ↖ 臺灣全圖
      </button>
    </section>
    <section class="timeline-panel" aria-label="事件時間軸">
      <template v-if="selected">
        <div class="timeline-head">
          <h2>{{ selected.name }}</h2>
          <p class="coordinates">
            {{ selected.lat.toFixed(6) }}, {{ selected.lng.toFixed(6) }}
          </p>
          <div class="actions">
            <button class="primary" @click="openForm('event')">
              ＋ 新增事件</button
            ><button @click="askExport">匯出紀錄</button>
          </div>
          <div class="record-actions">
            <button @click="editRecord('project', selected)">編輯地區</button>
            <button class="danger-text" @click="askDelete('projects', selected)">刪除地區</button>
          </div>
        </div>
        <div class="timeline-label">
          <span>事件時間軸</span
          ><small>{{ events.length }} 筆 · 新至舊 · 臺灣時間</small>
        </div>
        <ol class="timeline">
          <li v-for="event in events" :key="event.id">
            <button
              class="event-card"
              :class="{ chosen: activeEvent?.id === event.id }"
              @click="view(event)"
            >
              <time>{{ dateFormat(event.occurred_at) }}</time>
              <h3>{{ event.title }}</h3>
              <p v-if="event.description">{{ event.description }}</p>
              <span class="source-link">查看網頁 →</span>
            </button>
            <div class="record-actions">
              <button :aria-label="`編輯事件：${event.title}`" @click="editRecord('event', event)">編輯</button>
              <button class="danger-text" :aria-label="`刪除事件：${event.title}`" @click="askDelete('events', event)">刪除</button>
            </div>
          </li>
        </ol>
        <div v-if="!events.length" class="empty-small">
          尚無事件
        </div>
      </template>
      <div v-else class="welcome">
        <h2>事件</h2>
        <p>選擇地區以查看時間軸</p>
      </div>
    </section>
  </main>
  <dialog
    ref="dialog"
    @close="cleanForm"
    @cancel="busy && $event.preventDefault()"
  >
    <form @submit.prevent="save">
      <div class="dialog-heading">
        <div>
          <h2>
            {{ editingId ? (formKind === 'project' ? '編輯地區' : '編輯事件') : (formKind === "project" ? "建立地區專案" : "新增時間軸事件") }}
          </h2>
        </div>
        <button
          type="button"
          :disabled="busy"
          @click="closeForm"
          aria-label="關閉表單"
        >
          ×
        </button>
      </div>
      <template v-if="formKind === 'project'">
        <label
          >座標系統<select v-model="crs">
            <option value="wgs84">WGS84 經緯度</option>
            <option value="twd97">TWD97 / TM2 121（EPSG:3826）</option>
          </select></label
        >
        <div v-if="crs === 'wgs84'" class="field-row">
          <label
            >緯度 Latitude<input
              v-model="lat"
              required
              type="number"
              step="any"
              min="-90"
              max="90"
              placeholder="24.165" /></label
          ><label
            >經度 Longitude<input
              v-model="lng"
              required
              type="number"
              step="any"
              min="-180"
              max="180"
              placeholder="121.565"
          /></label>
        </div>
        <div v-else class="field-row">
          <label
            >X 東向（公尺）<input
              v-model="east"
              required
              type="number"
              step="any" /></label
          ><label
            >Y 北向（公尺）<input
              v-model="north"
              required
              type="number"
              step="any"
          /></label>
        </div>
        <button type="button" class="wide" @click="locateCoordinates">定位座標</button>
        <div v-if="coordinatePreview" class="coordinate-preview">
          <div ref="previewMapEl" class="coordinate-map" aria-label="座標定位預覽"></div>
          <p class="hint">{{ coordinatePreview.lat.toFixed(6) }}, {{ coordinatePreview.lng.toFixed(6) }}</p>
        </div>
        <label class="project-name-field">地區名稱<input v-model="name" required maxlength="100" placeholder="例如：太魯閣・燕子口" /></label>
      </template>
      <template v-else>
        <p class="hint">紀錄地點：{{ selected?.name }}</p>
        <label
          >事件時間（臺灣 UTC+8）<input
            v-model="date"
            type="datetime-local"
            required
        /></label>
        <label
          >事件名稱<input
            v-model="title"
            required
            maxlength="160"
            placeholder="這個時間，發生了什麼？"
        /></label>
        <label
          >事件敘述<textarea
            v-model="description"
            maxlength="5000"
            rows="4"
            placeholder="補充事件的經過與背景"
          ></textarea>
        </label>
        <label
          >介紹網頁／網誌網址<input
            v-model="url"
            type="url"
            required
            maxlength="2048"
            pattern="https://.*"
            placeholder="https://..."
        /></label>
      </template>
      <label>管理員金鑰<input v-model="adminKey" type="password" required autocomplete="off" placeholder="輸入管理員金鑰" /></label>
      <Challenge v-if="formKind && !editingId" :key="challengeKey" @token="token = $event" />
      <p v-if="notice" role="alert" class="error">{{ notice }}</p>
      <p class="hint">送出後立即公開。請勿填入私人住址或聯絡資料。</p>
      <div class="form-footer">
        <button type="button" :disabled="busy" @click="closeForm">取消</button
        ><button class="primary" :disabled="!canSubmit">
          {{ busy ? "儲存中…" : editingId ? "儲存修改" : "儲存並公開" }}
        </button>
      </div>
    </form>
  </dialog>
  <dialog ref="exportDialog" @cancel="busy && $event.preventDefault()" aria-labelledby="export-heading">
    <form @submit.prevent="downloadData">
      <h2 id="export-heading">匯出紀錄</h2>
      <label>管理員金鑰<input v-model="adminKey" type="password" required autocomplete="off" placeholder="輸入管理員金鑰" /></label>
      <p v-if="exportError" class="error" role="alert">{{ exportError }}</p>
      <div class="form-footer"><button type="button" :disabled="busy" @click="exportDialog.close()">取消</button><button class="primary" :disabled="busy || !adminKey.trim()">{{ busy ? '驗證中…' : '驗證並匯出' }}</button></div>
    </form>
  </dialog>
  <dialog ref="deleteDialog" @close="deleteTarget = null" @cancel="busy && $event.preventDefault()" aria-labelledby="delete-heading">
    <form v-if="deleteTarget" @submit.prevent="removeRecord">
      <h2 id="delete-heading">{{ deleteTarget.kind === 'projects' ? '刪除地區' : '刪除事件' }}</h2>
      <p class="hint">確定刪除「{{ deleteTarget.name }}」？{{ deleteTarget.kind === 'projects' ? '此地區的所有事件也會一起刪除。' : '' }}此操作無法復原。</p>
      <label>管理員金鑰<input v-model="adminKey" type="password" required autocomplete="off" /></label>
      <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
      <div class="form-footer"><button type="button" :disabled="busy" @click="deleteDialog.close()">取消</button><button class="danger-button" :disabled="busy || !adminKey">{{ busy ? '刪除中…' : '確認刪除' }}</button></div>
    </form>
  </dialog>
  <dialog
    v-if="activeEvent"
    ref="readerDialog"
    class="reader-dialog"
    @close="activeEvent = null"
    aria-label="事件網頁閱讀區"
  >
    <section class="reader">
      <header>
        <div>
          <time>{{ dateFormat(activeEvent.occurred_at) }}</time>
          <h2>{{ activeEvent.title }}</h2>
        </div>
        <button @click="activeEvent = null" aria-label="關閉事件網頁">×</button>
      </header>
      <p class="reader-description">{{ activeEvent.description }}</p>
      <p v-if="embedLoading" role="status" class="hint">
        正在載入事件網頁…
      </p>
      <iframe
        :key="activeEvent.id"
        :src="activeEvent.url"
        :title="activeEvent.title"
        sandbox="allow-scripts allow-same-origin"
        referrerpolicy="no-referrer"
        @load="embedLoading = false"
      ></iframe>
    </section>
  </dialog>
</template>
