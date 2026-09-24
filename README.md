# 地點紀事 Event Atlas

獨立於 GeoPort 的公開共筆 WebGIS。Vue + Leaflet 前端部署到 GitHub Pages，Cloudflare Workers + D1 儲存共用資料。選點建立地區，加入不同時間的事件及網頁網址，從地圖與時間軸閱讀原網站。

## 本機啟動

需要 Node.js 20.19+（建議 22 LTS）。

```sh
npm install
npm run db:local
```

建立 `.dev.vars`（不要提交），內容：

```dotenv
LOCAL_DEV=true
ADMIN_TOKEN=replace-with-a-long-random-local-token
```

分別開兩個終端：

```sh
npm run api:dev
npm run dev
```

瀏覽 http://localhost:5174 。本機 D1 是真正共用的測試資料庫；不是 localStorage 假資料。兩個瀏覽器視窗可互相看到新增內容，每 15 秒更新。分頁隱藏時暫停更新以節省額度。無資料時正常顯示空白狀態。

## 免費部署

部署需要你自己的 GitHub 與 Cloudflare 帳號。這個專案不會自動建立付費服務。不要升級 Workers 付費方案。免費額度與規則以服務商公告為準；超限可能無法讀寫，不保證服務水準。

1. 在 Cloudflare 登入，建立 D1：

```sh
npx wrangler login
npx wrangler d1 create event-atlas
```

2. 把回傳 database_id 填到 `wrangler.toml`。修改 `ALLOWED_ORIGINS` 為 GitHub Pages 的 **origin**，例如 `https://YOURNAME.github.io`（不能包含 repo 路徑）。
3. 在 Cloudflare 建立免費 Turnstile widget，允許 `YOURNAME.github.io`。把同一 hostname 填入 `TURNSTILE_HOSTNAMES`。前端 site key 是公開值；secret 只能放 Worker secret。

```sh
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put ADMIN_TOKEN
npx wrangler d1 migrations apply DB --remote
npm run api:deploy
```

`ADMIN_TOKEN` 使用長隨機值，妥善保存；正式服務不要設定 `LOCAL_DEV`。即使誤設，非 localhost 網址仍要求 Turnstile。

4. 建立 `.env.production`：

```dotenv
VITE_API_URL=https://event-atlas-api.YOUR-SUBDOMAIN.workers.dev
VITE_TURNSTILE_SITE_KEY=YOUR-PUBLIC-SITE-KEY
```

5. 執行 `npm run build`，將 **dist 的內容**部署到獨立 GitHub repository 的 Pages（根路徑）。也可使用附帶 workflow：將 `deploy/github-pages.yml` 複製為新 repo 的 `.github/workflows/pages.yml`，在 repository Variables 設定 `VITE_API_URL`、`VITE_TURNSTILE_SITE_KEY`，並將 Settings → Pages → Source 設為 GitHub Actions。相對資源路徑支援 `/repo/` 子目錄。

6. 驗證：無痕視窗 A 建立地區及事件；視窗 B 在 15 秒內看到資料。點選事件直接載入內嵌網頁，介面不提供另開原網站或下載操作。來源若禁止 iframe，仍無法在平台內呈現。

## 功能與邊界

- WGS84 經緯度或 TWD97/TM2 121（EPSG:3826）輸入，統一儲存 WGS84。
- 地區是一個座標點；同一地區可包含多個時間事件，不自動把鄰近地點合併。
- 事件時間以臺灣 UTC+8 輸入和顯示，資料庫儲存 UTC。
- 公開可讀，完成 Turnstile 後可投稿；地區與事件可在介面編輯、刪除，需輸入管理員金鑰。金鑰只留在當次頁面的記憶體，不寫入瀏覽器儲存。
- 管理員透過 API 刪除事件或地區。刪除地區會連同事件刪除，操作前先匯出備份。
- 外部 URL 僅接受 HTTPS；iframe 使用 sandbox，不會伺服器端抓取網址。原站 CSP/X-Frame-Options 或第三方 Cookie 設定可能阻止預覽。沒有宣稱可自動判斷內嵌成功。
- 「匯出紀錄」是地區及事件 JSON 備份，**不等於事件網址的網頁備份**。
- 地圖底圖和字型需要網路；不提供離線地圖磚下載。OSM 底圖用於初期低流量，需遵守其 tile usage policy。
- Turnstile 降低機器投稿，並非完整防垃圾系統。公開上線後由管理員處理不當內容。不要放私人資料。

管理員刪除 API：`DELETE /api/events/:id` 或 `DELETE /api/projects/:id`，搭配 `Authorization: Bearer <ADMIN_TOKEN>`。管理密鑰不放前端、不提交 git。

管理員編輯 API：`PUT /api/events/:id` 或 `PUT /api/projects/:id`，送出與新增相同的完整欄位並搭配上述 Authorization。不存在的紀錄回傳 404。介面提供編輯表單及刪除確認；刪除地區會連同所屬事件移除。本機測試使用 `.dev.vars` 的 `ADMIN_TOKEN`；部署時必須使用自訂強隨機金鑰。

## 本機下載事件網頁

安裝 wget 與 zip（macOS 可用 Homebrew 安裝 wget；zip 通常已內建），在本機：

```sh
npm run archive
```

依提示貼上事件網址，輸出 `archives/page-xxxx.zip`，保留原始下載資料夾。只下載該頁及被 HTML/CSS 引用的資源，不遞迴鏡像整站。最長三分鐘、每秒 2 MB；可能仍產生較大檔案。中斷或資源失敗會保留可得部分並標示狀態。

這是公開靜態資源的盡力備份；JavaScript 動態載入內容、地圖磚、影片、登入內容及原始 Codex/Vue 專案不保證取得。請只備份你有權保存的內容。工具在你電腦執行，不產生雲端擷取費；目前沒有網頁一鍵遠端啟動本機工具。

## 驗證與備份

```sh
npm test
npm run build
npm audit
npx wrangler d1 export DB --remote --output=backup.sql
```

資料備份請存到平台以外的位置。免費額度可查看 Cloudflare dashboard；大量訪客下定期輪詢仍會消耗請求與 D1 讀取額度。

官方文件：
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://operations.osmfoundation.org/policies/tiles/
