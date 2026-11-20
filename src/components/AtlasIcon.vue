<script setup>
defineProps({ name: { type: String, default: "map" } });
const paths = {
  map: "M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm6-2v16m6-14v16",
  layers: "M12 3L2 8l10 5 10-5-10-5zm-10 9l10 5 10-5M2 16l10 5 10-5",
  refresh: "M20 8a8 8 0 10.5 7M20 3v5h-5",
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  timeline: "M6 4v16m5-14h9M11 12h9M11 18h9",
  check: "M5 12l4 4 10-10",
};
</script>
<template>
  <svg
    class="atlas-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.map" />
  </svg>
</template>
