# Spec: Obsidian LLM Wiki Plugin

> **Source**: `llm-wiki.md` + user requirements (grill session 2026-05-22)
> **Status**: Implemented baseline + post-implementation revisions (updated 2026-05-26)

---

## Problem
現有的 LLM + 文件工作流（RAG、NotebookLM、ChatGPT file upload）每次查詢都重新從原始文件推導答案，知識不累積、無法跨文件合成、不維護交叉連結。

使用者需要一個能在 Obsidian vault 內**持續維護 wiki 知識庫**的工具：LLM 負責攝取文件、整合知識、維護連結；使用者負責提供素材和提問。wiki 是可複利的資產，不是一次性的查詢結果。

## Goals

- 在 Obsidian 右側 Sidebar 提供 Chat 介面，讓使用者可與 LLM 對話
- 支援 Ingest 操作：LLM 讀取原始文件並更新 wiki 頁面
- 支援 Query 操作：LLM 搜尋 wiki 並合成答案，答案可存回 wiki
- 支援 Lint 操作：LLM 健檢 wiki，找矛盾、孤立頁面、缺失連結
- **支援關聯圖**：LLM 在 Ingest、Query Save、Lint 時自動識別頁面間的語意關係，寫入 YAML frontmatter，透過 Obsidian 原生 Graph View 呈現；提供 `/relate` 指令手動觸發關係重分析
- 支援多個 LLM Provider（OpenAI、Anthropic、Ollama 等），使用者可在設定頁切換
- 支援多種原始文件格式：`.md`、`.pdf`、`.png`/`.jpg`、`.docx`、`.xlsx`、`.pptx`
- Session 管理：預設開啟新 Session，保留所有歷史 Session，可選擇繼續舊 Session
- Schema 可配置：內建預設，支援 `WIKI_SCHEMA.md` 或設定頁覆寫

## Non-Goals

- 不提供雲端同步或多人協作功能（vault 本身可透過 git 達成）
- 不內建 Embedding 向量搜尋（第一版，可作為未來擴充）
- 不自動發布或匯出 wiki 到外部平台
- 不修改原始文件（raw sources 永遠唯讀）
- 不提供網頁爬取功能（使用者自行用 Obsidian Web Clipper 處理）

---

## User Stories

### Ingest
- **US-01** 身為使用者，我可以在 File Explorer 對原始文件按右鍵選「LLM Wiki: Ingest」，讓 LLM 處理並更新 wiki
- **US-02** 身為使用者，我可以在 Chat 介面輸入 `/ingest [[filename]]`，觸發 LLM 攝取指定文件
- **US-03** 身為使用者，我可以在設定頁開啟「自動攝取」，讓 plugin 監聽 raw sources 資料夾，偵測新文件後自動 ingest
- **US-04** 身為使用者，ingest 過程中我可以在 chat 看到 LLM 的即時進度（讀取中、正在更新哪個 wiki 頁面）
- **US-05** ingest 完成後，`index.md` 和 `log.md` 自動更新

### Query
- **US-06** 身為使用者，我可以在 Chat 介面直接提問，LLM 會搜尋 wiki 並回答，附上引用頁面連結
- **US-07** 身為使用者，我可以點擊 Chat 回覆旁的「Save to Wiki」按鈕，立即將該則 Assistant 回覆存為新 wiki 頁面（自動產生頁名）
- **US-08** 身為使用者，我可以輸入 `/save [頁面標題]`，將最後一則 LLM 回覆存為 wiki 頁面
- **US-09** 存檔後 `index.md` 和 `log.md` 自動更新

### Lint
- **US-10** 身為使用者，我可以在 Chat 輸入 `/lint`，LLM 健檢 wiki 並在 chat 回報問題清單
- **US-11** 身為使用者，我可以透過 Command Palette 執行「LLM Wiki: Lint Wiki」
- **US-12** 身為使用者，我可以在設定頁設定自動 lint 排程（每天/每週，預設關閉）
- **US-13** Lint 結果可選擇存為 wiki 頁面

### Session 管理
- **US-14** 身為使用者，每次開啟 Obsidian 預設進入新的 Chat Session
- **US-15** 身為使用者，我可以在 Chat 介面頂部的 Session 選單切換到某個歷史 Session 繼續對話
- **US-16** 所有 Session 均持久化存檔，關閉後不清除
- **US-17** 身為使用者，新 Session 的第一則對話結束後，LLM 自動生成 Session 標題
- **US-18** 身為使用者，我可以在 Chat 介面點擊「Rename」按鈕手動修改 Session 標題
- **US-19** 身為使用者，我可以在 Chat 介面觸發「Summarize Session」，LLM 將當前 Session 的歷史對話壓縮成一則 summary，後續 LLM 呼叫將以 summary + 最新 N 則訊息作為 context
- **US-20** 身為使用者，我可以在 Chat 介面輸入 `/reingest [path]`，手動重新攝取已存在的文件
- **US-30** 身為使用者，我可以在自訂 Session 下拉選單中，直接對每個 Session 點擊 `X` 刪除

