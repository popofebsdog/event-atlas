<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import AtlasIcon from "./AtlasIcon.vue";
const props = defineProps({
  modelValue: String,
  annotations: Boolean,
  annotationsOpen: Boolean,
  showAnnotations: Boolean,
  count: Number,
  eventCount: Number,
  disabled: Boolean,
  externalLayers: { type: Array, default: () => [] },
});
const emit = defineEmits([
  "update:modelValue",
  "update:showAnnotations",
  "manage",
  "open-panel",
  "toggle-external",
  "opacity-external",
  "retry-external",
]);
const open = ref(""),
  panel = ref(null);
function togglePanel(name) {
  open.value = open.value === name ? "" : name;
  if (open.value) emit("open-panel");
}
function createAnnotation() {
  open.value = "";
  emit("manage");
}
function outside(event) {
  if (!panel.value?.contains(event.target)) open.value = "";
}
function escape(event) {
  if (event.key === "Escape") open.value = "";
}
watch(
  () => props.disabled,
  (value) => {
    if (value) open.value = "";
  },
);
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", escape);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", escape);
});
</script>
<template>
  <section
    ref="panel"
    class="map-layer-controls"
    aria-label="地圖圖層控制"
    @click.stop
    @dblclick.stop
    @pointerdown.stop
  >
    <div class="map-tool-buttons" role="group" aria-label="地圖工具">
      <button
        class="map-tool-button"
        aria-label="地圖底圖"
        :aria-expanded="open === 'basemap'"
        :disabled="disabled"
        @click="togglePanel('basemap')"
      >
        <AtlasIcon name="map" /><span>底圖</span>
      </button>
      <button
        v-if="annotations || externalLayers.length"
        class="map-tool-button"
        aria-label="地圖圖層"
        :aria-expanded="open === 'layers'"
        :disabled="disabled"
        @click="togglePanel('layers')"
      >
        <AtlasIcon name="layers" /><span>圖層</span>
      </button>
      <button
        v-if="annotations"
        class="map-tool-button"
        aria-label="建立標註"
        :aria-expanded="annotationsOpen"
        :disabled="disabled"
        @click="createAnnotation"
      >
        <AtlasIcon name="plus" /><span>建立標註</span>
      </button>
    </div>
    <div v-if="open" class="layer-popover">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold">
          {{ open === "basemap" ? "地圖底圖" : "地圖圖層" }}
        </h2>
        <button
          class="icon-button"
          :aria-label="open === 'basemap' ? '關閉底圖選單' : '關閉圖層選單'"
          @click="open = ''"
        >
          <AtlasIcon name="close" />
        </button>
      </div>
      <fieldset v-if="open === 'basemap'" class="basemap-options">
        <legend>底圖</legend>
        <p class="layer-help">選擇一種背景地圖</p>
        <div class="basemap-grid">
          <label
            ><input
              type="radio"
              name="atlas-basemap"
              :checked="modelValue === 'basic'"
              @change="emit('update:modelValue', 'basic')"
            /><span>基本地圖</span></label
          ><label
            ><input
              type="radio"
              name="atlas-basemap"
              :checked="modelValue === 'satellite'"
              @change="emit('update:modelValue', 'satellite')"
            /><span>衛星影像</span></label
          >
        </div>
      </fieldset>
      <fieldset v-else-if="open === 'layers'" class="data-layer-options">
        <legend>資料圖層</legend>
        <p class="layer-help">可在底圖上同時套疊多種資料</p>
        <template v-if="annotations">
          <div class="required-layer">
            <span class="layer-event-dot"></span>
            <div><strong>事件</strong><small>事件固定顯示</small></div>
            <span class="ml-auto text-sm text-muted">{{ eventCount }} 筆</span>
          </div>
          <div class="optional-layer">
            <label
              ><input
                type="checkbox"
                aria-label="顯示標註圖層"
                :checked="showAnnotations"
                @change="emit('update:showAnnotations', $event.target.checked)"
              /><span
                ><strong>地圖標註</strong><small>專案的點、線、面</small></span
              ></label
            ><span class="ml-auto text-sm text-muted">{{ count }} 筆</span>
          </div>
        </template>
        <div
          v-for="layer in externalLayers"
          :key="layer.id"
          class="external-layer-row"
        >
          <label class="external-layer-toggle"
            ><input
              type="checkbox"
              :aria-label="`顯示${layer.name}圖層`"
              :checked="layer.enabled"
              @change="emit('toggle-external', layer.id, $event.target.checked)"
            /><span
              ><strong>{{ layer.name }}</strong
              ><small>{{ layer.scale }}</small></span
            ></label
          >
          <a
            class="external-layer-source"
            :aria-label="`${layer.name}來源`"
            :href="layer.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            >{{ layer.sourceLabel }}</a
          >
          <template v-if="layer.enabled">
            <label class="opacity-control"
              >不透明度 <span>{{ Math.round(layer.opacity * 100) }}%</span
              ><input
                type="range"
                min="0"
                max="100"
                step="5"
                :aria-label="`${layer.name}不透明度`"
                :value="Math.round(layer.opacity * 100)"
                @input="
                  emit(
                    'opacity-external',
                    layer.id,
                    Number($event.target.value) / 100,
                  )
                "
            /></label>
            <p v-if="layer.loading" class="layer-loading" role="status">
              正在載入{{ layer.name }}…
            </p>
            <div v-if="layer.error" class="layer-error">
              <p role="alert">{{ layer.error }}</p>
              <button
                :aria-label="`重新載入${layer.name}`"
                @click="emit('retry-external', layer.id)"
              >
                重新載入
              </button>
            </div>
            <a
              v-if="layer.legendUrl"
              class="external-layer-source"
              :href="layer.legendUrl"
              target="_blank"
              rel="noopener noreferrer"
              >查看圖例</a
            >
          </template>
        </div>
      </fieldset>
    </div>
  </section>
</template>
