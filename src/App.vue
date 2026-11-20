<script setup>
import { provide } from "vue";
import { useAtlasWorkspace } from "./composables/useAtlasWorkspace";
import { workspaceKey } from "./composables/workspaceContext";
import AtlasIcon from "./components/AtlasIcon.vue";
import MapLayers from "./components/MapLayers.vue";
import AppHeader from "./components/AppHeader.vue";
import RegionOverview from "./components/RegionOverview.vue";
import MapAnnotations from "./components/MapAnnotations.vue";
import EventTour from "./components/EventTour.vue";
import EventTimeline from "./components/EventTimeline.vue";
import EventReader from "./components/EventReader.vue";
import RecordEditor from "./components/RecordEditor.vue";
const workspace = useAtlasWorkspace();
provide(workspaceKey, workspace);
const {
  selected,
  selectedId,
  projects,
  events,
  features,
  loading,
  busy,
  error,
  overviewView,
  mobileTab,
  showAnnotations,
  annotationsPanelOpen,
  baseMap,
  externalLayers,
  setBaseMap,
  toggleExternalLayer,
  setExternalOpacity,
  retryExternalLayer,
  mapRef,
  adminKey,
  annotationDrawing,
  focusedEventId,
  tourOverview,
  visibleEvents,
  mapMode,
  goOverview,
  createProject,
  choose,
  openForm,
  askExport,
  editRecord,
  askDelete,
  annotationInteraction,
  annotationsSaved,
  annotationsRemoved,
  inspectFeature,
  locateFeature,
  pickEvent,
  fitProject,
  selectTourEvent,
  overviewEvents,
  view,
  exportDialog,
  exportError,
  downloadData,
  deleteDialog,
  deleteTarget,
  deleteError,
  removeRecord,
} = workspace;
</script>

