<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  onUnmounted,
  watch,
  nextTick,
  shallowRef,
} from "vue";
import L from "leaflet";
import proj4 from "proj4";
import { api, all, photoUrl } from "./api";
import { linkedMedia, preparePhoto } from './media';
import {EVENT_TYPES} from '../shared/records';
import {filterEvents} from './timeline';
import Challenge from "./Challenge.vue";
import MapAnnotations from './MapAnnotations.vue';
import RegionOverview from './RegionOverview.vue';

const projects = ref([]),
  events = ref([]),
  selectedId = ref(readProjectId());
const features=ref([]), mapRef=shallowRef(null), annotationDrawing=ref(false);
const overviewView=ref(null),sidebarTab=ref('events'),mobileTab=ref('map'),showEvents=ref(true),showAnnotations=ref(true);
function readProjectId(){return window.location.hash.match(/^#\/projects\/([a-zA-Z0-9-]{1,64})$/)?.[1] || '';}
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
  eventProjectId = ref(''), mapMode = ref('browse'),
  lat = ref(""),
  lng = ref(""),
  crs = ref("wgs84"),
  east = ref(""),
  north = ref("");
const title = ref(""),
  category = ref('other'), source = ref(''),
  description = ref(""),
  date = ref(""),
  url = ref(""),
  activeEvent = ref(null);
const embedLoading = ref(false);
const previewVersion = ref(0);
const readerTab = ref('link'), readerWide = ref(false);
const hasReaderLink = computed(()=>activeMedia.value.kind !== 'none');
function reloadPreview() {
  embedLoading.value = true;
  mediaError.value = '';
  previewVersion.value++;
}
const photos = ref([]), photoBusy = ref(false), mediaError = ref('');
let formGeneration=0;
const activeMedia = computed(() => linkedMedia(activeEvent.value?.url));
const photoSource = photo => photo.startsWith('data:') ? photo : photoUrl(photo);
async function selectPhotos(event) {
  const generation=formGeneration;
  photoBusy.value = true;
  notice.value = '';
  try {
    const files = [...event.target.files];
    if (files.length + photos.value.length > 5) throw new Error('每個事件最多 5 張照片');
    const added = [];
    for (const file of files) {
      added.push(await preparePhoto(file));
      if(generation !== formGeneration)return;
    }
    photos.value.push(...added);
  } catch (e) { if(generation === formGeneration)notice.value = e.message; }
  finally { if(generation === formGeneration)photoBusy.value = false; event.target.value = ''; }
}
const editingId = ref(''), adminKey = ref(''), deleteTarget = ref(null), deleteDialog = ref(null), deleteError = ref('');
const exportDialog = ref(null), exportError = ref('');
const filterCategory = ref(''), filterFrom = ref(''), filterTo = ref('');
const visibleEvents = computed(()=>filterEvents(events.value,{category:filterCategory.value,from:filterFrom.value,to:filterTo.value}));
const hasFilters = computed(()=>!!(filterCategory.value || filterFrom.value || filterTo.value));
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
    !busy.value && !photoBusy.value && !!adminKey.value.trim() && (editingId.value || !import.meta.env.VITE_TURNSTILE_SITE_KEY || token.value),
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
  if(!showEvents.value)return;
  for (const event of visibleEvents.value) {
    const lat=event.lat ?? selected.value?.lat,lng=event.lng ?? selected.value?.lng;
    if(typeof lat !== 'number' || typeof lng !== 'number')continue;
    const inherited=event.lat == null;
    const label=document.createElement('span'); label.textContent=event.title + (inherited ? ' · 沿用地區座標' : '');
    L.marker([lat,lng],{interactive:!annotationDrawing.value,icon:L.divIcon({className:'',html:`<span class="event-pin${inherited ? ' inherited' : ''}"></span>`,iconSize:[16,16],iconAnchor:[8,8]}),title:`事件：${event.title}`,zIndexOffset:1000})
      .addTo(markers).bindTooltip(label).on('click',()=>view(event));
  }
}
async function locateEvent(event) {
  mobileTab.value='map';showEvents.value=true;await nextTick();map.invalidateSize();
  map.flyTo([event.lat ?? selected.value.lat,event.lng ?? selected.value.lng],Math.max(map.getZoom(),15));
}
async function locateFeature(feature){
  mobileTab.value='map';showAnnotations.value=true;await nextTick();map.invalidateSize();
  map.fitBounds(L.geoJSON({type:'Feature',geometry:feature.geometry,properties:{}}).getBounds(),{padding:[40,40],maxZoom:16});
}
async function loadEvents(id) {
  const version = ++generation;
  const [data,annotations] = await Promise.all([all(`/projects/${id}/events`),all(`/projects/${id}/features`)]);
  if (version === generation && id === selectedId.value) {events.value=data; features.value=annotations;}
}
async function refresh() {
  if (fetching) return;
  fetching = true;
  try {
    projects.value = await all("/projects");
    if (selectedId.value && !selected.value) {
      events.value = [];
      features.value=[];
      activeEvent.value = null;
      generation++;
      await nextTick();destroyProjectMap();
    }
    if (selected.value) await loadEvents(selectedId.value);
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
async function choose(p,navigate=true) {
  resetTransient();
  selectedId.value = p.id;
  if(navigate)window.location.hash=`/projects/${p.id}`;
  events.value = [];
  features.value=[];
  activeEvent.value = null;
  filterCategory.value='';filterFrom.value='';filterTo.value='';sidebarTab.value='events';mobileTab.value='map';showEvents.value=true;showAnnotations.value=true;mapMode.value='browse';
  await nextTick();setupProjectMap();
  try {
    await loadEvents(p.id);
    if(selectedId.value === p.id)fitProject();
  } catch (e) {
    error.value = e.message;
  }
}
function destroyProjectMap(){mapRef.value=null;map?.remove();map=null;markers=null;}
function resetTransient(){
  dialog.value?.close();deleteDialog.value?.close();exportDialog.value?.close();
  cleanForm();deleteTarget.value=null;notice.value='';
}
async function goOverview(navigate=true){
  resetTransient();
  selectedId.value='';events.value=[];features.value=[];activeEvent.value=null;generation++;
  if(navigate)window.location.hash='/';
  await nextTick();destroyProjectMap();
}
function syncRoute(){
  const id=readProjectId();if(id === selectedId.value)return;
  if(!id){goOverview(false);return;}
  const project=projects.value.find(p=>p.id === id);
  if(project)choose(project,false);
  else {resetTransient();selectedId.value=id;events.value=[];features.value=[];activeEvent.value=null;generation++;nextTick(destroyProjectMap);}
}
function createProject(point){lat.value=point?.lat ?? '';lng.value=point?.lng ?? '';openForm('project');}
function pickEvent(){mapMode.value='event';mobileTab.value='map';sidebarTab.value='events';}
function annotationInteraction(active){annotationDrawing.value=active;if(active){mapMode.value='browse';mobileTab.value='map';showAnnotations.value=true;}}
function fitProject(){
  if(!map || !selected.value)return;
  const bounds=L.latLngBounds([[selected.value.lat,selected.value.lng]]);
  for(const event of events.value)if(typeof event.lat === 'number' && typeof event.lng === 'number')bounds.extend([event.lat,event.lng]);
  if(features.value.length)bounds.extend(L.geoJSON(features.value.map(f=>({type:'Feature',geometry:f.geometry,properties:{}}))).getBounds());
  map.fitBounds(bounds,{padding:[40,40],maxZoom:15,animate:false});
}
function openForm(kind) {
  if(busy.value)return;
  formGeneration++;photoBusy.value=false;
  editingId.value = '';
  formKind.value = kind;
  crs.value = 'wgs84';
  token.value = "";
  challengeKey.value++;
  notice.value = "";
  if (formKind.value === "project") {
    name.value = "";
  } else {
    eventProjectId.value = selectedId.value;
    const place=projects.value.find(p=>p.id === eventProjectId.value);
    lat.value = place?.lat ?? ''; lng.value = place?.lng ?? '';
    title.value = "";
    category.value = 'other'; source.value = '';
    description.value = "";
    url.value = "";
    date.value = "";
    photos.value = [];
  }
  dialog.value.showModal();
  nextTick(() => dialog.value.querySelector("input")?.focus());
}
function editRecord(kind, record) {
  if(busy.value)return;
  openForm(kind);
  editingId.value = record.id;
  if (kind === 'project') {
    name.value = record.name; lat.value = record.lat; lng.value = record.lng;
  } else {
    eventProjectId.value = record.project_id;
    lat.value = record.lat ?? selected.value.lat; lng.value = record.lng ?? selected.value.lng;
    title.value = record.title; description.value = record.description; url.value = record.url;
    category.value=record.category || 'other'; source.value=record.source || '';
    photos.value = [...(record.photos || [])];
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
      if (selectedId.value === target.id) await goOverview();
    } else {
      events.value = events.value.filter(e => e.id !== target.id);
      if (activeEvent.value?.id === target.id) activeEvent.value = null;
    }
    deleteDialog.value.close();
  } catch(e) { deleteError.value = e.message; }
  finally { busy.value = false; }
}
function pick(position) {
  if (annotationDrawing.value || mapMode.value === 'browse') return;
  openForm(mapMode.value);
  lat.value = position.lat.toFixed(6);
  lng.value = position.lng.toFixed(6);
  if (draftMarker) draftMarker.remove();
  draftMarker = L.marker(position, { icon: markerIcon(true) }).addTo(map);
}
function closeForm() {
  if (!busy.value && !photoBusy.value) dialog.value.close();
}
function cleanForm() {
  formGeneration++;photoBusy.value=false;photos.value=[];
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
    previewMap = L.map(previewMapEl.value, { scrollWheelZoom: false, zoomAnimation:false }).setView([point.lat, point.lng], 15);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Source: <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community'
    }).addTo(previewMap);
    L.marker([point.lat, point.lng], { icon: markerIcon(true) }).addTo(previewMap);
    map?.setView([point.lat, point.lng], 15);
  } catch (e) { notice.value = e.message; }
}
watch([lat, lng, east, north, crs], () => {
  previewMap?.remove();
  previewMap = null;
  coordinatePreview.value = null;
});
async function save() {
  const fromRoute=selectedId.value,targetProjectId=eventProjectId.value;
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
      if(selectedId.value === fromRoute)await choose(p);
    } else {
      // datetime-local is explicitly Taiwan time, independent of the visitor's time zone.
      const occurred_at = new Date(`${date.value}:00+08:00`).toISOString();
      if (!targetProjectId) throw new Error('請先建立並選擇地區專案');
      const saved = await api(editingId.value ? `/events/${editingId.value}` : `/projects/${targetProjectId}/events`, {
        method: editingId.value ? "PUT" : "POST",
        headers: {Authorization:`Bearer ${adminKey.value}`},
        body: JSON.stringify({
          title: title.value,
          ...(crs.value === 'wgs84' && lat.value === '' && lng.value === '' || crs.value === 'twd97' && east.value === '' && north.value === '' ? {lat:null,lng:null} : coordinates()),
          category:category.value, source:source.value,
          description: description.value,
          occurred_at,
          url: url.value,
          photos: photos.value,
          token: token.value,
        }),
      });
      if(selectedId.value === saved.project_id){
      generation++;
      events.value = [...events.value.filter(e => e.id !== saved.id), saved].sort((a, b) =>
        b.occurred_at.localeCompare(a.occurred_at),
      );
      }
    }
    dialog.value.close();
    error.value = "";
  } catch (e) {
    if(selectedId.value === fromRoute)notice.value = e.message;
    token.value = "";
    challengeKey.value++;
  } finally {
    busy.value = false;
  }
}
function view(event) {
  mediaError.value = '';
  readerTab.value = linkedMedia(event.url).kind === 'none' ? 'photos' : 'link';
  readerWide.value = false;
  embedLoading.value = ['web','drive','image'].includes(linkedMedia(event.url).kind);
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
  const snapshot = JSON.stringify({ version: 2, project: selected.value, events: events.value, features:features.value }, null, 2);
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
watch([selectedId, visibleEvents, annotationDrawing, showEvents], paint, { deep: true });
watch(mobileTab,async()=>{await nextTick();map?.invalidateSize();});
function setupProjectMap(){
  if(map || !document.getElementById('map'))return;
  // CSS zoom timers can outlive maps removed during route changes.
  map = L.map("map", { zoomControl: false, zoomAnimation:false }).setView([23.85, 121], 7);
  const basicMap = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  const satelliteMap = L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution:
      'Source: <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community',
  });
  satelliteMap.addTo(map);
  L.control.layers({
    "基本地圖": basicMap,
    "衛星影像": satelliteMap,
  }, null, { position: "topright", collapsed: false }).addTo(map);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.control.scale({position:'bottomleft',imperial:false}).addTo(map);
  markers = L.layerGroup().addTo(map);
  mapRef.value=map;
  map.on("click", (e) => pick(e.latlng));
  paint();
}
onMounted(async () => {
  window.addEventListener('hashchange',syncRoute);
  await refresh();
  if(selected.value){await nextTick();setupProjectMap();fitProject();}
  timer = setInterval(() => {
    if (!document.hidden && !busy.value && !formKind.value && !deleteTarget.value && !annotationDrawing.value) refresh();
  }, 15000);
});
onBeforeUnmount(() => {
  previewMap?.remove();
  clearInterval(timer);
  window.removeEventListener('hashchange',syncRoute);
  generation++;
});
onUnmounted(destroyProjectMap);
</script>

