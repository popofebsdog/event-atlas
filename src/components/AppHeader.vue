<script setup>
import { useWorkspace } from "../composables/workspaceContext";
import AtlasIcon from "./AtlasIcon.vue";
const { selected, loading, error, synced, refresh } = useWorkspace();
</script>
<template>
  <header class="topbar flex items-center justify-between gap-6 px-6">
    <a class="brand flex items-center gap-3" href="#/"
      ><span class="brand-mark"><AtlasIcon name="map" /></span
      ><span class="brand-name">GeoPORT</span
      ><span class="brand-description">調查報告紀事</span></a
    >
    <div class="workspace-summary">
      {{ selected ? "專案工作區" : "地區專案總覽" }}
    </div>
    <div class="sync flex items-center gap-3">
      <span class="sync-label">{{
        loading ? "同步中…" : error ? "同步中斷" : `已同步 ${synced}`
      }}</span
      ><button
        class="icon-button"
        aria-label="重新同步"
        :disabled="loading"
        @click="refresh"
      >
        <AtlasIcon name="refresh" />
      </button>
    </div>
  </header>
</template>
