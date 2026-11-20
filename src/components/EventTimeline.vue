<script setup>
import { useWorkspace } from "../composables/workspaceContext";
import { EVENT_TYPES } from "../../shared/records";
const {
  events,
  visibleEvents,
  hasFilters,
  filterCategory,
  filterFrom,
  filterTo,
  mapMode,
  focusedEventId,
  selected,
  activeEvent,
  dateFormat,
  pickEvent,
  view,
  locateEvent,
  editRecord,
  askDelete,
} = useWorkspace();
</script>

<template>
  <div>
    <div class="timeline-label">
      <h2>事件時間軸</h2>
      <small
        >{{ hasFilters ? visibleEvents.length + "/" : ""
        }}{{ events.length }} 筆 · 由舊到新</small
      >
    </div>
    <div class="event-pick-container">
      <button class="map-pick-action" @click="pickEvent">
        {{
          mapMode === "event" ? "請在地圖上點選事件位置" : "地圖選點新增事件"
        }}
      </button>
    </div>
    <details class="timeline-filters">
      <summary>篩選紀錄{{ hasFilters ? " · 已套用" : "" }}</summary>
      <label
        >事件類型<select v-model="filterCategory">
          <option value="">全部類型</option>
          <option v-for="(label, key) in EVENT_TYPES" :key="key" :value="key">
            {{ label }}
          </option>
        </select></label
      >
      <div class="field-row">
        <label>起日<input v-model="filterFrom" type="date" /></label
        ><label>迄日<input v-model="filterTo" type="date" /></label>
      </div>
      <p class="hint">依事件類型與臺灣日期篩選紀錄。</p>
      <p
        v-if="filterFrom && filterTo && filterFrom > filterTo"
        class="error"
        role="alert"
      >
        起日不可晚於迄日
      </p>
      <button
        type="button"
        @click="
          filterCategory = '';
          filterFrom = '';
          filterTo = '';
        "
      >
        清除篩選
      </button>
    </details>
    <ol class="timeline">
      <li
        v-for="(event, index) in visibleEvents"
        :key="event.id"
        :data-event-id="event.id"
      >
        <button
          class="event-card"
          :class="{ chosen: focusedEventId === event.id }"
          :aria-current="focusedEventId === event.id ? 'step' : undefined"
          @click="view(event)"
        >
          <time>{{ dateFormat(event.occurred_at) }}</time
          ><span class="event-type-badge">{{
            EVENT_TYPES[event.category || "other"]
          }}</span>
          <h3>
            <span class="timeline-order" aria-hidden="true">{{
              index + 1
            }}</span
            >{{ event.title }}
          </h3>
          <p v-if="event.description">{{ event.description }}</p>
          <small class="event-coordinates"
            >{{ (event.lat ?? selected.lat).toFixed(5) }},
            {{ (event.lng ?? selected.lng).toFixed(5)
            }}{{ event.lat == null ? " · 沿用地點" : "" }}</small
          ><span class="source-link"
            >查看紀錄{{
              event.photos?.length ? `・${event.photos.length} 張照片` : ""
            }}
            →</span
          >
        </button>
        <div class="record-actions">
          <button
            :aria-label="`定位事件：${event.title}`"
            @click="locateEvent(event)"
          >
            定位</button
          ><button
            :aria-label="`編輯事件：${event.title}`"
            @click="editRecord('event', event)"
          >
            編輯</button
          ><button
            class="danger-text"
            :aria-label="`刪除事件：${event.title}`"
            @click="askDelete('events', event)"
          >
            刪除
          </button>
        </div>
      </li>
    </ol>
    <p v-if="events.length && !visibleEvents.length" class="empty-small">
      沒有符合篩選條件的事件。可展開篩選紀錄並清除條件。
    </p>
    <div v-if="!events.length" class="empty-small">
      <p>尚無事件</p>
      <p class="hint">新增調查、雨量站或災害紀錄，並為每張圖卡設定位置。</p>
    </div>
  </div>
</template>
