<template>
  <div>
    <div ref="container"></div>
    <p v-if="failure" class="error">驗證服務載入失敗，請重新整理頁面。</p>
    <p v-if="!sitekey" class="muted">本機測試模式；正式投稿需設定網站驗證。</p>
  </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
const emit = defineEmits(["token"]);
const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const container = ref(null),
  failure = ref(false);
let widget,
  disposed = false;
onMounted(async () => {
  if (!sitekey) return;
  try {
    if (!window.turnstile)
      await new Promise((resolve, reject) => {
        let script = document.querySelector("script[data-turnstile]");
        if (!script) {
          script = document.createElement("script");
          script.dataset.turnstile = "true";
          script.src =
            "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          document.head.append(script);
        }
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener("error", reject, { once: true });
      });
    if (!disposed)
      widget = window.turnstile.render(container.value, {
        sitekey,
        callback: (token) => emit("token", token),
        "expired-callback": () => emit("token", ""),
        "error-callback": () => {
          emit("token", "");
          failure.value = true;
        },
      });
  } catch {
    failure.value = true;
  }
});
onBeforeUnmount(() => {
  disposed = true;
  if (widget !== undefined) window.turnstile?.remove(widget);
});
</script>