### 關聯圖（Graph）
- **US-24** 身為使用者，LLM 在 ingest 完成後自動識別相關頁面間的語意關係，並寫入各頁面的 YAML frontmatter
- **US-25** 身為使用者，我可以直接在 Obsidian Graph View 看到 wiki 頁面之間的連結關係（由 `[[wiki links]]` 驅動）
- **US-26** 身為使用者，我可以在 Chat 輸入 `/relate [page]`，讓 LLM 重新分析該頁面並補充/更新語意關聯
- **US-27** 身為使用者，答案存回 wiki 時（Save to Wiki），LLM 自動識別新頁面與現有 wiki 頁面的關聯
- **US-28** 身為使用者，Lint 健檢時 LLM 一併找出缺少關聯的孤立頁面，並嘗試補上語意關係
- **US-29** 身為使用者，我可以在 `WIKI_SCHEMA.md` 或設定頁新增自訂關係型別（如讀書筆記的 `appears_in_chapter`）

### 設定
- **US-21** 身為使用者，我可以在 Obsidian Settings → LLM Wiki 設定 Provider、API Key、Model、資料夾路徑、Schema
- **US-22** 身為使用者，我可以在 vault 根目錄放置 `WIKI_SCHEMA.md` 覆寫 plugin 內建 schema
- **US-23** 身為使用者，我可以在設定頁設定傳給 LLM 的滑動視窗大小（最新 N 則訊息，預設 20）
- **US-31** 身為使用者，我希望設定頁有清楚的分類區塊（例如 Provider、Vault Folders、Schema、Ingest、Lint、Context），方便快速定位設定項目
- **US-32** 身為使用者，API Key 在設定頁預設應以遮罩（星號）顯示，避免 shoulder surfing 或螢幕錄影時外洩
- **US-33** 身為使用者，我可以透過眼睛圖示切換 API Key 明碼/遮罩顯示；再次點擊可切回遮罩

---

## Architecture Overview

```
Obsidian Vault
├── raw/                   # 原始文件（唯讀，LLM 只讀不寫）
│   ├── article.md
│   ├── paper.pdf
│   ├── screenshot.png
│   └── report.docx
├── wiki/                  # LLM 維護的 wiki（LLM 讀寫）
│   ├── index.md           # 目錄索引（每次 ingest/save 後更新）
│   ├── log.md             # Append-only 操作記錄
│   ├── sources/           # 原始文件摘要頁（預設子目錄）
│   ├── entities/          # 實體頁：人物、組織、產品等（預設子目錄）
│   ├── concepts/          # 概念頁：術語、技術、理論等（預設子目錄）
│   ├── analyses/          # 分析頁：比較、問答存檔等（預設子目錄）
│   └── [custom]/          # 使用者透過 schema 自訂的額外子目錄
├── WIKI_SCHEMA.md         # (可選) 覆寫 plugin 內建 schema
└── .obsidian/
    └── plugins/
        └── obsidian-llm-wiki/
            └── data.json  # Plugin 設定 + Session 記錄
```

---

## Plugin Settings（data.json schema）

```typescript
interface LLMWikiSettings {
  // Provider
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string; // for Ollama or custom

  // Paths
  rawSourcesPath: string;       // default: "raw"
  wikiPath: string;             // default: "wiki"

  // Wiki structure — predefined subdirs; user can add custom via schema
  wikiSubdirs: string[];        // default: ["sources", "entities", "concepts", "analyses"]

  // Ingest
  autoIngest: boolean;          // default: false
  autoIngestDebounceMs: number; // default: 3000

  // Schema
  systemPrompt: string;         // built-in default, user-overridable

  // Lint
  lintSchedule: 'off' | 'daily' | 'weekly'; // default: 'off'

  // Session / context
  contextWindowSize: number;    // N = last N messages sent to LLM, default: 20
  sessions: Session[];
  activeSessionId: string | null;
}

interface Session {
  id: string;
  name: string;             // LLM auto-generated after first message; user can rename
  createdAt: string;        // ISO 8601
  updatedAt: string;
  summary?: string;         // LLM-generated summary of older messages (if Summarize triggered)
  summaryUpToIndex?: number; // messages[0..summaryUpToIndex] are covered by summary
  messages: ChatMessage[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachedFiles?: string[]; // file paths referenced in this message
}
```

---

## Component Design