<template>
  <header class="topbar">
    <a class="brand" href="#/"><span class="brand-name">GeoPORT</span><span>調查報告紀事</span></a>
    <div class="workspace-summary"><span>{{ selected ? '專案工作區' : '地區專案總覽' }}</span></div>
    <div class="sync">
      <span :class="['status-dot', { offline: error }]"></span
      >{{ loading ? "連線中" : error ? "同步中斷" : `已同步 ${synced}`
      }}<button class="icon-button" @click="refresh" aria-label="重新同步">
        ↻
      </button>
    </div>
  </header>
  <div v-if="error" role="alert" class="banner">{{ error }}</div>
  <RegionOverview v-if="!selectedId" :projects="projects" :loading="loading" :view="overviewView" @open="choose" @create="createProject" @view="overviewView=$event" />
  <template v-else-if="selected">
    <nav class="project-nav" aria-label="專案導覽">
      <button class="back-to-projects" @click="goOverview()" aria-label="所有地區專案">← 所有專案</button>
      <div class="project-title"><span class="workspace-eyebrow">PROJECT WORKSPACE</span><h1>{{ selected.name }}</h1></div>
      <button class="primary" :disabled="busy" @click="openForm('event')">＋ 新增事件</button>
    </nav>
    <div class="mobile-workspace-tabs" role="group" aria-label="專案檢視">
      <button :aria-pressed="mobileTab === 'map'" @click="mobileTab='map'">地圖</button>
      <button :aria-pressed="mobileTab === 'sidebar' && sidebarTab === 'events'" @click="mobileTab='sidebar';sidebarTab='events'">時間軸</button>
      <button :aria-pressed="mobileTab === 'sidebar' && sidebarTab === 'annotations'" @click="mobileTab='sidebar';sidebarTab='annotations'">標註</button>
    </div>
    <main class="workspace project-workspace" :class="{'mobile-show-sidebar':mobileTab === 'sidebar'}" :aria-busy="busy">
      <aside class="timeline-panel" aria-label="專案事件與標註">
        <div class="timeline-head">
          <div class="sidebar-tabs" role="group" aria-label="專案資料"><button :aria-pressed="sidebarTab === 'events'" @click="sidebarTab='events'">事件時間軸 <span>{{ events.length }}</span></button><button :aria-pressed="sidebarTab === 'annotations'" @click="sidebarTab='annotations'">地圖標註 <span>{{ features.length }}</span></button></div>
          <div class="layer-controls"><label><input type="checkbox" v-model="showEvents" aria-label="顯示事件圖層" />事件圖層</label><label><input type="checkbox" v-model="showAnnotations" aria-label="顯示標註圖層" />標註圖層</label></div>
          <div class="project-record-actions"><button @click="askExport">匯出專案</button><button @click="editRecord('project',selected)">編輯地區</button><button class="danger-text" @click="askDelete('projects',selected)">刪除地區</button></div>
        </div>
        <div v-show="sidebarTab === 'events'">
          <div class="timeline-label"><h2>事件時間軸</h2><small>{{ hasFilters ? visibleEvents.length + '/' : '' }}{{ events.length }} 筆 · 臺灣時間</small></div>
          <div class="event-pick-container"><button class="map-pick-action" @click="pickEvent">{{ mapMode === 'event' ? '請在地圖上點選事件位置' : '地圖選點新增事件' }}</button></div>
          <details class="timeline-filters"><summary>篩選紀錄{{ hasFilters ? ' · 已套用' : '' }}</summary><label>事件類型<select v-model="filterCategory"><option value="">全部類型</option><option v-for="(label,key) in EVENT_TYPES" :key="key" :value="key">{{ label }}</option></select></label><div class="field-row"><label>起日<input v-model="filterFrom" type="date" /></label><label>迄日<input v-model="filterTo" type="date" /></label></div><p class="hint">篩選只影響事件，地圖標註會保留。</p><p v-if="filterFrom && filterTo && filterFrom > filterTo" class="error" role="alert">起日不可晚於迄日</p><button type="button" @click="filterCategory='';filterFrom='';filterTo=''">清除篩選</button></details>
          <ol class="timeline">
            <li v-for="event in visibleEvents" :key="event.id">
              <button class="event-card" :class="{chosen:activeEvent?.id === event.id}" @click="view(event)"><time>{{ dateFormat(event.occurred_at) }}</time><span class="event-type-badge">{{ EVENT_TYPES[event.category || 'other'] }}</span><h3>{{ event.title }}</h3><p v-if="event.description">{{ event.description }}</p><small class="event-coordinates">{{ (event.lat ?? selected.lat).toFixed(5) }}, {{ (event.lng ?? selected.lng).toFixed(5) }}{{ event.lat == null ? ' · 沿用地點' : '' }}</small><span class="source-link">查看紀錄{{ event.photos?.length ? `・${event.photos.length} 張照片` : '' }} →</span></button>
              <div class="record-actions"><button :aria-label="`定位事件：${event.title}`" @click="locateEvent(event)">定位</button><button :aria-label="`編輯事件：${event.title}`" @click="editRecord('event',event)">編輯</button><button class="danger-text" :aria-label="`刪除事件：${event.title}`" @click="askDelete('events',event)">刪除</button></div>
            </li>
          </ol>
          <p v-if="events.length && !visibleEvents.length" class="empty-small">沒有符合篩選條件的事件。可展開篩選紀錄並清除條件。</p>
          <div v-if="!events.length" class="empty-small"><p>尚無事件</p><p class="hint">新增調查、雨量站或災害紀錄，並為每張圖卡設定位置。</p></div>
        </div>
        <div v-show="sidebarTab === 'annotations'">
          <MapAnnotations v-if="mapRef" :key="selectedId" :map="mapRef" :project-id="selectedId" :features="features" :visible="showAnnotations" v-model:admin-key="adminKey" @drawing-change="annotationInteraction" @locate="locateFeature" @saved="items=>{if(items[0]?.project_id === selectedId) features.push(...items)}" @removed="id=>features=features.filter(f=>f.id !== id)" />
        </div>
      </aside>
      <section class="map-panel project-map-panel" aria-label="專案地圖">
        <div id="map"></div>
        <div class="map-label"><div class="map-mode-buttons" aria-label="地圖操作模式"><button :aria-pressed="mapMode === 'browse'" :disabled="annotationDrawing" @click="mapMode='browse'">瀏覽</button><button :aria-pressed="mapMode === 'event'" :disabled="annotationDrawing" @click="pickEvent">事件</button></div><span>{{ annotationDrawing ? '正在編輯地圖標註' : mapMode === 'event' ? '點擊地圖新增事件座標' : '此專案的事件與地圖標註' }}</span></div>
        <div id="map-drawing-controls"></div>
        <div class="map-legend" aria-label="地圖圖例"><span><i class="legend-event"></i>事件</span><span><i class="legend-annotation"></i>標註</span></div>
        <button class="map-reset" @click="fitProject">↖ 專案範圍</button>
      </section>
    </main>
  </template>
  <section v-else class="missing-project"><h1>{{ loading ? '載入地區專案…' : '找不到地區專案' }}</h1><p>可返回總覽，選擇其他調查地區。</p><button @click="goOverview()" aria-label="所有地區專案">← 所有專案</button></section>
  <dialog
    ref="dialog"
    @close="cleanForm"
    @cancel="(busy || photoBusy) && $event.preventDefault()"
  >
    <form @submit.prevent="save">
      <div class="dialog-heading">
        <div>
          <h2>
            {{ formKind === 'project' ? (editingId ? '編輯' : '建立') + '地區專案' : (editingId ? '編輯事件' : '新增時間軸事件') }}
          </h2>
        </div>
        <button
          type="button"
          :disabled="busy || photoBusy"
          @click="closeForm"
          aria-label="關閉表單"
        >
          ×
        </button>
      </div>
      <template v-if="formKind === 'event'">
        <label>所屬地區專案<select v-model="eventProjectId" required disabled><option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <p v-if="!projects.length" class="hint">請先建立一個地區專案。<button type="button" @click="openForm('project')">建立地區</button></p>
        <div class="field-row event-metadata-row"><label>事件時間（臺灣 UTC+8）<input v-model="date" type="datetime-local" required /></label><label>事件類型<select v-model="category"><option v-for="(label,key) in EVENT_TYPES" :key="key" :value="key">{{ label }}</option></select></label></div>
        <label>事件名稱<input v-model="title" required maxlength="160" placeholder="這個時間，發生了什麼？" /></label>
        <p v-if="category === 'rainfall'" class="hint">雨量站可直接以站名建立事件，並填入該站座標；雨量數值與觀測時段可記在敘述中。</p>
        <p class="coordinate-heading">事件座標</p><p class="hint">預填所屬地點座標，可修改為實際位置；兩欄留白則沿用地點。</p>
      </template>
      <template v-if="formKind">
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
              :required="formKind === 'project'"
              type="number"
              step="any"
              min="-90"
              max="90"
              placeholder="24.165" /></label
          ><label
            >經度 Longitude<input
              v-model="lng"
              :required="formKind === 'project'"
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
              :required="formKind === 'project'"
              type="number"
              step="any" /></label
          ><label
            >Y 北向（公尺）<input
              v-model="north"
              :required="formKind === 'project'"
              type="number"
              step="any"
          /></label>
        </div>
        <button type="button" class="wide" @click="locateCoordinates">定位座標</button>
        <div v-if="coordinatePreview" class="coordinate-preview">
          <div ref="previewMapEl" class="coordinate-map" aria-label="座標定位預覽"></div>
          <p class="hint">{{ coordinatePreview.lat.toFixed(6) }}, {{ coordinatePreview.lng.toFixed(6) }}</p>
        </div>
      </template>
      <label v-if="formKind === 'project'" class="project-name-field">地區名稱<input v-model="name" required maxlength="100" placeholder="例如：太魯閣・燕子口" /></label>
      <template v-else>
        <label
          >事件敘述<textarea
            v-model="description"
            maxlength="5000"
            rows="4"
            placeholder="補充事件的經過與背景"
          ></textarea>
        </label>
        <label>資料來源（選填）<input v-model="source" maxlength="200" placeholder="提供單位、報告名稱或現地調查" /></label>
        <label
          >介紹網頁／圖片／雲端檔案網址（選填）<input
            v-model="url"
            type="url"
            maxlength="2048"
            pattern="https://.*"
            placeholder="https://..."
        /></label>
        <label>上傳照片（最多 5 張）<input type="file" accept="image/jpeg,image/png,image/webp" multiple :disabled="photoBusy || busy" @change="selectPhotos" /></label>
        <p class="hint">JPEG、PNG、WebP，原始照片每張 10 MB 內；自動縮圖後上傳，網址可留白。</p>
        <p v-if="photoBusy" role="status">正在處理照片…</p>
        <div class="photo-thumbnails">
          <figure v-for="(photo, index) in photos" :key="photo">
            <img :src="photoSource(photo)" :alt="`照片 ${index + 1} 預覽`" />
            <button type="button" :disabled="busy || photoBusy" @click="photos.splice(index,1)" :aria-label="`移除照片 ${index + 1}`">移除</button>
          </figure>
        </div>
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
      <p class="hint">匯出此地點全部 {{ events.length }} 筆紀錄，不受目前篩選條件影響。</p>
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
    :class="{'reader-wide':readerWide}"
    @close="activeEvent = null"
    aria-label="事件網頁閱讀區"
  >
    <section class="reader" :class="{'reader-text-only':!hasReaderLink && !activeEvent.photos?.length}">
      <header>
        <div>
          <time>{{ dateFormat(activeEvent.occurred_at) }}</time>
          <h2>{{ activeEvent.title }}</h2>
        </div>
        <div class="reader-actions"><button @click="readerWide=!readerWide" :aria-expanded="readerWide">{{ readerWide ? '縮回閱讀區' : '展開閱讀區' }}</button><button @click="activeEvent = null" aria-label="關閉事件網頁">×</button></div>
      </header>
      <details class="reader-event-info" :open="!hasReaderLink && !activeEvent.photos?.length"><summary>事件資料 · {{ EVENT_TYPES[activeEvent.category || 'other'] }}</summary>
        <p v-if="activeEvent.description" class="reader-description">{{ activeEvent.description }}</p>
        <div class="reader-record-meta"><span v-if="activeEvent.lat != null">{{ activeEvent.lat.toFixed(5) }}, {{ activeEvent.lng.toFixed(5) }}</span><span v-else>沿用地點座標</span></div>
        <p v-if="activeEvent.source" class="reader-source">資料來源：{{ activeEvent.source }}</p>
        <dl class="reader-audit"><dt>建立時間</dt><dd>{{ dateFormat(activeEvent.created_at) }}</dd><dt>最後修改</dt><dd>{{ activeEvent.updated_at ? dateFormat(activeEvent.updated_at) : '舊紀錄未記錄' }}</dd></dl>
      </details>
      <div v-if="hasReaderLink && activeEvent.photos?.length" class="reader-tabs" role="group" aria-label="閱讀內容"><button :aria-pressed="readerTab === 'link'" @click="readerTab='link'">{{ activeMedia.kind === 'image' ? '連結圖片' : '網頁' }}</button><button :aria-pressed="readerTab === 'photos'" @click="readerTab='photos'">照片（{{ activeEvent.photos.length }}）</button></div>
      <p v-if="mediaError" role="alert" class="error">{{ mediaError }}</p>
      <div v-if="readerTab === 'photos' || !hasReaderLink" class="event-photos reader-photo-pane">
        <img v-for="(photo,index) in activeEvent.photos" :key="photo" :src="photoUrl(photo)" :alt="`${activeEvent.title}・照片 ${index + 1}`" loading="lazy" @error="mediaError = '照片載入失敗，請稍後重試。'" />
      </div>
      <div v-else class="reader-web-pane">
      <div v-if="activeMedia.kind === 'external'" class="external-fallback"><h3>此網站限制內嵌顯示</h3><p>原網站只允許從自己的頁面顯示內容，請在新分頁閱讀完整資料。</p><a class="button primary" :href="activeMedia.src" target="_blank" rel="noopener noreferrer">開啟原網站</a></div>
      <div v-if="activeMedia.kind === 'drive'" class="drive-help">
        <p class="hint">若顯示「需要存取權」，請將原檔設為「知道連結的任何人／檢視者」，再重新載入。也可直接上傳照片。</p>
        <button type="button" @click="reloadPreview">重新載入預覽</button>
      </div>
      <details v-if="activeMedia.kind === 'web'" class="external-help"><summary>網頁無法顯示？</summary><p>部分網站限制其他平台內嵌。可在原網站閱讀，或改用照片記錄。</p><a class="button" :href="activeMedia.src" target="_blank" rel="noopener noreferrer">開啟原網站</a></details>
      <p v-if="embedLoading && ['web','drive','image'].includes(activeMedia.kind)" role="status" class="hint">
        正在載入事件網頁…
      </p>
      <img v-if="activeMedia.kind === 'image'" class="linked-photo" :src="activeMedia.src" :alt="activeEvent.title" referrerpolicy="no-referrer" @load="embedLoading = false" @error="embedLoading = false; mediaError = '圖片無法載入，請確認連結公開，或改用上傳照片。'" />
      <iframe
        v-else-if="['web','drive'].includes(activeMedia.kind)"
        :key="`${activeEvent.id}-${previewVersion}`"
        :src="activeMedia.src"
        :title="activeEvent.title"
        sandbox="allow-scripts allow-same-origin"
        referrerpolicy="no-referrer"
        @load="embedLoading = false"
      ></iframe>
      </div>
    </section>
  </dialog>
</template>
