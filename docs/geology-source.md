# 官方地質圖來源與驗證

查核日期：2026-11-20（臺灣時間）。僅查閱官方介接頁與線上 WMS 回應，未下載說明附件、QGIS 專案或原始圖資。

## 已確認的服務

[地礦中心官方介接說明](https://geomap.gsmma.gov.tw/gsb108-1/list_service.cfm)公告此 HTTPS MapGuide WMS，並列出五萬分之一臺灣地質圖。實際 [GetCapabilities 1.1.1](https://geomap.gsmma.gov.tw/mapguide/mapagent/mapagent.fcgi?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1)回傳 61 個發布圖層，包含以下項目。

| 項目 | 已驗證值 |
| --- | --- |
| 服務網址 | `https://geomap.gsmma.gov.tw/mapguide/mapagent/mapagent.fcgi` |
| 圖層 NAME | `WMS/50K_Geomap_strata` |
| 官方圖層標題 | `1/50,000_臺灣地質圖-地層` |
| 資料比例尺 | 1:50,000；放大畫面不會提高原始圖資精度 |
| 已驗證 WMS 版本 | `1.1.1`（官方操作說明使用 `1.0.0`，兩者能力回應均可取得） |
| 已公告且驗證可用的座標系統 | `EPSG:4326` |
| 影像格式 | `image/png`，`TRANSPARENT=TRUE` |
| 預設樣式 | `STYLES=`（空字串） |
| 來源標示 | 經濟部地質調查及礦業管理中心（GSMMA） |
| 服務憑證 | 不需 API key、帳號或密碼 |
| 圖例網址 | 未取得可驗證的公開圖例 URL，設定不提供 `legendUrl` |

此圖層是地層色塊，並非活動斷層圖。資料來源比例尺不代表即時地質、工程設計或地質災害判定結果。

## GetMap 實測

能力回應的圖層經緯度範圍為 `minx=117, miny=21, maxx=123, maxy=27`。這是服務公告範圍，不代表其中所有海域或圖幅都有內容。

採用臺灣中部的 `BBOX=120.5,23.7,121.2,24.4`（順序為西、南、東、北），[此 GetMap 請求](https://geomap.gsmma.gov.tw/mapguide/mapagent/mapagent.fcgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=WMS%2F50K_Geomap_strata&STYLES=&SRS=EPSG%3A4326&BBOX=120.5%2C23.7%2C121.2%2C24.4&WIDTH=512&HEIGHT=512&FORMAT=image%2Fpng&TRANSPARENT=TRUE)實測結果：

- HTTP `200`，`Content-Type: image/png`，PNG 檔案 217,213 bytes。
- 解碼影像為 512 × 512；262,144 個像素中有 227,590 個非透明像素，包含 19,191 種 RGBA 值，確認不是空白透明圖。
- 從本機前端的 Chromium 直接以 `<img>` 載入，`naturalWidth=512`、`naturalHeight=512`。
- 同範圍改用 `SRS=EPSG:3857` 時，伺服器雖回 HTTP `200`，內容卻是 `application/vnd.ogc.se_xml`，錯誤代碼為 `InvalidSRS`。不能把 HTTP 200 當成成功出圖。

可重現的必要參數：

```text
SERVICE=WMS
REQUEST=GetMap
VERSION=1.1.1
LAYERS=WMS/50K_Geomap_strata
STYLES=
SRS=EPSG:4326
BBOX=120.5,23.7,121.2,24.4
WIDTH=512
HEIGHT=512
FORMAT=image/png
TRANSPARENT=TRUE
```

## 前端整合注意事項

- 使用 `src/config/externalLayers.js` 的資料圖層設定。它是可關閉的外部覆蓋圖層，與基本／衛星底圖的互斥選擇分開。
- 將設定中的 `params.crs: 'EPSG:4326'` 轉為 Leaflet 的 `L.CRS.EPSG4326`；不要原封不動把字串當成 Leaflet CRS 物件。現有地圖可維持 EPSG:3857，WMS 單獨指定此 CRS。
- 固定 WMS `1.1.1`，讓 BBOX 使用經度、緯度順序。不要逕改為 WMS 1.3.0 的 EPSG:4326 軸序。
- GetCapabilities 的 `OnlineResource` 錯列內部 `http://localhost:8008/`。實際請求必須沿用官方公告的 HTTPS 網址，不採用這個內部連結。
- 實測影像未提供 `Access-Control-Allow-Origin`，但一般跨來源 `<img>` 可以顯示。Leaflet 不設定 `crossOrigin`，不使用 `crossOrigin: 'anonymous'`，也不依賴 canvas 讀回此圖層像素。
- 能力回應沒有 `LegendURL` 或 `GetLegendGraphic` 宣告。實測 `REQUEST=GetLegendGraphic&VERSION=1.1.1&LAYER=WMS/50K_Geomap_strata&FORMAT=image/png` 回 HTTP `559`、`text/html` 錯誤，故不顯示虛構圖例連結。
- 外部服務可能維護或失效。保留來源連結、載入與失敗提示及透明度控制；不要因外部圖層失敗而隱藏事件或底圖。

本次只驗證此官方 WMS；未宣稱存在可用的對應 WMTS／XYZ endpoint，也未提供未驗證的替代網址。