### 1. Chat Sidebar View (`LLMWikiView`)
- Obsidian `ItemView` 掛載於右側 sidebar，view type: `llm-wiki-chat`
- **Session Selector**：頂部下拉選單，顯示所有 sessions（名稱 + 日期），含「+ New Session」選項；雙擊 session 名稱可直接改名
- **Message List**：顯示對話歷史，支援 Markdown render（含 `[[wiki links]]`）；若有 summary，最頂部顯示摺疊的「Session Summary」區塊
- **每則 Assistant 回覆**附有：
  - 💾 Save to Wiki 按鈕（立即儲存該則回覆，頁名自動產生）
- **Input Bar**：多行文字輸入 + 送出按鈕，支援 slash commands
- **Status Bar**：顯示目前操作狀態（Ingesting... / Querying... / Linting...）
- **Summarize Session 按鈕**：toolbar 上提供，觸發 LLM 壓縮舊訊息為 summary

### 2. Slash Commands（在 input bar 輸入）

| 指令 | 說明 |
|------|------|
| `/ingest [path]` | 攝取指定原始文件 |
| `/reingest [path]` | 重新攝取已存在的文件（更新後使用） |
| `/ingest-all` | 批次攝取 raw 資料夾所有未處理文件（遇錯繼續，完成後提示可用 `/ingest-all retry` 重試失敗檔） |
| `/relate [page]` | 重新分析指定 wiki 頁面，補充/更新 YAML frontmatter 關係欄位 |
| `/save [title]` | 將最後一則 LLM 回覆存為 wiki 頁面 |
| `/lint` | 執行 wiki 健檢 |
| `/clean-links` | 清理整個 wiki 中指向不存在頁面的 wikilink |
| `/reindex` | 重建 `wiki/index.md`（依資料夾分類） |
| `/log-tail [n]` | 顯示最近 n 筆 log（預設 20，上限 200） |
| `/log-filter [ingest\|query\|lint]` | 依操作類型過濾 log 顯示 |
| `/help` | 顯示指令清單 |

### LLM Context 組成（每次 API 呼叫）

```
System prompt（schema）
+ Session summary（若已生成）
+ messages[summaryUpToIndex+1 .. end]（最多取最新 N 則，N = contextWindowSize）
```

### 3. Ingest Pipeline

```
原始文件
  → FileParser（依格式提取文字）
  → LLM: 閱讀 + 與使用者討論重點
  → LLM: 撰寫 summary 頁面至 wiki/sources/（含 YAML frontmatter）
  → LLM: 讀取 index.md，決定需更新的相關頁面清單
  → LLM: 逐一更新相關 wiki 頁面（entity/concept pages）
  → RelationshipWriter: 識別語意關係 → 更新各頁面 YAML frontmatter
  → IndexUpdater: 更新 index.md
  → LogAppender: Append log.md
```

### 3.1 Derived Page Generation Rules

- `entities` 與 `concepts` 會在 ingest 的衍生頁生成步驟中分開產生，並要求模型回傳 valid JSON only。
- JSON 必須只包含 `entities` 與 `concepts` 兩個 key，每個 item 都要有 `title`、`content`、`tags`。
- `concept` 頁面不是簡短摘要，而是可獨立閱讀的技術 wiki knowledge node，內容需包含具體說明、用途、行為、限制與相關連結。
- prompt 會明確要求 LLM 使用結構化 markdown，例如 `Purpose`、`Usage`、`Behavior`、`Requirements`、`Notes`、`Example`、`Related`。
- tags 由 LLM 產生，必須偏向可檢索的技術詞彙，使用 kebab-case，且每頁維持 3~5 個高重用度 tag。
- 不可編造來源未支持的資訊；頁面內容需以 source summary 為依據，避免 generic 標籤或空泛概念。

### 4. Query Pipeline

```
使用者問題
  → LLM: 讀取 index.md，找相關頁面
  → Obsidian 關鍵字搜尋 API 補強
  → LLM: 讀取相關頁面內容
  → LLM: 合成答案（含 [[wiki link]] 引用）
  → 顯示於 chat（附 Save to Wiki 按鈕）
  → (可選) 使用者觸發 Save
      → 存為新頁面（含 YAML frontmatter）
      → RelationshipWriter: 識別新頁面與現有頁面的關聯 → 更新 frontmatter
      → 更新 index/log
```

### 5. File Parser（依格式）

| 格式 | 解析套件 | 備註 |
|------|---------|------|
| `.md` / `.txt` | 原生讀取 | 直接傳給 LLM |
| `.pdf` | `pdf-parse` | 提取文字層；偵測到掃描版（無文字）時：若 model 支援 vision → base64 傳 vision；否則跳過並在 chat 告知使用者 |
| `.png` / `.jpg` | base64 encode | 傳給 vision model（需支援 vision 的 model） |
| `.docx` | `mammoth` | 轉換為 Markdown |
| `.xlsx` | `xlsx` | 轉換為 Markdown table / CSV |
| `.pptx` | `officeparser` | 提取每張投影片文字 |

