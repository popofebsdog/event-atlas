# 獨立 Node.js 部署

目前公開站仍使用 GitHub Pages + Cloudflare Workers / D1。本後端是另一個可獨立部署的選項，啟動時建立自己的 SQLite，不會自動搬移正式站資料。

## 開發

建議 Node.js 24 LTS，最低 22.13（使用內建 `node:sqlite`）。

```bash
npm install
npm run dev
```

同時啟動 Vue／Tailwind 前端（5174）與 Node.js API（8787）。未設定管理員金鑰時，開發模式僅使用 `local-development-only-not-for-production`，可用於本機表單。請勿將開發模式公開到網路。

也可分開啟動：

```bash
npm run dev:frontend
npm run api:node
```

單獨啟動後端前需在根目錄 `.env` 設定 `ADMIN_TOKEN`；可複製 `.env.example` 填入設定。測試 Cloudflare 模擬環境時仍可使用 `npm run db:local` 與 `npm run api:dev`。

## 正式 Node.js 主機

1. 在自己的 Node.js 主機設定 `.env`，指定 `ADMIN_TOKEN`、`PUBLIC_URL=https://你的網域`、`ALLOWED_ORIGINS=https://你的網域`、`VITE_API_URL=https://你的網域`。
2. 設定 `VITE_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET`、`TURNSTILE_HOSTNAMES`，讓原有網站驗證在新網域生效。
3. 執行下列指令建置及啟動；由反向代理提供 HTTPS，`HOST` 只按主機網路需要設定。

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

前端與 API 可由同一個 Node 程序提供，API 前綴仍為 `/api`。`DB_PATH` 指向持久磁碟（預設 `data/atlas.sqlite`）。正式環境必須指定 HTTPS 公開網址，且不會因 `LOCAL_DEV=true` 或偽造 Host 而略過驗證。

SQLite 在此 Node 版本仍可能顯示 experimental 警告；部署前請固定並驗證 Node 版本。單機 SQLite 適合此平台現有的輕量使用規模，不把同一個檔案掛載給多台主機同時寫入。

## Docker 選項

提供 `Dockerfile`，前端需在建置時指定公開 API origin 與網站驗證 site key。正式金鑰只在執行時傳入環境變數，不放在映像或 Git。

```bash
docker build --build-arg VITE_API_URL=https://atlas.example.com --build-arg VITE_TURNSTILE_SITE_KEY=你的公開sitekey -t event-atlas .
docker run --env-file .env -e HOST=0.0.0.0 -p 8787:8787 -v atlas-data:/app/data event-atlas
```

容器的 `NODE_ENV` 為 production，資料存於持久 volume。外部入口仍需 HTTPS。此工作環境未啟動 Docker daemon，Docker 映像尚未在此實際建置；原生 Node.js HTTP 與前端流程會分別驗證。

## 測試

```bash
npm test
npm run test:e2e
ATLAS_API_RUNTIME=node npm run test:e2e
npm run build
```

兩組瀏覽器測試使用不同連接埠與測試資料庫，Node.js 為 8788／5175，Cloudflare 模擬為 8787／5174。只在本機建立測試專案，不對正式站寫入資料。

## 備份及搬移

Node SQLite 的 `data/` 與 Cloudflare D1 是獨立資料來源。備份 SQLite 時需使用支援 WAL 的 SQLite 備份方式，或在程序正常關閉後一併保存資料檔；不要只複製正在寫入的 `.sqlite` 而忽略 WAL。若未來切換正式服務，應先完成含照片的資料備份、還原到新主機與逐筆驗證，再修改前端 API 網址；本次不執行正式資料搬移。
