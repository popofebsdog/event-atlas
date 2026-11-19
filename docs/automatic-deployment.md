# GitHub 自動部署

正式流程：測試 → 建置前端 → 確認部署 Secrets → D1 migration → Worker 部署 → API 健康檢查 → GitHub Pages 發布。

本機 Cloudflare OAuth 登入不再參與這個流程。管理員金鑰及 Turnstile secret 繼續留在 Worker，不會在每次部署時重設。

## 一次性設定

在 Cloudflare 建立專用 API Token（非網站的管理員金鑰）：

- 名稱：`event-atlas-github-deploy`
- Account 權限：Workers Scripts Edit、D1 Edit、Account Settings Read。
- 帳號資源：只包含 event-atlas 所在帳號。
- 此網站使用 workers.dev，無須 Zone、DNS、其他產品及 Token 管理權限。
- 不設定到期日。Token 被撤銷或帳號權限變更時仍可能失效。

在 repository 的 Settings → Secrets and variables → Actions 加入：

- `CLOUDFLARE_API_TOKEN`：上面的 Token。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 帳號 ID。

不要將 Token 寫入程式碼或聊天。GitHub Secrets 的值無法讀回。

每次推送 main，或在 Actions 手動啟動 Deploy Event Atlas，都會執行完整流程。缺少 Secret 或後端部署失敗時不發布新版前端；既有網站繼續運作。

Token 需更換時，更新同名 GitHub Secret，再重新執行失敗的工作。