### 6. Schema System

優先順序（高 → 低）：
1. vault 根目錄的 `WIKI_SCHEMA.md`（若存在）
2. 設定頁的 `systemPrompt` 欄位
3. Plugin 內建預設 schema

內建預設 schema 涵蓋：
- wiki 目錄結構說明（預設 4 個子目錄：`sources/`、`entities/`、`concepts/`、`analyses/`；可透過 schema 新增自訂類別）
- 頁面命名規範
- Ingest workflow 步驟
- Query workflow 步驟
- Lint checklist（矛盾、孤立頁面、缺失連結、過時資訊）
- `index.md` / `log.md` 格式規範
- **關係型別定義與使用規範**（預設型別清單 + 擴充說明）

### 7. Relationship System

#### 預設關係型別

| 型別 | 說明 | 典型使用 |
|------|------|---------|
| `related` | 通用關聯，無特定方向 | 概念互相關聯 |
| `is_a` | 分類 / 隸屬 | `Dog is_a Animal` |
| `part_of` | 層級包含 | `章節 part_of 書` |
| `mentions` | 提及但非核心 | source 頁提及某 entity |
| `supports` | 提供佐證 / 強化 | 研究結果 supports 某理論 |
| `contradicts` | 與目標頁面矛盾 | 新研究 contradicts 舊結論 |
| `derived_from` | 衍生自 / 啟發自 | 分析頁 derived_from 多個 source |

> Schema 可新增自訂型別，例如讀書筆記的 `appears_in_chapter`、商業分析的 `competes_with`。

#### Wiki 頁面 YAML frontmatter 格式

```yaml
---
tags: [auth, middleware, api]  # LLM 產生，3~10 個，依內容主題
created: 2026-05-22
updated: 2026-05-22

# 語意關係（由 LLM 維護，Obsidian Graph View 透過 [[links]] 呈現）
related:
  - "[[wiki/concepts/transformer]]"
is_a:
  - "[[wiki/concepts/neural-network]]"
mentions:
  - "[[wiki/sources/attention-paper]]"
supports: []
contradicts: []
part_of: []
derived_from: []
# 自訂型別（由 schema 定義）可直接新增欄位
---
```

#### RelationshipWriter 行為

```
觸發時機：Ingest 完成後 / Save to Wiki 後 / /relate 指令 / Lint 補強

執行流程：
  → 讀取目標頁面現有 frontmatter
  → LLM: 分析頁面內容 + index.md，識別應建立關聯的頁面與型別
  → 更新目標頁面 YAML frontmatter（合併，不覆蓋手動設定的關係）
  → 對關聯對象頁面的 frontmatter 加入反向 related 連結（雙向）
```

> **雙向關係原則**：若 A `supports` B，則 B 的 `related` 欄位自動加入 A 的反向連結，確保 Graph View 雙向可見。有向關係（如 `is_a`）則不強制雙向。

---

## Data Model Changes

### `index.md` 格式規範

```markdown
# Wiki Index
_Last updated: 2026-05-22_

## Sources
- [[wiki/sources/article-title]] — one-line summary (ingested: 2026-05-20)

## Entities
- [[wiki/entities/person-name]] — one-line summary

## Concepts
- [[wiki/concepts/concept-name]] — one-line summary

## Analyses
- [[wiki/analyses/comparison-title]] — one-line summary (saved: 2026-05-21)
```

### Wiki 頁面 YAML frontmatter（新增）

所有 LLM 建立或更新的 wiki 頁面均包含 YAML frontmatter，格式詳見 **Component Design § 7. Relationship System**。此為 plugin 強制規範，確保 Obsidian Graph View 與 Dataview 可正確讀取關係資料。

### `log.md` 格式規範

```markdown
## [2026-05-22] ingest | Article Title
Pages updated: [[wiki/sources/article-title]], [[wiki/entities/foo]], [[wiki/concepts/bar]]

## [2026-05-22] query | What is X?
Answer saved to: [[wiki/analyses/what-is-x]]

## [2026-05-22] save-success | What is X 2026-05-22-12-30-00
- source: button
- path: wiki/analyses/What is X 2026-05-22-12-30-00.md

## [2026-05-22] save-error | What is X 2026-05-22-12-30-00
- source: slash
- error: <error message>

## [2026-05-22] lint | Wiki Health Check
Issues found: 3 orphan pages, 1 contradiction, 2 missing cross-references.
```

---

## Edge Cases

