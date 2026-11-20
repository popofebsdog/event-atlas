<script setup>
import { useWorkspace } from "../composables/workspaceContext";
import { EVENT_TYPES } from "../../shared/records";
import Challenge from "./Challenge.vue";
const {
  dialog,
  formKind,
  editingId,
  busy,
  photoBusy,
  closeForm,
  cleanForm,
  save,
  projects,
  eventProjectId,
  date,
  category,
  title,
  crs,
  lat,
  lng,
  east,
  north,
  name,
  description,
  source,
  url,
  photos,
  coordinatePreview,
  previewMapEl,
  adminKey,
  token,
  challengeKey,
  canSubmit,
  notice,
  locateCoordinates,
  selectPhotos,
  photoSource,
} = useWorkspace();
</script>

<template>
  <dialog
    ref="dialog"
    @close="cleanForm"
    @cancel="(busy || photoBusy) && $event.preventDefault()"
  >
    <form @submit.prevent="save">
      <div class="dialog-heading">
        <div>
          <h2>
            {{
              formKind === "project"
                ? (editingId ? "編輯" : "建立") + "地區專案"
                : editingId
                  ? "編輯事件"
                  : "新增時間軸事件"
            }}
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
        <label
          >所屬地區專案<select v-model="eventProjectId" required disabled>
            <option v-for="p in projects" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select></label
        >
        <p v-if="!projects.length" class="hint">
          請先建立一個地區專案。<button
            type="button"
            @click="openForm('project')"
          >
            建立地區
          </button>
        </p>
        <div class="field-row event-metadata-row">
          <label
            >事件時間（臺灣 UTC+8）<input
              v-model="date"
              type="datetime-local"
              required /></label
          ><label
            >事件類型<select v-model="category">
              <option
                v-for="(label, key) in EVENT_TYPES"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </select></label
          >
        </div>
        <label
          >事件名稱<input
            v-model="title"
            required
            maxlength="160"
            placeholder="這個時間，發生了什麼？"
        /></label>
        <p v-if="category === 'rainfall'" class="hint">
          雨量站可直接以站名建立事件，並填入該站座標；雨量數值與觀測時段可記在敘述中。
        </p>
        <p class="coordinate-heading">事件座標</p>
        <p class="hint">
          預填所屬地點座標，可修改為實際位置；兩欄留白則沿用地點。
        </p>
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
        <button type="button" class="wide" @click="locateCoordinates">
          定位座標
        </button>
        <div v-if="coordinatePreview" class="coordinate-preview">
          <div
            ref="previewMapEl"
            class="coordinate-map"
            aria-label="座標定位預覽"
          ></div>
          <p class="hint">
            {{ coordinatePreview.lat.toFixed(6) }},
            {{ coordinatePreview.lng.toFixed(6) }}
          </p>
        </div>
      </template>
      <label v-if="formKind === 'project'" class="project-name-field"
        >地區名稱<input
          v-model="name"
          required
          maxlength="100"
          placeholder="例如：太魯閣・燕子口"
      /></label>
      <template v-else>
        <label
          >事件敘述<textarea
            v-model="description"
            maxlength="5000"
            rows="4"
            placeholder="補充事件的經過與背景"
          ></textarea>
        </label>
        <label
          >資料來源（選填）<input
            v-model="source"
            maxlength="200"
            placeholder="提供單位、報告名稱或現地調查"
        /></label>
        <label
          >介紹網頁／圖片／雲端檔案網址（選填）<input
            v-model="url"
            type="url"
            maxlength="2048"
            pattern="https://.*"
            placeholder="https://..."
        /></label>
        <label
          >上傳照片（最多 5 張）<input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            :disabled="photoBusy || busy"
            @change="selectPhotos"
        /></label>
        <p class="hint">
          JPEG、PNG、WebP，原始照片每張 10 MB 內；自動縮圖後上傳，網址可留白。
        </p>
        <p v-if="photoBusy" role="status">正在處理照片…</p>
        <div class="photo-thumbnails">
          <figure v-for="(photo, index) in photos" :key="photo">
            <img :src="photoSource(photo)" :alt="`照片 ${index + 1} 預覽`" />
            <button
              type="button"
              :disabled="busy || photoBusy"
              @click="photos.splice(index, 1)"
              :aria-label="`移除照片 ${index + 1}`"
            >
              移除
            </button>
          </figure>
        </div>
      </template>
      <label
        >管理員金鑰<input
          v-model="adminKey"
          type="password"
          required
          autocomplete="off"
          placeholder="輸入管理員金鑰"
      /></label>
      <Challenge
        v-if="formKind && !editingId"
        :key="challengeKey"
        @token="token = $event"
      />
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
</template>
