<script setup>
import { ref, computed, watch, nextTick, defineAsyncComponent } from "vue";
import { useWorkspace } from "../composables/workspaceContext";
import { api, photoUrl, pdfUrl } from "../services/api";
import { linkedMedia, pdfPage } from "../lib/media";
import { EVENT_TYPES } from "../../shared/records";
import EventTour from "./EventTour.vue";
const PdfPreview = defineAsyncComponent(() => import("./PdfPreview.vue"));
const {
  activeEvent,
  readerWide,
  visibleEvents,
  focusedEvent,
  focusedEventId,
  tourOverview,
  readTourEvent,
  overviewEvents,
  dateFormat,
} = useWorkspace();
const readerDialog = ref(null),
  embedLoading = ref(false),
  previewVersion = ref(0),
  readerTab = ref("link"),
  mediaError = ref(""),
  detectedMedia = ref(null);
const activeMedia = computed(() => {
  const initial = linkedMedia(activeEvent.value?.url);
  return detectedMedia.value
    ? {
        ...initial,
        ...detectedMedia.value,
        page: pdfPage(activeEvent.value?.url),
      }
    : initial;
});
const hasReaderLink = computed(() => activeMedia.value.kind !== "none");
function reloadPreview() {
  embedLoading.value = true;
  mediaError.value = "";
  previewVersion.value++;
}
watch(activeEvent, async (event) => {
  if (!event) return;
  mediaError.value = "";
  detectedMedia.value = null;
  previewVersion.value = 0;
  const initial = linkedMedia(event.url);
  readerTab.value = initial.kind === "none" ? "photos" : "link";
  embedLoading.value = ["web", "drive", "image"].includes(initial.kind);
  if (initial.kind === "web")
    api(`/events/${event.id}/media`)
      .then((result) => {
        if (
          activeEvent.value?.id === event.id &&
          activeEvent.value?.url === event.url &&
          result.verified
        ) {
          detectedMedia.value = result;
          if (["pdf", "external"].includes(result.kind))
            embedLoading.value = false;
        }
      })
      .catch(() => {});
  await nextTick();
  readerDialog.value?.showModal();
});
</script>