| # | 情境 | 處理方式 |
|---|------|---------|
| EC-01 | Ingest 時 LLM API 呼叫失敗 | 顯示錯誤訊息於 chat，不修改任何 wiki 檔案，可重試 |
| EC-02 | 自動 ingest 同時偵測到多個新檔案 | Queue 排隊依序處理，不並發，避免 index.md 寫入競爭 |
| EC-03 | `/save` 時指定的頁面名稱已存在 | 直接覆寫既有頁面並更新 index/log |
| EC-04 | PDF 含掃描圖片（無文字層），且 model 支援 vision | 將 PDF 頁面轉為圖片，以 base64 傳給 vision model |
| EC-04b | PDF 含掃描圖片（無文字層），且 model 不支援 vision | 跳過此文件，chat 告知使用者「此 PDF 為掃描版且目前 model 不支援 vision」，建議更換 model |
| EC-05 | API Key 未設定或無效 | Chat 顯示明確錯誤提示，附設定頁連結 |
| EC-06 | `WIKI_SCHEMA.md` 存在但內容為空 | Fallback 至設定頁 systemPrompt，chat 顯示警告 |
| EC-07 | raw 資料夾不存在 | plugin 啟動時自動建立 `rawSourcesPath` |
| EC-08 | 超大文件（估算 > 100K tokens） | 自動分段處理，每段分別 ingest，log 記錄分段資訊 |
| EC-09 | Ollama 服務未啟動 | 顯示連線錯誤，提示使用者確認本地服務狀態 |
| EC-10 | `/ingest-all` 其中一個文件處理失敗 | 跳過失敗文件繼續處理其他文件；完成後 chat 顯示失敗清單，並提示可用 `/ingest-all retry` 重試 |
| EC-11 | 不支援的檔案格式觸發 ingest | 顯示「不支援此格式」錯誤，列出支援格式清單 |
| EC-12 | Auto-ingest 偵測到已攝取的文件被修改 | 不自動重新 ingest；使用者可手動執行 `/reingest [path]` |
| EC-13 | RelationshipWriter 寫入的關聯指向不存在的 wiki 頁面 | 跳過該關聯，在 chat 顯示警告；Lint 時列為待補充項目 |
| EC-14 | `/relate` 指令對象頁面不存在 | 顯示錯誤「找不到頁面」，列出 wiki 資料夾現有頁面供參考 |
| EC-15 | LLM 識別的關係型別不在預設清單也不在 schema 中 | Fallback 至 `related`，在 chat 顯示「使用 related 代替未知型別 X」 |
| EC-16 | 反向連結更新時對象頁面不存在或被刪除 | 跳過反向連結更新，不建立新頁面 |
| EC-17 | 頁面已有手動設定的 frontmatter 關係 | RelationshipWriter 執行合併（不覆蓋），只新增 LLM 識別的關係 |
| EC-18 | 使用者切換過 API Key 顯示為明碼後關閉設定頁再重開 | 設定頁重新開啟時一律回到遮罩顯示（不保留明碼顯示狀態） |

---

## Acceptance Criteria

### AC-01 Chat Sidebar
- [ ] 可透過 Command Palette「LLM Wiki: Open Chat」或 ribbon icon 開啟
- [ ] 右側 sidebar 顯示 Chat 介面，包含 Session Selector、Message List、Input Bar、Summarize Session 按鈕
- [ ] Session selector 顯示所有歷史 sessions，預設選取「New Session」
- [ ] 可切換至任意歷史 session 並繼續對話，訊息歷史正確載入
- [ ] 新 Session 第一則對話結束後，LLM 自動生成 session 標題並更新 selector
- [ ] 可透過「Rename」按鈕修改目前 Session 標題
- [ ] Session selector 為自訂下拉元件，每一個 Session 項目可獨立點擊 `X` 刪除
- [ ] 有 summary 的 session 在 Message List 頂部顯示摺疊的「Session Summary」區塊

### AC-02 Ingest（手動右鍵）
- [ ] File Explorer 對支援格式檔案右鍵，顯示「LLM Wiki: Ingest」選項
- [ ] 點選後 chat sidebar 顯示 ingest 進度（目前更新哪個 wiki 頁面）
- [ ] Ingest 完成後 wiki 資料夾新增/更新頁面，`index.md` 和 `log.md` 正確更新

### AC-03 Ingest（chat 指令）
- [ ] `/ingest path/to/file.md` 可觸發 ingest
- [ ] `/reingest path/to/file.md` 可重新攝取已存在的文件
- [ ] `/ingest-all` 批次處理 raw 資料夾所有支援格式檔案（queue 依序執行）
- [ ] `/ingest-all` 遇錯繼續，完成後顯示失敗清單，並提示可用 `/ingest-all retry` 重試