<template>
  <AppHeader />
  <div v-if="error" role="alert" class="banner">{{ error }}</div>
  <RegionOverview
    v-if="!selectedId"
    :projects="projects"
    :loading="loading"
    :view="overviewView"
    @open="choose"
    @create="createProject"
    @view="overviewView = $event"
  />
  <template v-else-if="selected">
    <nav class="project-nav flex items-center gap-4" aria-label="專案導覽">
      <button
        class="back-to-projects"
        aria-label="所有地區專案"
        @click="goOverview()"
      >
        <AtlasIcon name="back" /><span>所有專案</span>
      </button>
      <div class="project-title min-w-0 flex-1">
        <span class="workspace-eyebrow">地區專案 / 事件工作區</span>
        <h1>{{ selected.name }}</h1>
      </div>
      <button
        class="primary mobile-add-event"
        :disabled="busy"
        @click="openForm('event')"
      >
        ＋ 新增事件
      </button>
    </nav>
    <div class="mobile-workspace-tabs" role="group" aria-label="專案檢視">
      <button
        :aria-pressed="mobileTab === 'map'"
        @click="
          mobileTab = 'map';
          annotationsPanelOpen = false;
        "
      >
        地圖</button
      ><button
        :aria-pressed="mobileTab === 'sidebar'"
        @click="
          mobileTab = 'sidebar';
          annotationsPanelOpen = false;
        "
      >
        時間軸
      </button>
    </div>
    <main
      class="workspace project-workspace"
      :class="{ 'mobile-show-sidebar': mobileTab === 'sidebar' }"
      :aria-busy="busy"
    >
      <aside class="timeline-panel" aria-label="專案事件時間軸">
        <div class="timeline-head">
          <button
            class="primary wide new-event-primary"
            :disabled="busy"
            @click="openForm('event')"
          >
            ＋ 新增事件
          </button>
          <div class="project-record-actions">
            <button @click="askExport">匯出專案</button
            ><button @click="editRecord('project', selected)">編輯地區</button
            ><button
              class="danger-text"
              @click="askDelete('projects', selected)"
            >
              刪除地區
            </button>
          </div>
        </div>
        <EventTimeline />
      </aside>
      <section class="map-panel project-map-panel" aria-label="專案地圖">
        <div class="project-map-canvas">
          <div id="map"></div>
          <MapLayers
            :model-value="baseMap"
            :external-layers="externalLayers"
            annotations
            :show-annotations="showAnnotations"
            :count="features.length"
            :event-count="events.length"
            :disabled="annotationDrawing"
            @update:model-value="setBaseMap"
            @toggle-external="toggleExternalLayer"
            @opacity-external="setExternalOpacity"
            @retry-external="retryExternalLayer"
            @update:show-annotations="showAnnotations = $event"
            @manage="
              mobileTab = 'map';
              mapMode = 'browse';
              showAnnotations = true;
              annotationsPanelOpen = true;
            "
          />
          <div v-if="mapMode === 'event'" class="map-pick-hint" role="status">
            <span>點擊地圖設定事件位置</span
            ><button @click="mapMode = 'browse'">取消選點</button>
          </div>
          <div id="map-drawing-controls"></div>
          <aside
            v-show="annotationsPanelOpen"
            class="map-annotations-panel"
            aria-label="地圖標註管理"
          >
            <header
              class="annotation-panel-heading flex items-center justify-between gap-3"
            >
              <div>
                <span class="workspace-eyebrow">地圖圖層</span>
                <h2>標註管理</h2>
              </div>
              <button
                class="icon-button"
                aria-label="關閉標註管理"
                @click="annotationsPanelOpen = false"
              >
                <AtlasIcon name="close" />
              </button>
            </header>
            <MapAnnotations
              v-if="mapRef"
              :key="selectedId"
              :map="mapRef"
              :project-id="selectedId"
              :features="features"
              :visible="showAnnotations"
              v-model:admin-key="adminKey"
              @drawing-change="annotationInteraction"
              @inspect="inspectFeature"
              @locate="
                (feature) => {
                  locateFeature(feature);
                  annotationsPanelOpen = false;
                }
              "
              @saved="annotationsSaved"
              @removed="annotationsRemoved"
            />
          </aside>
        </div>
        <EventTour
          v-if="
            visibleEvents.length &&
            !annotationDrawing &&
            !annotationsPanelOpen &&
            mapMode === 'browse'
          "
          :events="visibleEvents"
          :current-id="focusedEventId"
          :overview="tourOverview"
          @select="selectTourEvent"
          @overview="overviewEvents"
          @read="view"
        />
      </section>
    </main>
  </template>
  <section v-else class="missing-project">
    <h1>{{ loading ? "載入地區專案…" : "找不到地區專案" }}</h1>
    <p>可返回總覽，選擇其他調查地區。</p>
    <button aria-label="所有地區專案" @click="goOverview()">所有專案</button>
  </section>
  <RecordEditor />
  <dialog
    ref="exportDialog"
    @cancel="busy && $event.preventDefault()"
    aria-labelledby="export-heading"
  >
    <form @submit.prevent="downloadData">
      <h2 id="export-heading">匯出紀錄</h2>
      <p class="hint">
        匯出此地點全部 {{ events.length }} 筆紀錄，不受目前篩選條件影響。
      </p>
      <label
        >管理員金鑰<input
          v-model="adminKey"
          type="password"
          required
          autocomplete="off"
          placeholder="輸入管理員金鑰"
      /></label>
      <p v-if="exportError" class="error" role="alert">{{ exportError }}</p>
      <div class="form-footer">
        <button type="button" :disabled="busy" @click="exportDialog.close()">
          取消</button
        ><button class="primary" :disabled="busy || !adminKey.trim()">
          {{ busy ? "驗證中…" : "驗證並匯出" }}
        </button>
      </div>
    </form>
  </dialog>
  <dialog
    ref="deleteDialog"
    @close="deleteTarget = null"
    @cancel="busy && $event.preventDefault()"
    aria-labelledby="delete-heading"
  >
    <form v-if="deleteTarget" @submit.prevent="removeRecord">
      <h2 id="delete-heading">
        {{ deleteTarget.kind === "projects" ? "刪除地區" : "刪除事件" }}
      </h2>
      <p class="hint">
        確定刪除「{{ deleteTarget.name }}」？{{
          deleteTarget.kind === "projects"
            ? "此地區的所有事件也會一起刪除。"
            : ""
        }}此操作無法復原。
      </p>
      <label
        >管理員金鑰<input
          v-model="adminKey"
          type="password"
          required
          autocomplete="off"
      /></label>
      <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
      <div class="form-footer">
        <button type="button" :disabled="busy" @click="deleteDialog.close()">
          取消</button
        ><button class="danger-button" :disabled="busy || !adminKey">
          {{ busy ? "刪除中…" : "確認刪除" }}
        </button>
      </div>
    </form>
  </dialog>
  <EventReader />
</template>
