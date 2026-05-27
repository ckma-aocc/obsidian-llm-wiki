# LLM Wiki Plugin — 完整使用者操作手冊

> 版本對應：2026-05-26 實作版  
> 適用環境：Obsidian v1.5+，Windows / macOS / Linux

---

## 目錄

1. [插件簡介](#1-插件簡介)
2. [安裝與首次啟動](#2-安裝與首次啟動)
3. [Vault 目錄結構](#3-vault-目錄結構)
4. [插件設定說明（Settings）](#4-插件設定說明settings)
5. [Chat 介面操作](#5-chat-介面操作)
6. [Session 管理](#6-session-管理)
7. [Slash 指令完整說明](#7-slash-指令完整說明)
8. [Ingest 攝取流程說明](#8-ingest-攝取流程說明)
9. [Save to Wiki 儲存說明](#9-save-to-wiki-儲存說明)
10. [Lint 健檢說明](#10-lint-健檢說明)
11. [關聯圖（Graph Relations）說明](#11-關聯圖graph-relations說明)
12. [WIKI_SCHEMA.md 設定檔說明](#12-wiki_schemamd-設定檔說明)
13. [index.md 索引檔說明](#13-indexmd-索引檔說明)
14. [log.md 操作記錄說明](#14-logmd-操作記錄說明)
15. [.llm-wiki 內部目錄說明](#15-llm-wiki-內部目錄說明)
16. [自動攝取（Auto Ingest）說明](#16-自動攝取auto-ingest說明)
17. [常見問題 FAQ](#17-常見問題-faq)

---

## 1. 插件簡介

**Obsidian LLM Wiki** 是一個 Obsidian 插件，讓 LLM（大型語言模型）幫你持續維護一套結構化的 wiki 知識庫。

### 核心概念

| 角色 | 職責 |
| --- | --- |
| **raw/**（原始資料夾） | 存放你的原始文件，插件**只讀不寫**這個資料夾 |
| **wiki/**（知識庫） | LLM 負責建立、更新、維護的結構化頁面 |
| **LLM** | 讀取原始文件後自動拆分為來源頁、實體頁、概念頁，並建立頁面間的語意關聯 |
| **使用者** | 提供原始素材、下達問題或指令，決定何時儲存或整理 wiki |

### 主要功能

- **Ingest（攝取）**：LLM 讀取原始文件，自動建立 wiki 頁面、索引、關聯
- **Query（查詢）**：在 chat 提問，LLM 以 wiki 為知識庫合成回答
- **Save to Wiki（儲存）**：把 LLM 的回答存成新 wiki 頁面
- **Lint（健檢）**：LLM 找出孤立頁、壞連結，並給出改善建議
- **Session（對話管理）**：多個獨立對話，可切換、改名、摘要壓縮
- **Relations（關聯圖）**：自動在 YAML frontmatter 寫入頁面語意關聯，可在 Graph View 直接看到

---

## 2. 安裝與首次啟動

### 安裝步驟

1. 把 `obsidian-llm-wiki` 插件資料夾（含 `main.js`、`manifest.json`、`styles.css`）複製到你的 Vault 的 `.obsidian/plugins/obsidian-llm-wiki/` 目錄。
2. 在 Obsidian 設定 → Community Plugins，找到 **Obsidian LLM Wiki** 並啟用。

### 首次啟動

啟用後，插件會自動：

1. 建立 `raw/` 資料夾（若不存在）
2. 建立 `wiki/` 資料夾及四個子目錄：`sources/`、`entities/`、`concepts/`、`analyses/`
3. 建立 `wiki/index.md`（空索引）與 `wiki/log.md`（空記錄）
4. 建立 `.llm-wiki/sessions/` 目錄用於儲存 session 資料

### 開啟 Chat 介面

有三種方式：

| 方式 | 操作 |
| --- | --- |
| Ribbon Icon | 點擊左側欄的 🤖 機器人圖示 |
| Command Palette | 按 `Ctrl+P`，搜尋「Obsidian LLM Wiki: Open Chat」 |
| 指令 | 任何時候都可在設定完成後使用上述兩種方式 |

---

## 3. Vault 目錄結構

```
你的 Vault/
├── raw/                         ← 原始文件（你負責放，插件只讀）
│   ├── articles/
│   │   └── api-design.md
│   ├── papers/
│   │   └── rest-principles.pdf
│   └── screenshots/
│       └── diagram.png
│
├── wiki/                        ← 插件維護的知識庫
│   ├── index.md                 ← 自動產生的全域索引
│   ├── log.md                   ← 所有操作的 append-only 記錄
│   ├── sources/                 ← 每個原始文件的摘要頁
│   │   └── api-design.md
│   ├── entities/                ← 實體頁（人物、組織、產品、服務等）
│   │   └── REST.md
│   ├── concepts/                ← 概念頁（術語、技術、理論等）
│   │   └── HTTP Methods.md
│   └── analyses/                ← 分析頁（問答、比較分析等）
│       └── REST vs GraphQL 2026-05-26-10-30-00.md
│
├── WIKI_SCHEMA.md               ← （可選）自訂 schema 覆寫檔
│
└── .obsidian/
    └── plugins/
        └── obsidian-llm-wiki/
            └── data.json        ← 插件設定（含 provider 設定、session 資訊）
│
└── .llm-wiki/                   ← 插件內部資料（非 wiki 內容）
    ├── sessions/                ← Session 對話資料
    │   ├── sessions-index.json  ← Session 索引
    │   └── session-xxxx.json   ← 每個 session 的完整對話
    └── ingest-hashes.json       ← 攝取過的檔案雜湊快取（避免重複攝取）
```

### 各目錄用途說明

| 目錄 / 檔案 | 用途 | 誰負責寫入 |
| --- | --- | --- |
| `raw/` | 原始素材，保持唯讀 | 使用者 |
| `wiki/sources/` | 每份原始文件的摘要頁，對應一個 source file | 插件（Ingest） |
| `wiki/entities/` | 實體頁：人名、組織、產品、API 等具體事物 | 插件（Ingest） |
| `wiki/concepts/` | 概念頁：技術術語、方法論、抽象概念等 | 插件（Ingest） |
| `wiki/analyses/` | 分析頁：使用者提問後儲存的問答或比較分析 | 插件（Save to Wiki / /save） |
| `wiki/index.md` | 全域索引，按類別列出所有 wiki 頁面的連結 | 插件（每次 Ingest/Save/Reindex 後更新） |
| `wiki/log.md` | Append-only 操作記錄，記錄每次 ingest/query/save/lint 的詳細資訊 | 插件（自動） |
| `WIKI_SCHEMA.md` | 覆寫預設 schema 的設定，可自訂頁面類型和關係類型 | 使用者（可選） |
| `.llm-wiki/sessions/` | 所有 session 的對話記錄，插件重啟後仍保留 | 插件（自動） |
| `.llm-wiki/ingest-hashes.json` | 記錄已攝取檔案的內容雜湊，避免內容未變時重複攝取 | 插件（自動） |

---

## 4. 插件設定說明（Settings）

在 Obsidian **Settings → LLM Wiki** 開啟設定頁。

### 4.1 Provider 設定

插件支援多個 LLM Provider，**每個 Provider 各自儲存一組設定**（API Key、Model、Base URL 互不影響）。

| 欄位 | 說明 |
| --- | --- |
| **Provider** | 選擇要使用的 Provider：OpenAI / Anthropic / Ollama |

切換 Provider 後，下方三個欄位會自動帶出該 Provider 的上次設定值。

#### Provider 各自的設定欄位

| 欄位 | 說明 | 備註 |
| --- | --- | --- |
| **API Key** | 該 Provider 的 API 金鑰 | Ollama 本地使用可留空 |
| **Model** | 使用的模型名稱或 Deployment Name | 見各 Provider 預設值 |
| **Base URL** | API 端點 URL 覆寫（可選） | Ollama 預設 `http://127.0.0.1:11434/api/chat` |
| **Azure OpenAI API Version** | 僅 OpenAI Provider 且 Base URL 為 Azure 端點時顯示 | 預設 `2024-10-21` |

#### 各 Provider 預設 Model

| Provider | 預設 Model |
| --- | --- |
| OpenAI | `gpt-5.4-mini` |
| Anthropic | `claude-sonnet-4-6` |
| Ollama | `llama3.1` |
| Google Gemini | `gemini-2.5-flash` |

#### Azure OpenAI 設定方式

1. Provider 選 **OpenAI**
2. API Key 填入 Azure OpenAI 的 `api-key`
3. Base URL 填入 Azure 端點，例如 `https://my-resource.openai.azure.com`
4. Model 填入 Deployment Name（如 `my-gpt4o-deployment`）
5. Azure API Version 填入對應版本（預設 `2024-10-21`）

#### Google Gemini 設定方式

1. Provider 選 **Google Gemini**
2. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 取得 API Key
3. API Key 填入剛才取得的金鑰
4. Model 填入模型名稱（預設 `gemini-2.5-flash`，可選填其他版本，如 `gemini-2.5-pro`、`gemini-2.0-flash`）
5. Base URL 留空（使用預設 `https://generativelanguage.googleapis.com`）；有代理時可自訂

> **Gemini 常用模型名稱**：
> - `gemini-2.5-flash`（預設，速度與品質平衡）
> - `gemini-2.5-pro`（高能力）
> - `gemini-2.0-flash`（相容備用）

### 4.2 路徑設定

| 欄位 | 預設值 | 說明 |
| --- | --- | --- |
| **Raw sources path** | `raw` | 原始文件資料夾路徑（相對於 Vault 根目錄） |
| **Wiki path** | `wiki` | wiki 知識庫根目錄路徑 |
| **Sessions path** | `.llm-wiki/sessions` | Session 對話資料儲存路徑 |

### 4.3 Wiki Schema 設定

| 欄位 | 預設值 | 說明 |
| --- | --- | --- |
| **Use WIKI_SCHEMA.md** | 開啟 | 開啟時會讀取 Vault 根目錄的 `WIKI_SCHEMA.md` 覆寫部分 schema 設定 |
| **System prompt override** | （預設提示詞） | 覆寫傳給 LLM 的系統提示詞 |
| **Relation types override** | （空） | 以逗號分隔，覆寫允許的關係類型。留空使用預設值 |

### 4.4 Ingest 設定

| 欄位 | 預設值 | 說明 |
| --- | --- | --- |
| **Auto ingest** | 開啟 | 偵測到 `raw/` 資料夾新增支援格式檔案時，自動觸發攝取 |

> **注意**：Auto Ingest 只偵測**新增**的檔案，不偵測已存在檔案的修改。若檔案已修改，請使用 `/reingest` 指令手動重新攝取。

### 4.5 Lint 排程設定

| 欄位 | 預設值 | 說明 |
| --- | --- | --- |
| **Lint schedule** | Off | Off / Daily（每天）/ Weekly（每週）自動執行 wiki 健檢 |
| **Lint time (HH:mm)** | `09:00` | 每天或每週的執行時間，格式 `HH:mm`（24 小時制） |
| **Catch up missed lint on startup** | 關閉 | 開啟時，若排程時間點在 Obsidian 關閉期間被跳過，下次啟動時會補跑一次 |

### 4.6 Context 設定

| 欄位 | 預設值 | 說明 |
| --- | --- | --- |
| **Context window size** | `20` | 每次 LLM 呼叫帶入的最新對話則數（不含 session summary） |

---

## 5. Chat 介面操作

### 5.1 介面佈局

```
┌──────────────────────────────────────────┐
│ [Session Selector ▼] [+ New] [Rename] [Summarize Session] │  ← Toolbar
├──────────────────────────────────────────┤
│                                          │
│   [Session Summary]（若有，可折疊）          │
│                                          │
│   User: 什麼是 JWT？                       │
│                                          │
│   Assistant: JWT（JSON Web Token）是...    │
│   [Save to Wiki]                         │  ← 每則 Assistant 回覆下方
│                                          │
│   User: 那 OAuth 呢？                      │
│                                          │
├──────────────────────────────────────────┤
│ [輸入框...                              ] │  ← Input Bar
│ [Send]                                   │
├──────────────────────────────────────────┤
│ 狀態欄：Ingesting wiki/sources/jwt.md...  │  ← Status Bar
└──────────────────────────────────────────┘
```

### 5.2 發送訊息

- 在輸入框輸入問題後按 **Enter** 或點 **Send** 送出
- 使用 **Shift + Enter** 換行，不會送出
- 回覆會以串流（streaming）方式逐字顯示

### 5.3 Save to Wiki 按鈕

每則 Assistant 回覆下方都有 **Save to Wiki** 按鈕：

1. 點擊按鈕後，**立即儲存**該則回覆內容到 `wiki/analyses/`
2. 頁面名稱**自動產生**（取回覆第一行有意義的文字 + 時間戳），不需要手動輸入標題
3. 儲存完成後顯示 `Saved to wiki: <標題>` 通知
4. 同時自動執行語意關聯分析，更新新頁面的 YAML frontmatter
5. 操作結果記錄到 `wiki/log.md`

> **提示**：若想自訂標題，請改用 `/save <標題>` 指令。

### 5.4 Toolbar 按鈕

| 按鈕 | 功能 |
| --- | --- |
| **Session Selector（下拉）** | 點擊展開 Session 清單，選擇切換到其他 Session |
| **+ New Session** | 建立全新的空白 Session |
| **Rename** | 重新命名目前 Session（會彈出輸入框） |
| **Summarize Session** | 請 LLM 摘要目前 Session 的所有對話，壓縮為 Summary |

### 5.5 Status Bar（狀態欄）

位於介面最底部，顯示目前操作的即時進度，例如：

- `Reading source...`（攝取時讀取原始文件）
- `Generating wiki content...`（LLM 產生頁面內容）
- `Updating wiki page...`（寫入 wiki 頁面）
- `Thinking...`（LLM 查詢思考中）
- `Summarizing...`（Session 摘要處理中）

操作完成後狀態欄會清空。

---

## 6. Session 管理

### 6.1 Session 概念

每次對話在一個 **Session** 中進行。所有 Session 都會**永久保存**，關閉 Obsidian 後仍然保留。

### 6.2 建立新 Session

點擊 Toolbar 的 **+ New Session**。新 Session 標題預設為「New Session」。

第一則對話結束後，LLM 會**自動產生 3-6 個字的簡短標題**，取代「New Session」。

### 6.3 切換 Session

1. 點擊 Toolbar 的 **Session Selector 下拉按鈕**，展開 Session 清單
2. 清單依最後更新時間倒序排列（最新在最上方）
3. 點擊目標 Session 名稱即可切換
4. 切換後，對話區會顯示該 Session 的完整歷史對話

### 6.4 改名 Session

**方式一：Rename 按鈕**
1. 確認已切換到要改名的 Session
2. 點擊 Toolbar 的 **Rename** 按鈕
3. 在彈出的輸入框中輸入新名稱，按 Enter 確認（或按 Escape / Cancel 取消）

**方式二：雙擊 Session 清單項目**
1. 展開 Session Selector
2. 在目標 Session 名稱上**雙擊**，會進入改名流程

### 6.5 刪除 Session

1. 展開 Session Selector
2. 每個 Session 項目右側有一個 **X** 按鈕
3. 點擊 X 後會要求確認，確認後永久刪除
4. 若刪除的是目前 Session，會自動切換到最新的其他 Session；若沒有其他 Session，則自動建立新 Session

### 6.6 Session Summary（摘要壓縮）

當對話歷史很長時，可以使用摘要壓縮減少傳給 LLM 的 token 數：

1. 點擊 Toolbar 的 **Summarize Session**
2. LLM 會將目前 Session 所有對話壓縮為一段 Summary
3. Summary 會顯示在對話區最頂部的折疊區塊「Session Summary」
4. 後續對話的 context 為：**系統提示詞 + Summary + 最新 N 則對話**（N = Context Window Size 設定值）

> **提示**：摘要壓縮後，舊對話仍然保留，只是 LLM 呼叫時不會全部帶入。也可用 `/summarize` 指令觸發相同效果。

### 6.7 Session 資料儲存

Session 資料儲存在 `.llm-wiki/sessions/` 目錄：

- `sessions-index.json`：記錄所有 Session 的 ID、標題、最後更新時間
- `session-<id>.json`：每個 Session 的完整對話記錄（含 Summary、所有訊息）

每個 Session 最多保留 `maxMessagesPerSession`（預設 500）則訊息，超過時會裁切最舊的訊息。

---

## 7. Slash 指令完整說明

在 Chat 的輸入框輸入 `/` 開頭的指令可執行特定操作，也可用 `/help` 隨時查看指令清單。

### 完整指令清單

| 指令 | 說明 | 範例 |
| --- | --- | --- |
| `/help` | 在 chat 顯示完整指令清單與用法 | `/help` |
| `/ingest <path>` | 攝取單一原始檔案，建立/更新對應的 wiki 頁面 | `/ingest raw/api/auth.md` |
| `/reingest <path>` | 強制重新攝取指定檔案（即使內容未變也執行） | `/reingest raw/api/auth.md` |
| `/ingest-all` | 批次攝取 raw 路徑下所有支援格式的檔案 | `/ingest-all` |
| `/ingest-all retry` | 只重試上一次 `/ingest-all` 中失敗的檔案 | `/ingest-all retry` |
| `/save [title]` | 將最後一則 assistant 回覆存到 wiki/analyses | `/save JWT 驗證流程` |
| `/lint` | 執行 wiki 健檢（孤立頁、壞連結、LLM 分析報告） | `/lint` |
| `/relate <page>` | 重新分析指定頁面的語意關聯，更新 YAML frontmatter | `/relate JWT` |
| `/clean-links` | 掃描整個 wiki，移除指向不存在頁面的 wikilink | `/clean-links` |
| `/log-tail [n]` | 顯示最近 n 筆 log 記錄（預設 20，上限 200） | `/log-tail 50` |
| `/log-filter <type>` | 依操作類型過濾 log，可組合多種類型 | `/log-filter ingest\|lint` |
| `/reindex` | 依目前 wiki 頁面重建 `wiki/index.md` | `/reindex` |
| `/summarize` | 摘要目前 Session 的歷史對話 | `/summarize` |

### 各指令詳細說明

#### /ingest `<path>`

攝取指定原始檔案到 wiki。執行後：
1. 讀取並解析原始檔案（支援 md / pdf / png / jpg / docx / xlsx / pptx）
2. 若檔案內容與上次攝取時相同（雜湊未變），自動跳過（顯示「Ingest skipped: unchanged file.」）
3. 建立或更新 `wiki/sources/<filename>.md`（來源摘要頁）
4. 從內容中萃取實體頁（`wiki/entities/`）與概念頁（`wiki/concepts/`）
5. 執行語意關聯分析，更新相關頁面的 YAML frontmatter
6. 清理新產生頁面中指向不存在頁面的 wikilink
7. 更新 `wiki/index.md`
8. 在 `wiki/log.md` 追加 `ingest | <title>` 記錄

**path 格式支援**：
- 一般路徑：`raw/api/auth.md`
- wikilink 格式：`[[raw/api/auth]]`

#### /reingest `<path>`

與 `/ingest` 相同，但**跳過內容雜湊比對**，無論內容是否改變都強制重新攝取。

適用情境：
- 檔案確實有修改但雜湊快取未更新
- 想要更新舊版 wiki 頁面以反映最新 LLM 能力
- 測試或除錯時

#### /ingest-all

掃描整個 `raw/` 資料夾（包含子目錄），批次攝取所有支援格式的檔案：
- 依序處理，不並發（避免 index.md 寫入競爭）
- 每個檔案同樣檢查雜湊，內容未變者自動跳過
- 某個檔案失敗時**不中斷**，繼續處理下一個
- 全部完成後，若有失敗的檔案，會顯示提示「Ingest-all done with N failures. Run /ingest-all retry」

#### /ingest-all retry

只重試上一次 `/ingest-all` 執行中失敗的檔案，成功的不會重複執行。

#### /save `[title]`

將 chat 中**最後一則 assistant 回覆**存到 `wiki/analyses/<title>.md`：
- 若沒有提供 title，預設用 `Saved YYYY-MM-DD` 格式命名
- 儲存後自動執行語意關聯分析
- 更新 `wiki/index.md` 與 `wiki/log.md`

> **與 Save to Wiki 按鈕的差別**：按鈕會自動從回覆第一行取標題；指令讓你手動指定標題。

#### /lint

執行 wiki 健檢：

1. **本地分析**：
   - 統計所有 wiki 頁面數量
   - 找出孤立頁（Orphans）：沒有任何頁面連入、也沒有連到其他頁面的頁
   - 找出壞連結（Broken Links）：wikilink 指向不存在的頁面
2. **LLM 分析**：把統計結果送給 LLM，獲得：
   - wiki 整體健康度評估
   - 孤立頁的改善建議
   - 壞連結的修復建議
   - 概念缺口或遺漏頁面的提示
3. 結果串流顯示在 chat，每則回覆下方都有 **Save to Wiki** 可儲存報告

#### /relate `<page>`

重新分析指定頁面與其他 wiki 頁面的語意關聯，並更新該頁面 YAML frontmatter 中的關係欄位。

- `<page>` 填寫頁面標題（不含路徑和副檔名），例如：`/relate JWT`
- 也接受 wikilink 格式：`/relate [[wiki/concepts/JWT]]`
- 只會更新 `sources/`、`entities/`、`concepts/` 這三個資料夾中的頁面（避免影響索引和記錄）
- 使用**合併策略**：只新增 LLM 識別到的關聯，不覆蓋已有的手動設定

#### /clean-links

掃描整個 wiki 的所有 `.md` 頁面，找出並移除 wikilink 中指向不存在頁面的連結。

適用情境：刪除某些 wiki 頁面後，用此指令清理殘留的失效連結。

完成後顯示：`Cleaned broken wikilinks: updated X/Y pages.`

#### /log-tail `[n]`

在 chat 顯示 `wiki/log.md` 最近 n 筆操作記錄。

- 預設顯示最近 **20** 筆
- 上限 **200** 筆
- 例如：`/log-tail 30`

#### /log-filter `<type>`

依操作類型過濾 log，顯示最多 100 筆符合的記錄。

支援的類型：`ingest`、`query`、`lint`

可以用 `|` 或 `,` 組合多種類型：
- `/log-filter ingest`（只看攝取記錄）
- `/log-filter ingest|lint`（看攝取和健檢記錄）
- `/log-filter query,lint`（看查詢和健檢記錄）

#### /reindex

依目前 wiki 資料夾內的所有 `.md` 頁面（排除 `index.md` 和 `log.md`）重新建立 `wiki/index.md`。

適用情境：
- 手動新增或刪除 wiki 頁面後同步索引
- 索引顯示有誤時手動修正
- 更換 wiki 路徑後重建索引

#### /summarize

等同於點擊 Toolbar 的 **Summarize Session** 按鈕，請 LLM 摘要目前 Session 的所有對話。

---

## 8. Ingest 攝取流程說明

### 8.1 支援的原始文件格式

| 格式 | 支援內容 |
| --- | --- |
| `.md` | Markdown 全文 |
| `.pdf` | 文字層 PDF 全文；掃描版（無文字層）若 model 支援 vision 則以圖片處理 |
| `.png` / `.jpg` | 圖片，以 base64 傳給支援 vision 的 model |
| `.docx` | Word 文件全文 |
| `.xlsx` | Excel 工作表內容 |
| `.pptx` | PowerPoint 投影片全文 |

### 8.2 攝取後產生的頁面

每次攝取一個原始文件後，wiki 中會產生：

1. **來源頁**（`wiki/sources/<filename>.md`）：原始文件的完整摘要
2. **實體頁**（`wiki/entities/<name>.md`）：從內容萃取出的具體實體（零或多個）
3. **概念頁**（`wiki/concepts/<name>.md`）：從內容萃取出的抽象概念（零或多個）

所有頁面都含有 YAML frontmatter，包含類型、標題、建立日期、更新日期、標籤、關係欄位等。

### 8.3 YAML Frontmatter 格式

每個 wiki 頁面的 frontmatter 格式如下：

```yaml
---
wiki_type: concept
title: JWT
created: 2026-05-26
updated: 2026-05-26
tags: ["authentication", "token", "security"]
related:
  - "[[wiki/concepts/OAuth]]"
  - "[[wiki/concepts/HTTPS]]"
is_a:
  - "[[wiki/concepts/Token]]"
mentions:
  - "[[wiki/entities/Auth0]]"
---

# JWT

JWT（JSON Web Token）是一種開放標準...
```

### 8.4 內容雜湊快取

攝取時插件會計算原始檔案的 SHA-256 雜湊值，儲存在 `.llm-wiki/ingest-hashes.json`。

下次攝取同一個檔案時：
- 若雜湊相同（內容未變） → 跳過，顯示「Ingest skipped: unchanged file」
- 若雜湊不同（內容已改） → 重新攝取並更新雜湊快取

若想強制攝取，使用 `/reingest` 跳過雜湊比對。

---

## 9. Save to Wiki 儲存說明

### 9.1 兩種儲存方式

| 方式 | 操作 | 標題來源 |
| --- | --- | --- |
| **Save to Wiki 按鈕** | 點擊每則 Assistant 回覆下方的按鈕 | 自動從回覆第一行取文字 + 時間戳 |
| **/save 指令** | 在輸入框輸入 `/save <標題>` | 使用者自訂標題 |

### 9.2 自動標題規則（按鈕儲存）

1. 取回覆第一行有意義的文字（去除 Markdown 記號）
2. 截取最多 48 個字元
3. 附加時間戳，格式：`YYYY-MM-DD-HH-mm-ss`
4. 最終標題例：`JWT 是一種開放標準 2026-05-26-10-30-00`

### 9.3 儲存後的自動化流程

1. 頁面存入 `wiki/analyses/<title>.md`
2. 觸發語意關聯分析（`/relate <title>`）
3. 更新 `wiki/index.md`
4. 在 `wiki/log.md` 追加 `save-success` 記錄（或失敗時追加 `save-error`）
5. 顯示通知：`Saved to wiki: <title>`

### 9.4 重複標題處理

若標題已存在，插件會**直接覆寫**既有頁面並更新 index/log。

---

## 10. Lint 健檢說明

### 10.1 孤立頁（Orphans）定義

同時符合以下兩個條件的頁面視為孤立頁：
- 沒有其他頁面的 wikilink 指向它（incoming = 0）
- 它也沒有 wikilink 指向其他頁面（outgoing = 0）

> 注意：`index.md` 和 `log.md` 排除在孤立頁偵測之外。

### 10.2 壞連結（Broken Links）定義

wikilink 指向的頁面標題在目前 wiki 中找不到對應的 `.md` 檔案。

### 10.3 Lint 回報格式

Lint 結果在 chat 中顯示，包含：
- 統計數字（總頁數、孤立頁數、壞連結數）
- LLM 的健康度評估
- 具體的改善建議

可以點 **Save to Wiki** 把 Lint 報告存到 `wiki/analyses/`。

### 10.4 自動排程 Lint

在 Settings 設定：
- **Lint schedule**：Daily 或 Weekly
- **Lint time**：執行時間（例如 `09:00`）
- **Catch up on startup**：若排程時段 Obsidian 未開啟，下次啟動時補跑

也可隨時用 Command Palette 執行「LLM Wiki: Lint Wiki」。

---

## 11. 關聯圖（Graph Relations）說明

### 11.1 語意關係類型

預設支援以下關係類型：

| 關係類型 | 說明 |
| --- | --- |
| `related` | 一般相關（雙向） |
| `is_a` | A is_a B：A 是 B 的一種 |
| `part_of` | A part_of B：A 是 B 的一部分 |
| `mentions` | A mentions B：A 提到了 B |
| `supports` | A supports B：A 支持或佐證 B |
| `contradicts` | A contradicts B：A 與 B 相矛盾 |
| `derived_from` | A derived_from B：A 衍生自 B |

可透過 `WIKI_SCHEMA.md` 或設定頁的 Relation types override 自訂關係類型。

### 11.2 關聯的 YAML 格式

```yaml
related:
  - "[[wiki/concepts/OAuth]]"
is_a:
  - "[[wiki/concepts/Token]]"
derived_from:
  - "[[wiki/sources/api-design]]"
```

### 11.3 在 Graph View 查看關聯

Obsidian 的原生 Graph View 會自動讀取 YAML frontmatter 中的 `[[wikilinks]]`，顯示為頁面間的連線。

開啟方式：`Ctrl+Shift+G`（或 Command Palette → Open Graph View）

### 11.4 合併策略（Merge Safety）

- 關聯分析只會**新增** LLM 識別的連結
- 不覆蓋你手動寫入 frontmatter 的任何關聯
- 同一個連結不會重複寫入（自動去重）

---

## 12. WIKI_SCHEMA.md 設定檔說明

在 Vault 根目錄建立 `WIKI_SCHEMA.md`，可覆寫部分預設設定。

### 12.1 你可以在 WIKI_SCHEMA.md 放什麼？

目前程式會從 `WIKI_SCHEMA.md` 讀取 **2 個欄位**：

- `defaultPageType`
- `relationTypes`

也就是說，`WIKI_SCHEMA.md` 主要用來控制「頁面類型預設值」與「允許的關係欄位」。

> 注意：目前 `WIKI_SCHEMA.md` **不會直接解析** `systemPrompt` 欄位。
> `System prompt` 請在 Settings 的 **System prompt override** 內調整。

### 12.2 最小可用範例

```markdown
# Wiki Schema

defaultPageType: concept

relationTypes: related, is_a, part_of, mentions, appears_in_chapter
```

| 欄位 | 說明 |
| --- | --- |
| `defaultPageType` | 新建頁面預設的 `wiki_type` 值 |
| `relationTypes` | 允許的關係類型（逗號分隔） |

### 12.3 實務範例（可直接複製）

#### 範例 A：知識文件導向（文件章節關係）

```markdown
# Wiki Schema

defaultPageType: concept
relationTypes: related, is_a, part_of, mentions, prerequisite_of, appears_in_chapter, example_of
```

適合技術手冊、SOP、課程筆記。

#### 範例 B：研究/分析導向（證據與結論）

```markdown
# Wiki Schema

defaultPageType: summary
relationTypes: related, supports, contradicts, derived_from, cites, extends
```

適合研究紀錄、決策備忘、比較分析。

### 12.4 怎麼修改（建議流程）

1. 在 Vault 根目錄建立或編輯 `WIKI_SCHEMA.md`。
2. 先只改一件事（例如只新增一個 relation type）。
3. 回到 chat 執行 `/relate <page>` 驗證單頁效果。
4. 確認效果後，再批次對重要頁面執行 `/relate`。
5. 需要時執行 `/reindex` 更新索引可見性。

### 12.5 System prompt 是不是 chat 用的 system prompt？

是，而且不只 chat。

目前 `System prompt override` 會進入多個流程：

- Query（你在 chat 提問時）
- Ingest（產生來源摘要、實體/概念頁）
- Lint（LLM 健檢分析）

因此它是整個插件的「全域 LLM 行為提示詞」，不是只影響單一聊天畫面。

### 12.6 Relation types 怎麼改？改完會影響什麼？

你可以用兩種方式改：

1. 在 `WIKI_SCHEMA.md` 寫 `relationTypes: ...`
2. 在 Settings 的 **Relation types override** 輸入逗號清單

影響如下：

- `/relate` 時，LLM 只會被允許輸出你定義的關係欄位。
- 若 LLM 回傳了未定義欄位，程式會回退到 `related`。
- 新關係欄位會寫進頁面 frontmatter（例如 `prerequisite_of:`、`cites:`）。
- 既有欄位不會被強制刪除；合併策略是以新增為主。

建議：

- relation types 不要一次加太多，先保持 5-8 個高價值欄位。
- 名稱盡量語意明確且一致（例如全用 snake_case）。
- 若你改了 relation types，建議對核心頁面重跑一次 `/relate`，讓新規則生效。

### 12.7 優先順序

設定的優先順序由高到低：

1. 設定頁的 **System prompt override**（最高）
2. 設定頁的 **Relation types override**
3. `WIKI_SCHEMA.md`（若 Use WIKI_SCHEMA.md 已啟用）
4. 插件內建預設值（最低）

### 12.8 停用 WIKI_SCHEMA.md

在 Settings 關閉 **Use WIKI_SCHEMA.md**，插件就不會讀取這個檔案。

---

## 13. index.md 索引檔說明

`wiki/index.md` 是 wiki 知識庫的全域索引，**由插件自動維護**，每次 Ingest、Save 或執行 `/reindex` 後更新。

### 13.1 格式範例

```markdown
# Wiki 索引

## 實體（Entities）
- [[wiki/entities/Auth0]] - Auth0
- [[wiki/entities/JWT Library]] - JWT Library

## 概念（Concepts）
- [[wiki/concepts/HTTPS]] - HTTPS
- [[wiki/concepts/JWT]] - JWT
- [[wiki/concepts/OAuth]] - OAuth

## 來源（Sources）
- [[wiki/sources/api-design]] - api-design
- [[wiki/sources/rest-principles]] - rest-principles

## 分析（Analyses）
- [[wiki/analyses/REST vs GraphQL 2026-05-26-10-30-00]] - REST vs GraphQL 2026-05-26-10-30-00
```

### 13.2 分類說明

| 分類 | 對應資料夾 |
| --- | --- |
| 實體（Entities） | `wiki/entities/` |
| 概念（Concepts） | `wiki/concepts/` |
| 來源（Sources） | `wiki/sources/` |
| 分析（Analyses） | `wiki/analyses/` |
| 其他（Others） | 不在上述四個資料夾的頁面 |

每個分類內的項目依**標題字母順序排列**。

---

## 14. log.md 操作記錄說明

`wiki/log.md` 是所有操作的 **Append-only** 記錄，每次操作都會在檔尾追加新記錄，不修改舊記錄。

### 14.1 記錄類型

| 記錄類型 | 觸發時機 |
| --- | --- |
| `ingest` | 成功攝取一個原始檔案 |
| `ingest-skip` | 攝取時因內容未變而跳過 |
| `ingest-error` | 攝取某個檔案失敗 |
| `query` | LLM 回覆一則對話（非指令） |
| `save-success` | 成功將回覆儲存為 wiki 頁面 |
| `save-error` | 儲存 wiki 頁面失敗 |
| `lint` | 執行 wiki 健檢 |

### 14.2 記錄格式範例

```markdown
## [2026-05-26 10:30:00] ingest | api-design
- source: raw/api/api-design.md
- derived_entities: 3
- derived_concepts: 5
- touched_pages: 9

## [2026-05-26 10:31:05] ingest-skip | rest-principles
- source: raw/papers/rest-principles.pdf
- reason: unchanged

## [2026-05-26 10:35:22] query | 什麼是 JWT？
- session_id: session-1716711322-abc123
- response_chars: 842

## [2026-05-26 10:35:45] save-success | JWT 簡介 2026-05-26-10-35-45
- source: button
- path: wiki/analyses/JWT 簡介 2026-05-26-10-35-45.md
- chars: 842

## [2026-05-26 11:00:00] lint | wiki health check
- orphans: 2
- broken_links: 1
- pages: 24
```

### 14.3 查看 Log

使用以下指令在 chat 中直接查看 log，不需要另外開啟 `log.md`：

- `/log-tail 20`：顯示最近 20 筆記錄
- `/log-filter ingest`：只看 ingest 相關記錄
- `/log-filter query|save-success`：看查詢和成功儲存的記錄

---

## 15. .llm-wiki 內部目錄說明

`.llm-wiki/` 是插件的**內部資料目錄**，儲存非 wiki 知識的操作資料。這個目錄不是 wiki 的一部分，建議不要手動修改。

### 目錄結構

```
.llm-wiki/
├── sessions/
│   ├── sessions-index.json      ← Session 目錄（ID、標題、最後更新時間）
│   ├── session-1716711322-abc123.json  ← 一個 Session 的完整資料
│   └── session-1716799999-def456.json
└── ingest-hashes.json           ← 已攝取檔案的 SHA-256 雜湊快取
```

### sessions-index.json 格式

```json
{
  "sessions": [
    {
      "id": "session-1716711322-abc123",
      "title": "JWT 驗證流程討論",
      "updatedAt": "2026-05-26T10:35:45.000Z"
    }
  ]
}
```

### session-\<id\>.json 格式

```json
{
  "id": "session-1716711322-abc123",
  "title": "JWT 驗證流程討論",
  "createdAt": "2026-05-26T10:30:00.000Z",
  "updatedAt": "2026-05-26T10:35:45.000Z",
  "summary": "本次對話討論了 JWT 的結構與驗證流程...",
  "summaryUpToIndex": 4,
  "messages": [
    {
      "role": "user",
      "content": "什麼是 JWT？",
      "timestamp": "2026-05-26T10:30:00.000Z"
    },
    {
      "role": "assistant",
      "content": "JWT（JSON Web Token）是一種開放標準...",
      "timestamp": "2026-05-26T10:30:05.000Z"
    }
  ]
}
```

### ingest-hashes.json 格式

```json
{
  "raw/api/api-design.md": "sha256:a3b4c5d6e7f8...",
  "raw/papers/rest-principles.pdf": "sha256:b1c2d3e4f5a6..."
}
```

---

## 16. 自動攝取（Auto Ingest）說明

在 Settings 開啟 **Auto ingest** 後，插件會監聽 `raw/` 資料夾（及子目錄）的**新增檔案**事件。

### 運作機制

1. 偵測到新檔案後，等待 **2 秒**（防抖動），避免同時新增多個檔案時觸發多次
2. 2 秒內若又有新檔案，重置計時器
3. 計時結束後，對所有待處理的新檔案依序執行攝取

### 重要限制

| 情境 | 行為 |
| --- | --- |
| 新增支援格式的檔案到 raw/ | ✅ 自動觸發攝取 |
| 修改已存在的 raw/ 檔案 | ❌ 不觸發，請用 `/reingest` |
| 刪除 raw/ 檔案 | ❌ 不觸發任何動作 |
| 在 raw/ 子目錄新增 | ✅ 觸發 |
| 不支援格式的檔案 | ❌ 忽略 |

---

## 17. 常見問題 FAQ

### Q1：API Key 沒有儲存，切換 provider 後就不見了？

**原因**：插件現在每個 Provider 各自儲存一組設定。首次使用時，請分別切換到每個 Provider 並填寫對應的 API Key、Model、Base URL。

### Q2：切換 Provider 後，Model 名稱顯示不對？

這是正常的，每個 Provider 有自己的預設 Model 名稱。請在切換到新 Provider 後，確認 Model 欄位填入正確的模型名稱。

### Q3：/ingest 顯示「Ingest skipped: unchanged file」

這是正常行為。插件偵測到原始檔案內容未改變（雜湊相同），跳過了重複攝取。若確實想重新攝取，使用 `/reingest <path>`。

### Q4：Ingest 後 Graph View 沒有看到連線？

請確認：
1. Obsidian Graph View 是否有開啟
2. `wiki/entities/` 和 `wiki/concepts/` 中的頁面是否確實有 YAML frontmatter
3. 嘗試執行 `/relate <pagename>` 手動觸發單頁關聯分析
4. 若仍無效，嘗試 `/reindex` 重建索引後再查看

### Q5：Session 的對話歷史不見了？

Session 資料存在 `.llm-wiki/sessions/` 目錄中。若使用 Git 同步 vault，需確認 `.llm-wiki/` 目錄沒有被 `.gitignore` 排除。

### Q6：LLM 回覆顯示「Missing API key」

前往 Settings → Obsidian LLM Wiki，確認目前選擇的 Provider 已填入正確的 API Key。

### Q7：Ollama 連線失敗

確認：
1. Ollama 服務是否已啟動（`ollama serve`）
2. Base URL 是否正確（預設 `http://127.0.0.1:11434/api/chat`）
3. 指定的 Model 是否已下載（`ollama pull llama3.1`）

### Q8：想新增自訂子目錄（如 `wiki/notes/`）？

目前可在 `WIKI_SCHEMA.md` 中指引 LLM 使用自訂子目錄。若 LLM 會產生指向 `wiki/notes/` 的頁面，在 Session 中執行 `/reindex` 即可讓索引包含該目錄的頁面。

### Q9：log.md 太大怎麼辦？

`log.md` 是 Append-only，可以手動在 Obsidian 中開啟並刪除舊記錄。插件不會覆蓋 log.md 的內容，只會在結尾追加。

### Q10：自動 Lint 排程沒有執行？

確認：
1. 確認 Obsidian 是開啟的狀態
2. Settings 中 Lint schedule 已設為 Daily 或 Weekly
3. Lint time 格式正確（`HH:mm`，24 小時制，例如 `09:00`）
4. 若 Obsidian 在排程時間沒有開啟，可開啟「Catch up missed lint on startup」讓下次啟動時補跑