### AC-04 Ingest（自動）
- [ ] 設定頁開啟 Auto Ingest 後，raw 資料夾新增支援格式文件自動觸發
- [ ] 設定頁關閉 Auto Ingest 後，新增文件不自動觸發

### AC-05 Query
- [ ] Chat 輸入問題，LLM 回覆包含 `[[wiki link]]` 引用
- [ ] 每則 LLM 回覆旁顯示「Save to Wiki」按鈕
- [ ] 點擊按鈕後立即儲存該則回覆（自動產生頁名），並在 wiki 資料夾建立新頁面與更新 index/log
- [ ] Plugin 重啟後，若畫面已有 assistant 歷史訊息，仍可正常 Save to Wiki

### AC-06 Save（指令）
- [ ] `/save My Page Title` 將最後一則 LLM 回覆存為 `wiki/analyses/My Page Title.md`
- [ ] 存檔後 `index.md` 和 `log.md` 自動更新

### AC-07 Lint
- [ ] `/lint` 和 Command Palette 均可觸發，結果顯示於 chat
- [ ] Lint 結果可透過「Save to Wiki」存檔
- [ ] 設定頁可設定每日/每週自動 lint（預設 off）

### AC-08 Multi-Provider
- [ ] 設定頁可選 OpenAI / Anthropic / Ollama / Custom
- [ ] 切換 provider 後下一則訊息即使用新 provider
- [ ] Custom provider 可設定 baseUrl
- [ ] Plugin 正確偵測目前 model 是否支援 vision（用於掃描版 PDF fallback 判斷）
- [ ] 設定頁為分區塊式 UI（至少含 Provider 與 Vault Folders 區塊標題），同區塊內顯示對應設定欄位
- [ ] API Key 欄位預設為遮罩顯示，開啟設定頁時不以明碼呈現
- [ ] API Key 欄位提供眼睛圖示切換（show/hide）且可來回切換

### AC-11 Session Summary
- [ ] 點擊「Summarize Session」後 LLM 生成 summary 並存入 session.summary
- [ ] 後續 API 呼叫 context 為：system prompt + summary + 最新 N 則訊息
- [ ] N 值可在設定頁調整（contextWindowSize，預設 20）

### AC-12 Wiki Subdirectory
- [ ] 預設建立 `sources/`、`entities/`、`concepts/`、`analyses/` 四個子目錄
- [ ] `WIKI_SCHEMA.md` 或設定頁 systemPrompt 可定義額外子目錄，LLM 遵循使用

### AC-13 Relationship System（Graph）
- [ ] 每個 LLM 新建或更新的 wiki 頁面均包含 YAML frontmatter（含 `tags`、`created`、`updated` 及關係欄位）
- [ ] `tags` 由 LLM 依內容產生，數量為 3~10，且不固定為單一值
- [ ] Ingest 完成後，相關頁面的 YAML frontmatter 關係欄位被正確寫入
- [ ] Save to Wiki 完成後，新頁面的關係欄位被正確寫入，相關頁面的反向 `related` 連結被更新
- [ ] `/relate [page]` 可重新分析並更新指定頁面的關係欄位
- [ ] Lint 健檢結果包含孤立頁面（無關聯）的補強建議
- [ ] RelationshipWriter 不覆蓋手動設定的 frontmatter 關係（執行合併）
- [ ] 無向關係自動建立雙向反向連結；有向關係（`is_a`、`part_of`、`derived_from`）不強制雙向
- [ ] schema 中定義的自訂關係型別可被 LLM 正確使用
- [ ] 關聯指向不存在頁面時，跳過並顯示警告，不中止流程
- [ ] Obsidian Graph View 可正確顯示 wiki 頁面間的 `[[wiki links]]` 連結

### AC-09 Schema
- [ ] vault 根目錄存在 `WIKI_SCHEMA.md` 時，plugin 使用其內容作為 system prompt
- [ ] 不存在時，使用設定頁 systemPrompt 欄位（可還原為內建預設）

### AC-10 File Formats
- [ ] `.md`、`.pdf`、`.png`、`.jpg`、`.docx`、`.xlsx`、`.pptx` 均可成功 ingest
- [ ] 不支援的格式顯示明確錯誤訊息

---

## Test Plan

### Unit Tests

