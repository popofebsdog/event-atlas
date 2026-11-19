# Google Drive 分享權限實測

2026-11-19 以 Google Drive 連接器新增「GeoPORT 分享權限測試.png」，內容為合成測試圖，無個人資料。沒有調整其他既有檔案。

測試檔：https://drive.google.com/file/d/1CCYMx5KGTr42KmpE4hRPcvsZca6V62Aj/view

## 實際服務驗證

1. 連接器讀回初始權限，只有 owner。
2. 用另一個 Google 帳戶透過瀏覽器開啟 preview，實際顯示「需要存取權」。
3. 在本機 GeoPORT 建立測試事件，貼上同一個檔案的原始分享網址；事件 iframe 同樣顯示「需要存取權」，並保留分享設定指引。
4. 在檔案擁有者的瀏覽器分享對話框，改成「知道連結的任何人／檢視者」。
5. 連接器讀回確認 `type=anyone, role=reader, allowFileDiscovery=false`。
6. 另一個 Google 帳戶可看到圖片，GeoPORT 事件 iframe 也能顯示圖片。實測「重新載入預覽」會重新讀取檔案。

測試後留下這張公開唯讀的合成圖片，方便再次驗證；本機測試地區與事件完成後移除，沒有加入正式資料庫。

## 本次修正與自動回歸

- 支援 Google Drive `/file/u/0/d/...` 等帶帳戶編號的網址，統一改為 `/file/d/.../preview`；保留 resourcekey。
- 新增 Drive 預覽重新載入按鈕，修改分享權限後無須重建事件。
- `tests/browser/drive.spec.js` 使用受控模擬回應驗證「無權限 → 更新分享 → 重新載入 → 顯示內容」及直接圖片網址，不依賴真實 Drive 網路或帳號；實際服務的人工瀏覽器測試與此回歸測試分開記錄。
- 私人檔案仍受 Google Drive 原有權限控制，平台不能解除權限。沒有以 iframe load 事件宣稱已確認檔案可讀。
