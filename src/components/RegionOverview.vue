<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import L from "leaflet";
import MapLayers from "./MapLayers.vue";
import { addZoomControls } from "../lib/mapControls";
import { useMapLayers } from "../composables/useMapLayers";
const props = defineProps({ projects: Array, loading: Boolean, view: Object });
const emit = defineEmits(["open", "create", "view"]);
const mapEl = ref(null),
  adding = ref(false),
  listOpen = ref(true);
const layers = useMapLayers();
const {
  baseMap,
  externalLayers,
  setBaseMap,
  toggleExternalLayer,
  setExternalOpacity,
  retryExternalLayer,
} = layers;
let map, markers;
function rememberView() {
  const point = map.getCenter();
  emit("view", { center: [point.lat, point.lng], zoom: map.getZoom() });
}
function paint() {
  if (!markers) return;
  markers.eachLayer((marker) => marker.unbindTooltip());
  markers.clearLayers();
  for (const project of props.projects) {
    const label = document.createElement("button");
    label.type = "button";
    label.className = "map-label-link";
    label.textContent = project.name;
    label.setAttribute("aria-label", `開啟專案：${project.name}`);
    L.DomEvent.disableClickPropagation(label);
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      emit("open", project);
    });
    L.marker([project.lat, project.lng], {
      title: project.name,
      icon: L.divIcon({
        className: "",
        html: '<span class="map-pin"></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    })
      .addTo(markers)
      .bindTooltip(label, {
        permanent: true,
        interactive: true,
        direction: "top",
        offset: [0, -12],
        className: "map-name-label",
        opacity: 1,
      })
      .on("click", () => emit("open", project));
  }
}
function showAll() {
  if (props.projects.length)
    map.fitBounds(
      props.projects.map((p) => [p.lat, p.lng]),
      { padding: [64, 64], maxZoom: 12 },
    );
  else map.setView([23.85, 121], 7);
}
watch(() => props.projects, paint, { deep: true });
watch(listOpen, async () => {
  await nextTick();
  map?.invalidateSize();
});
onMounted(() => {
  map = L.map(mapEl.value, {
    zoomControl: false,
    zoomAnimation: false,
    fadeAnimation: false,
  }).setView(props.view?.center || [23.85, 121], props.view?.zoom || 7);
  layers.attach(map);
  addZoomControls(map, showAll, "所有專案範圍");
  markers = L.layerGroup().addTo(map);
  paint();
  map.on("click", (event) => {
    if (adding.value) {
      adding.value = false;
      emit("create", event.latlng);
    }
  });
  map.on("moveend", rememberView);
});
onBeforeUnmount(() => {
  layers.detach();
  map?.off("moveend", rememberView);
  map?.remove();
  map = null;
  markers = null;
});
</script>

<template>
  <main class="overview-workspace">
    <aside
      class="places overview-places"
      :class="{ 'overview-list-collapsed': !listOpen }"
    >
      <div class="section-heading">
        <div>
          <span class="workspace-eyebrow">地理資料工作區</span>
          <h1>地區專案</h1>
        </div>
        <span class="count">{{ projects.length }}</span>
      </div>
      <p class="overview-intro">
        每個地區，都有自己的調查紀錄。選擇專案，沿著時間查看事件。
      </p>
      <button class="primary wide" @click="emit('create')">
        ＋ 建立地區專案
      </button>
      <button
        class="overview-list-toggle"
        :aria-expanded="listOpen"
        @click="listOpen = !listOpen"
      >
        {{ listOpen ? "收合專案清單" : `顯示 ${projects.length} 個專案` }}
      </button>
      <nav class="place-list" aria-label="地區專案">
        <button
          v-for="project in projects"
          :key="project.id"
          :data-project-id="project.id"
          class="place"
          @click="emit('open', project)"
        >
          <span class="place-dot">●</span
          ><span
            ><strong>{{ project.name }}</strong
            ><small
              >{{ project.lat.toFixed(4) }} N ·
              {{ project.lng.toFixed(4) }} E</small
            ></span
          ><span class="arrow">↗</span>
        </button>
        <p v-if="!loading && !projects.length" class="empty-small">
          尚無地區專案，先建立第一個調查地區。
        </p>
      </nav>
    </aside>
    <section class="map-panel overview-map-panel" aria-label="地區專案總覽地圖">
      <div id="overview-map" ref="mapEl"></div>
      <MapLayers
        :model-value="baseMap"
        :external-layers="externalLayers"
        @update:model-value="setBaseMap"
        @toggle-external="toggleExternalLayer"
        @opacity-external="setExternalOpacity"
        @retry-external="retryExternalLayer"
      />
      <button
        class="overview-map-create"
        :class="{ primary: adding }"
        :aria-pressed="adding"
        @click="adding = !adding"
      >
        {{ adding ? "取消選點" : "地圖選點建立" }}
      </button>
      <p v-if="adding" class="overview-pick-hint" role="status">
        請在地圖上選擇新地區位置
      </p>
    </section>
  </main>
</template>