| 測試項目 | 說明 |
|---------|------|
| `FileParser` | 各格式提取文字的正確性與 edge cases |
| `SchemaLoader` | 優先順序邏輯（WIKI_SCHEMA.md > settings > default） |
| `IndexUpdater` | ingest/save 後 index.md 格式正確，不重複、不遺漏 |
| `LogAppender` | log entry 格式符合規範，append 不覆寫 |
| `SlashCommandParser` | 各 slash command 正確解析指令與參數 |
| `SessionManager` | session 建立、切換、更名（含 LLM 自動命名）、持久化邏輯 |
| `ContextBuilder` | 組裝 LLM context（summary + sliding window N 則）|
| `QueueManager` | auto-ingest queue 順序與並發鎖定；/ingest-all 失敗清單追蹤 |
| `FileWatcher` | 新增檔案正確觸發 ingest，修改/刪除不觸發 |
| `RelationshipWriter` | frontmatter 合併邏輯（不覆蓋手動設定）、雙向關係更新、未知型別 fallback |
| `FrontmatterParser` | YAML frontmatter 讀取與寫入的正確性 |

### Integration Tests（mock LLM）

| 測試項目 | 說明 |
|---------|------|
| Ingest flow | 從文件輸入到 wiki 頁面建立的完整流程 |
| Query flow | 從問題輸入到附引用答案的完整流程 |
| Save flow | 答案存為 wiki 頁面並更新 index/log |
| Lint flow | 觸發到結果顯示的完整流程 |
| Session persistence | 模擬 plugin 重載後 session 正確恢復 |
| Relationship flow（Ingest） | Ingest 後 frontmatter 關係欄位正確寫入，反向連結正確建立 |
| Relationship flow（Save） | Save to Wiki 後新頁面 frontmatter 與反向連結正確 |
| Relationship merge | 手動 frontmatter 不被 RelationshipWriter 覆蓋 |

### Manual / E2E Tests

| 測試項目 | 說明 |
|---------|------|
| 各 Provider 實際連線 | OpenAI / Anthropic / Ollama 實際 API 呼叫 |
| 大型 PDF ingest | 確認分段處理正常，log 記錄分段資訊 |
| 掃描版 PDF | Vision fallback 行為確認 |
| Session 切換 | 重啟 Obsidian 後歷史 session 正確恢復 |
| Auto-ingest | 監聽資料夾新增文件後自動觸發且不重複 |
| WIKI_SCHEMA.md 覆寫 | 確認 schema 優先順序正確 |
| EC-03 重複頁面名稱 | 直接覆寫行為正確，index/log 一致更新 |
| Graph View 關聯正確性 | Ingest 後 Graph View 顯示新頁面與相關頁面的連結 |
| `/relate` 指令 | 指定頁面 frontmatter 正確更新，反向連結正確 |
| Lint 孤立頁面補強 | Lint 找出無關聯頁面並提供關聯建議 |
| 手動 frontmatter 不被覆蓋 | 手動設定的關係欄位在 Ingest/reingest 後仍保留 |

---

## Implementation Tasks

### Phase 1 — 基礎架構

- [ ] **T-01** 初始化 Obsidian plugin 專案（TypeScript + esbuild，參考官方 sample plugin）
- [ ] **T-02** 實作 Plugin Settings Tab（provider、API key、model、baseUrl、路徑、systemPrompt、autoIngest、lintSchedule）
- [ ] **T-02b** 設定頁 UI 分區塊化（Provider / Vault Folders / Schema / Ingest / Lint / Context）
- [ ] **T-02c** API Key 欄位安全顯示：預設遮罩 + 眼睛圖示 show/hide 切換 + 重開設定頁回到遮罩
- [ ] **T-03** 定義 `LLMProvider` 抽象介面（`chat(messages, options): AsyncGenerator<string>`）
- [ ] **T-04** 實作 `OpenAIProvider`（含 streaming）
- [ ] **T-05** 實作 `AnthropicProvider`（含 streaming）
- [ ] **T-06** 實作 `OllamaProvider`（含 streaming）
- [ ] **T-07** 實作 `FileParser`（md、pdf、png/jpg、docx、xlsx、pptx）
- [ ] **T-08** 實作 `SchemaLoader`（優先順序邏輯）
- [ ] **T-09** 實作 `SessionManager`（CRUD、LLM 自動命名、雙擊改名、持久化至 data.json）
- [ ] **T-10** 實作 `ContextBuilder`（system prompt + summary + sliding window N 則）

### Phase 2 — Chat UI

- [ ] **T-11** 實作 `LLMWikiView`（`ItemView`，右側 sidebar，view type: `llm-wiki-chat`）
- [ ] **T-12** 實作 Session Selector 下拉元件（含「+ New Session」；雙擊改名）
- [ ] **T-13** 實作 Message List（Markdown render、`[[wiki link]]` 可點擊、Session Summary 摺疊區塊）
- [ ] **T-14** 實作 Input Bar + Slash Command 自動補全與解析
- [ ] **T-15** 實作 Save to Wiki 按鈕（立即儲存 + 自動頁名，與 `/save` 共用邏輯）
- [ ] **T-16** 實作 Streaming 回應顯示（逐字輸出）
- [ ] **T-17** 實作 Status Bar（操作進度顯示）
- [ ] **T-18** 實作 Summarize Session 按鈕（觸發 LLM 壓縮 + 更新 session.summary）

