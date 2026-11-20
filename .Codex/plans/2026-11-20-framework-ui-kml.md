# Vue 3、Tailwind、Node.js 架構整理與 KML／KMZ

## 使用者目標

將目前事件地圖網站框架化，使用 Vue 3 + Tailwind CSS + Node.js；介面接近 Google／Apple 的簡潔、一致、留白與階層。地圖標註匯入及匯出改為 KML／KMZ。

實作地點 `/Users/lanyanlin/Desktop/event-atlas`，GeoPort 原專案不修改。正式站既有地區、事件、照片、標註完整保留。

## 架構與界線

- Vue 3 + Vite 保留，加入官方 Tailwind Vite 整合；採元件、composables、services、styles 分層，取代 App.vue 集中所有職責及重複樣式覆寫。
- Node.js 提供可獨立執行與部署的 HTTP API，重用現有 API 驗證與業務邏輯，避免兩套安全邏輯漂移。正式 Cloudflare Workers + D1 仍維持可用；未擅自切換正式資料到新主機。已提出後端部署選擇，目前以此建議方案進行。
- Node 使用 SQLite 與 migration，記錄、相片和標註資料不寫在前端儲存；環境檔及資料庫不提交。正式寫入仍使用管理員及網站驗證。
- KML／KMZ 交換保留點、線、面（含內環）與名稱說明；格式轉換後沿用現有幾何驗證與管理員儲存。拒絕外部載入、DTD／XXE、過大 ZIP 或解壓資料，不下載任何 NetworkLink 或附件。
- 不增加路徑分析、站網抓取、登入系統或大型 UI 套件。

## 視覺規格

白色 #ffffff、淺灰 #f5f5f7、文字 #202124、次文字 #5f6368、互動藍 #1a73e8；事件保留暖色圓形時間編號，標註為實心藍色方點與線面，形狀與標籤共同區分。

採系統無襯線字型，16px 內文、14px 操作與次要資料，12px 僅用非關鍵輔助資訊。統一 8/12/16/24/32 間距、12px 控制項／20px 主容器圓角。工具列與分段導覽可使用圓形／膠囊，圖卡保持安靜。44px 觸控目標，清楚焦點，減少動態偏好保留。桌機是清單＋地圖，手機維持地圖／時間軸／標註。

參考：Apple HIG Layout（https://developer.apple.com/design/human-interface-guidelines/layout）、Apple HIG Materials（https://developer.apple.com/design/human-interface-guidelines/materials）、Google Material（https://m3.material.io/）、Tailwind 官方 Vite 安裝（https://tailwindcss.com/docs/installation/using-vite）。借鑑階層及操作規則，不直接複製品牌畫面。

## 成功條件與步驟

- [x] 記錄正式資料快照，保留既有回歸測試基準。
- [x] 測試先行：KML／KMZ 一致性、安全界線、瀏覽器匯入匯出，Node.js 實際 HTTP CRUD、持久保存、交易與權限。
- [x] 模組化 Vue 元件與共用邏輯，App.vue 只負責畫面組合與協調。
- [x] Tailwind 實際整合並在主要介面使用，整理共同設計 token 及樣式，避免只換外觀卻保留冗餘覆寫。
- [x] Node.js API 可啟動、建庫與完整操作，更新開發指令、環境範例及 Docker／部署說明。
- [x] KML 與 KMZ 均可匯入；匯出可選 KML／KMZ，名稱、說明、幾何來回一致；不將標註變成事件。
- [x] 桌機、手機與窄螢幕的總覽、時間導覽、標註、表單、PDF／照片閱讀完成驗收。
- [x] 程式複查、測試、建置與依賴檢查通過。
- [ ] 沿用現有正式站發布，實測並比對原資料未異動。

## 分工

主代理負責 Vue 架構、Tailwind、Node.js、UI 接線與發布。既有 WebGIS 專家僅負責 KML／KMZ 格式模組和其測試（不修改元件、樣式或 package.json）；共用依賴由主代理統一處理。

## 驗證指令

`npm test`、`npm run test:e2e`、`npm run build`、`npm audit`；另增加 Node.js API 整合測試。既有 Cloudflare e2e 與 Node.js 路徑皆需測試。只在測試資料建立及刪除，正式站僅讀取驗收。

## 使用者追加的地圖簡化（2026-11-20）

左側只顯示事件時間軸與新增事件，不再顯示標註。取消地圖「瀏覽／事件」切換，新增選點從左側進入。事件為必要圖層，不提供隱藏開關；標註在地圖圖層選單中開關，管理／KML／KMZ及資訊卡在地圖側開啟。專案範圍合併到縮放控制，移除左下圖例。手機僅保留地圖／時間軸，標註管理在地圖上按需出現。

使用者已確認保留正式站、額外加入可獨立部署 Node.js 的建議方案。

## 進度

已完成 Vue 元件／workspace與map composables／services／styles 分層、Tailwind正式整合、共用 API 與兩個runtime入口、SQLite migration/batch與持久保存。KML模組16項測試與瀏覽器交換通過，Node／Worker共69項自動測試通過。簡化地圖與標註流程通過；完整瀏覽器測試抓到閱讀區兩個ref遺漏與Leaflet tooltip淡出短暫重複，均修正且tour三組回歸轉綠。後續標註同步race與最後整套、畫面驗收及發布。Docker daemon目前未啟動，提供部署檔但未宣稱映像已建置。

## 外部資料圖層追加需求

使用者明確區分底圖（基本／衛星，互斥）與資料圖層（必要事件、可選標註），並要求可接地質圖等外部 API。已查證官方 GSMMA 1:50,000 臺灣地質圖 WMS：固定 HTTPS endpoint、1.1.1、WMS/50K_Geomap_strata、僅 EPSG:4326。瀏覽器直接載入可行，但無 CORS，不啟用 anonymous crossOrigin；沒有可用圖例 URL，不造假。

- [x] 新增可擴充外部 WMS／XYZ 圖層設定，來源與比例尺明示。
- [x] 底圖互斥、資料圖層可同時套疊，事件固定，標註與地質圖預設關閉。
- [x] 外部圖層有不透明度、載入／錯誤／重試；不寫入事件或標註，不納入 KML 匯出。
- [ ] 真實官方服務、測試用中斷恢復、手機面板與部署後驗證。

圖層控制再整理為「底圖」與「資料圖層」兩個fieldset。所有外部圖層在資料pane 300，低於標註與事件；地圖內建立獨立stacking context，避免原生縮放控制蓋住浮動面板。

最終狀態：所有程式功能完成，雙runtime各27組操作與69項單元已通過。新增外部服務持續pending的兩個逾時／重試回歸已由紅轉綠（含原外部恢復測試共3個通過）；雙runtime各29組整套已全部通過。npm run dev實際雙服務啟動／讀取已驗證並關閉smoke服務。CWA原PDF在預設與Node安全transport皆回206及%PDF-簽章。最後剩提交、發布與正式站只讀驗證及資料比對。