<template>
  <dialog
    v-if="activeEvent"
    ref="readerDialog"
    class="reader-dialog"
    :class="{ 'reader-wide': readerWide }"
    @close="activeEvent = null"
    aria-label="事件網頁閱讀區"
  >
    <section
      class="reader"
      :class="{
        'reader-text-only': !hasReaderLink && !activeEvent.photos?.length,
      }"
    >
      <header>
        <div>
          <time>{{ dateFormat(activeEvent.occurred_at) }}</time>
          <h2>{{ activeEvent.title }}</h2>
        </div>
        <div class="reader-actions">
          <button @click="readerWide = !readerWide" :aria-expanded="readerWide">
            {{ readerWide ? "縮回閱讀區" : "展開閱讀區" }}</button
          ><button @click="activeEvent = null" aria-label="關閉事件網頁">
            ×
          </button>
        </div>
      </header>
      <EventTour
        v-if="visibleEvents.length > 1 && focusedEvent"
        reader
        :events="visibleEvents"
        :current-id="focusedEventId"
        :overview="tourOverview"
        @select="readTourEvent"
        @overview="overviewEvents"
      />
      <details
        class="reader-event-info"
        :open="!hasReaderLink && !activeEvent.photos?.length"
      >
        <summary>
          事件資料 · {{ EVENT_TYPES[activeEvent.category || "other"] }}
        </summary>
        <p v-if="activeEvent.description" class="reader-description">
          {{ activeEvent.description }}
        </p>
        <div class="reader-record-meta">
          <span v-if="activeEvent.lat != null"
            >{{ activeEvent.lat.toFixed(5) }},
            {{ activeEvent.lng.toFixed(5) }}</span
          ><span v-else>沿用地點座標</span>
        </div>
        <p v-if="activeEvent.source" class="reader-source">
          資料來源：{{ activeEvent.source }}
        </p>
        <dl class="reader-audit">
          <dt>建立時間</dt>
          <dd>{{ dateFormat(activeEvent.created_at) }}</dd>
          <dt>最後修改</dt>
          <dd>
            {{
              activeEvent.updated_at
                ? dateFormat(activeEvent.updated_at)
                : "舊紀錄未記錄"
            }}
          </dd>
        </dl>
      </details>
      <div
        v-if="hasReaderLink && activeEvent.photos?.length"
        class="reader-tabs"
        role="group"
        aria-label="閱讀內容"
      >
        <button
          :aria-pressed="readerTab === 'link'"
          @click="readerTab = 'link'"
        >
          {{ activeMedia.kind === "image" ? "連結圖片" : "網頁" }}</button
        ><button
          :aria-pressed="readerTab === 'photos'"
          @click="readerTab = 'photos'"
        >
          照片（{{ activeEvent.photos.length }}）
        </button>
      </div>
      <p v-if="mediaError" role="alert" class="error">{{ mediaError }}</p>
      <div
        v-if="readerTab === 'photos' || !hasReaderLink"
        class="event-photos reader-photo-pane"
      >
        <img
          v-for="(photo, index) in activeEvent.photos"
          :key="photo"
          :src="photoUrl(photo)"
          :alt="`${activeEvent.title}・照片 ${index + 1}`"
          loading="lazy"
          @error="mediaError = '照片載入失敗，請稍後重試。'"
        />
      </div>
      <div v-else class="reader-web-pane">
        <div v-if="activeMedia.kind === 'external'" class="external-fallback">
          <h3>
            {{
              activeMedia.reason === "file"
                ? "此檔案請使用原始連結開啟"
                : "此網站限制內嵌顯示"
            }}
          </h3>
          <p>
            {{
              activeMedia.reason === "file"
                ? "這個檔案格式尚不支援直接預覽，可在原網站或合適的閱讀工具開啟。"
                : "原網站只允許從自己的頁面顯示內容，請在新分頁閱讀完整資料。"
            }}
          </p>
          <a
            class="button primary"
            :href="activeMedia.src"
            target="_blank"
            rel="noopener noreferrer"
            >開啟原網站</a
          >
        </div>
        <PdfPreview
          v-if="activeMedia.kind === 'pdf'"
          :key="activeEvent.id"
          :url="pdfUrl(activeEvent.id)"
          :source="activeMedia.src"
          :initial-page="activeMedia.page"
        />
        <div v-if="activeMedia.kind === 'drive'" class="drive-help">
          <p class="hint">
            若顯示「需要存取權」，請將原檔設為「知道連結的任何人／檢視者」，再重新載入。也可直接上傳照片。
          </p>
          <button type="button" @click="reloadPreview">重新載入預覽</button>
        </div>
        <details v-if="activeMedia.kind === 'web'" class="external-help">
          <summary>網頁無法顯示？</summary>
          <p>部分網站限制其他平台內嵌。可在原網站閱讀，或改用照片記錄。</p>
          <a
            class="button"
            :href="activeMedia.src"
            target="_blank"
            rel="noopener noreferrer"
            >開啟原網站</a
          >
        </details>
        <p
          v-if="
            embedLoading && ['web', 'drive', 'image'].includes(activeMedia.kind)
          "
          role="status"
          class="hint"
        >
          正在載入事件網頁…
        </p>
        <img
          v-if="activeMedia.kind === 'image'"
          class="linked-photo"
          :src="activeMedia.src"
          :alt="activeEvent.title"
          referrerpolicy="no-referrer"
          @load="embedLoading = false"
          @error="
            embedLoading = false;
            mediaError = '圖片無法載入，請確認連結公開，或改用上傳照片。';
          "
        />
        <iframe
          v-else-if="['web', 'drive'].includes(activeMedia.kind)"
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