### Phase 3 — Ingest Pipeline

- [ ] **T-19** 實作 `IngestPipeline`（FileParser → LLM multi-turn → wiki 寫入）
- [ ] **T-20** 實作 `IndexUpdater`（更新 index.md）
- [ ] **T-21** 實作 `LogAppender`（append log.md）
- [ ] **T-22** 實作右鍵選單「LLM Wiki: Ingest」（`registerEvent` on file menu）
- [ ] **T-23** 實作 `/ingest`、`/reingest` 和 `/ingest-all` slash commands
- [ ] **T-24** 實作 `/ingest-all` 失敗清單追蹤 + Retry Failed 按鈕
- [ ] **T-25** 實作 Auto-ingest 資料夾監聽（`vault.on('create')` + debounce queue，修改事件不觸發）

### Phase 4 — Query Pipeline

- [ ] **T-26** 實作 `QueryPipeline`（index.md 讀取 + Obsidian `search` API 補強）
- [ ] **T-27** 實作 `/save` slash command 與 Save to Wiki 按鈕共用的存檔邏輯

### Phase 5 — Lint Pipeline

- [ ] **T-28** 實作 `LintPipeline`（LLM 健檢 prompt + 結果格式化，含孤立頁面關聯補強）
- [ ] **T-29** 實作 `/lint` slash command + Command Palette 指令
- [ ] **T-30** 實作排程 lint（`window.setInterval` / daily / weekly，預設 off）

### Phase 5b — Relationship System

- [ ] **T-31** 實作 `FrontmatterParser`（讀取與寫入 YAML frontmatter，含合併邏輯）
- [ ] **T-32** 實作 `RelationshipWriter`（LLM 識別關係 → 寫入 frontmatter → 更新反向連結）
- [ ] **T-33** 更新 `IngestPipeline`，在 wiki 寫入後呼叫 `RelationshipWriter`
- [ ] **T-34** 更新 Save to Wiki 邏輯，存檔後呼叫 `RelationshipWriter`
- [ ] **T-35** 實作 `/relate [page]` slash command
- [ ] **T-36** 更新 `LintPipeline`，加入孤立頁面關聯補強步驟
- [ ] **T-37** 更新內建預設 `WIKI_SCHEMA`，加入關係型別定義、frontmatter 規範與雙向連結規則
- [ ] **T-38** （Phase 2 預留）自訂關係圖面板（D3.js / Cytoscape.js）

### Phase 6 — 收尾

- [ ] **T-39** 首次使用時自動建立 wiki/raw 資料夾 + 預設子目錄 + 初始 index.md、log.md
- [ ] **T-40** 撰寫 Unit Tests（T-01～T-10、T-31～T-32 對應邏輯）
- [ ] **T-41** 撰寫 Integration Tests（mock LLM，含 relationship flow）
- [ ] **T-42** 撰寫 README（安裝、設定、使用說明，含 Graph View 使用說明）
- [ ] **T-43** 撰寫 `manifest.json`（Obsidian plugin 上架所需欄位）

---

## Resolved Decisions

> 所有假設已於 2026-05-22 與使用者確認，無未解決項目。

| # | 決策 | 結果 |
|---|------|------|
| A-01 | 掃描版 PDF 處理 | Vision 優先（model 支援時）；不支援則跳過並告知使用者 |
| A-02 | Session context 管理 | 完整歷史保留；LLM 呼叫傳 summary + 最新 N 則；使用者可手動觸發 Summarize Session |
| A-03 | Auto-ingest 偵測範圍 | 只偵測新增；提供 `/reingest` 指令供手動重新攝取 |
| A-04 | Wiki 目錄結構 | 預設 4 子目錄（sources/entities/concepts/analyses）；schema 可擴充自訂類別 |
| A-05 | `/ingest-all` 錯誤處理 | 遇錯繼續；完成後顯示失敗清單並提示 `/ingest-all retry` |
| A-06 | Session 命名 | LLM 在第一則對話後自動生成標題；使用者可按 Rename 改名 |
| A-07 | Graph 呈現 | 原生 Graph View（`[[links]]`）為主 + YAML frontmatter 語意關係；自訂圖留 Phase 2 |
| A-08 | 關係型別 | 預設 7 種型別（related/is_a/part_of/mentions/supports/contradicts/derived_from）；schema 可擴充 |
| A-09 | 關係建立時機 | Ingest + Query Save + `/relate` 指令 + Lint 補漏，四個時機均觸發 RelationshipWriter |
