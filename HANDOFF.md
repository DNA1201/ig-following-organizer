# HANDOFF — 最新交接摘要

- **最後更新時間**：2026-11-24
- **目前版本**：v1.0 MVP（可操作第一版）
- **專案本機路徑**：`C:\Users\leo38\.gemini\antigravity\scratch\ig-following-organizer`（註：因 Windows 權限限制無法直接寫入 D 槽根目錄，使用者可自行將整個資料夾移至 `D:\ig-following-organizer`）

## 已實作狀態
### 已實作並完成程式碼建置
- 官方 `.zip` / `.json`（`following.json` + `followers_*.json`）純本機解析與互追比對
- 漏斗總覽（統計卡片、一鍵保留互追、防誤刪與自動載入下一筆設定）
- 極速審核（電腦鍵盤快捷鍵 `1/2/3/4/Space/Z` + 單一重用 IG 視窗 `ig_preview` + 手機四向滑卡手勢）
- 清單與批次管理（即時搜尋、多條件篩選、排序、全選本頁/全選符合篩選、批次標記、50 筆分頁）
- 匯出 UTF-8 BOM `.csv`、Excel `.xls`（含可點擊連結）、跨裝置進度備份 `.json` 與還原
- 內建 20 筆去敏示範資料 + `sample-data/` 官方格式測試檔

### 尚未完成 / 待使用者協助
- **建立遠端 GitHub Repo 與推送**：本機目前未安裝 `git` 與 `gh` CLI（環境檢查回傳找不到指令），待安裝 Git 或直接於 GitHub 網頁建立新 Repo（例如 `ig-following-organizer`）並上傳本資料夾，即可同時開啟 GitHub Pages 供手機使用。
