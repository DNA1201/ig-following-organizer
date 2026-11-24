# PROJECT_MEMORY — Instagram 追蹤整理助手 (IG Following Organizer)

## 1. 產品定位與核心目標
- **目標**：讓使用者以最少人工操作，安全、低成本地整理 Instagram 追蹤名單（預估 500～2,000 個帳號），同時兼顧**電腦與手機重度使用**。
- **核心原則（鐵律）**：
  1. **零密碼、零爬蟲、零自動退追**：僅讀取 Instagram 官方下載的 `.zip` / `.json`，所有決策由使用者親自回 IG 執行或搭配匯出清單操作。
  2. **100% 本機資料隱私**：所有名單與進度只存於瀏覽器 `IndexedDB`，絕不上傳至任何伺服器或 GitHub。
  3. **誠實分類邊界**：輔助標籤僅依據可驗證資料（互追狀態、追蹤時間、帳號字面關鍵字）產生，絕不猜測私人關係或興趣。
  4. **保護原始資料與防誤刪**：原始匯出資料唯讀保存；互追好友預設保護（可一鍵保留，移至考慮取消需二次確認）。

## 2. 技術架構（v1.0）
- **純前端零建置（Vanilla HTML / CSS / ES Modules）**：無需 Node.js 或後端伺服器，直接開啟或透過 GitHub Pages 即可於電腦與手機使用。
- **模組職責**：
  - `js/zip-reader.js`：免依賴瀏覽器原生 `DecompressionStream('deflate-raw')` ZIP 解析器。
  - `js/ig-parser.js`：支援官方 `following.json` 與多個 `followers_*.json` 解析與互追比對。
  - `js/storage.js`：`IndexedDB` 持久化層（支援 2,000+ 筆資料流暢存取）。
  - `js/exporter.js`：UTF-8 BOM `.csv`、Excel `.xls`（含可點擊 IG 超連結）與跨裝置 `.json` 進度備份。
  - `js/app.js`：漏斗總覽、極速審核（單一重用視窗 `ig_preview` + 鍵盤快捷鍵 + 手機滑卡）、清單批次管理與復原堆疊。

## 3. 安全與去敏規範
- `.gitignore` 已強制排除所有 `*.zip`、`following*.json`、`followers*.json`、`ig-organizer-backup*.json`、`*.csv`、`*.xls`。
- 記憶檔與測試資料嚴禁寫入任何真實 IG 帳號或個人資料。
