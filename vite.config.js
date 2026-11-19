import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {include:['pdfjs-dist']},
  base: "./",
  server: { port: 5174 },
});
