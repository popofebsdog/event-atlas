# 照片事件與測試

- 事件網址改為選填，亦可只填時間、名稱、敘述。
- 可上傳最多 5 張 JPEG／PNG／WebP。原始檔每張 10 MB 內，瀏覽器縮圖至最長邊 1600 像素、重新編碼 JPEG（移除原始 EXIF）；每張上傳資料最多 1 MiB。
- 圖片存於既有 D1 資料庫，刪除事件／地區時一併刪除。維持免費服務，不另開 R2。照片會使用 D1 免費儲存額度，適合少量調查紀錄。
- 新增／修改照片沿用管理員金鑰。公開事件的照片可公開讀取。舊版客戶端未送 photos 時，修改事件會保留既有照片。
- 公開圖片網址改以圖片呈現。Google Drive 檔案分享網址轉為 preview，保留 resourcekey；擁有者仍須自行開啟檔案分享權限。外部網站限制內嵌時平台不能解除限制。
- 匯出 JSON 包含照片 ID，可搭配 `/api/photos/:id` 讀取；不是照片檔案的離線備份。

## 驗證

請使用 Node.js 22.12 以上。建立忽略版本控制的 `.dev.vars`：

```
LOCAL_DEV=true
ADMIN_TOKEN=local-development-only-not-for-production
```

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Playwright 自動啟動本機 API、套用本機 migration 與前端。測試涵蓋實際照片寫入及讀回、權限、照片歸屬、編輯保留／替換／移除、事件刪除後清理、無網址送出，以及桌面和手機照片呈現。測試資料最後會刪除。GitHub Pages 發布流程也會執行這些檢查。

正式部署先套用新增資料表 migration（不改動既有資料），再部署 Worker，最後發布前端。
