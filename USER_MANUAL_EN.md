# LLM Wiki Plugin — Complete User Manual

> Version: 2026-05-26 implementation  
> Supported environment: Obsidian v1.5+, Windows / macOS / Linux

---

## Table of Contents

1. [Plugin Overview](#1-plugin-overview)
2. [Installation & First Launch](#2-installation--first-launch)
3. [Vault Directory Structure](#3-vault-directory-structure)
4. [Plugin Settings](#4-plugin-settings)
5. [Chat Interface](#5-chat-interface)
6. [Session Management](#6-session-management)
7. [Slash Commands Reference](#7-slash-commands-reference)
8. [Ingest Workflow](#8-ingest-workflow)
9. [Save to Wiki](#9-save-to-wiki)
10. [Lint Health Check](#10-lint-health-check)
11. [Graph Relations](#11-graph-relations)
12. [WIKI_SCHEMA.md Configuration](#12-wiki_schemamd-configuration)
13. [index.md — The Global Index](#13-indexmd--the-global-index)
14. [log.md — Operation Log](#14-logmd--operation-log)
15. [.llm-wiki Internal Directory](#15-llm-wiki-internal-directory)
16. [Auto Ingest](#16-auto-ingest)
17. [FAQ](#17-faq)

---

## 1. Plugin Overview

**Obsidian LLM Wiki** is an Obsidian plugin that lets an LLM (Large Language Model) continuously maintain a structured wiki knowledge base for you.

### Core Concepts

| Role | Responsibility |
| --- | --- |
| **raw/** (raw source folder) | Stores your original documents; the plugin **reads only** from this folder |
| **wiki/** (knowledge base) | Structured pages created, updated, and maintained by the LLM |
| **LLM** | Reads source documents and automatically splits them into source pages, entity pages, and concept pages, then builds semantic relationships between pages |
| **User** | Provides raw material, asks questions or issues commands, and decides when to save or reorganize the wiki |

### Key Features

- **Ingest**: The LLM reads source documents and automatically creates wiki pages, an index, and relationships
- **Query**: Ask questions in chat; the LLM synthesizes answers using the wiki as its knowledge base
- **Save to Wiki**: Save an LLM response as a new wiki page
- **Lint**: The LLM identifies orphaned pages and broken links, and provides improvement suggestions
- **Session**: Multiple independent conversations that can be switched, renamed, and summarized
- **Relations**: Automatically writes semantic relationships into each page's YAML frontmatter, visible in Graph View

---

## 2. Installation & First Launch

### Installation

1. Copy the `obsidian-llm-wiki` plugin folder (containing `main.js`, `manifest.json`, and `styles.css`) to `.obsidian/plugins/obsidian-llm-wiki/` inside your Vault.
2. In Obsidian Settings → Community Plugins, find **Obsidian LLM Wiki** and enable it.

### First Launch

After enabling, the plugin automatically:

1. Creates the `raw/` folder (if it doesn't exist)
2. Creates the `wiki/` folder and four subdirectories: `sources/`, `entities/`, `concepts/`, `analyses/`
3. Creates `wiki/index.md` (empty index) and `wiki/log.md` (empty log)
4. Creates the `.llm-wiki/sessions/` directory for session data

### Opening the Chat Interface

There are three ways:

| Method | Action |
| --- | --- |
| Ribbon Icon | Click the 🤖 robot icon in the left sidebar |
| Command Palette | Press `Ctrl+P` and search for "Obsidian LLM Wiki: Open Chat" |
| Either method | Available any time after initial setup |

---

## 3. Vault Directory Structure

```
Your Vault/
├── raw/                         ← Source documents (you manage this; plugin is read-only)
│   ├── articles/
│   │   └── api-design.md
│   ├── papers/
│   │   └── rest-principles.pdf
│   └── screenshots/
│       └── diagram.png
│
├── wiki/                        ← Knowledge base maintained by the plugin
│   ├── index.md                 ← Auto-generated global index
│   ├── log.md                   ← Append-only operation log
│   ├── sources/                 ← Summary page for each source document
│   │   └── api-design.md
│   ├── entities/                ← Entity pages (people, organizations, products, services, etc.)
│   │   └── REST.md
│   ├── concepts/                ← Concept pages (terminology, technology, theories, etc.)
│   │   └── HTTP Methods.md
│   └── analyses/                ← Analysis pages (Q&A, comparative analyses, etc.)
│       └── REST vs GraphQL 2026-05-26-10-30-00.md
│
├── WIKI_SCHEMA.md               ← (Optional) Custom schema override file
│
└── .obsidian/
    └── plugins/
        └── obsidian-llm-wiki/
            └── data.json        ← Plugin settings (provider config, session info)
│
└── .llm-wiki/                   ← Plugin internal data (not wiki content)
    ├── sessions/                ← Session conversation data
    │   ├── sessions-index.json  ← Session index
    │   └── session-xxxx.json   ← Full conversation for each session
    └── ingest-hashes.json       ← Hash cache of ingested files (avoids re-ingesting unchanged files)
```

### Directory / File Reference

| Directory / File | Purpose | Written by |
| --- | --- | --- |
| `raw/` | Raw source material; keep read-only | User |
| `wiki/sources/` | Summary page for each source document | Plugin (Ingest) |
| `wiki/entities/` | Entity pages: names, organizations, products, APIs, etc. | Plugin (Ingest) |
| `wiki/concepts/` | Concept pages: technical terms, methodologies, abstract ideas | Plugin (Ingest) |
| `wiki/analyses/` | Analysis pages: saved Q&A or comparative analysis from user queries | Plugin (Save to Wiki / /save) |
| `wiki/index.md` | Global index; lists links to all wiki pages by category | Plugin (updated after each Ingest/Save/Reindex) |
| `wiki/log.md` | Append-only operation log recording details of each ingest/query/save/lint | Plugin (automatic) |
| `WIKI_SCHEMA.md` | Override the default schema: customize page types and relation types | User (optional) |
| `.llm-wiki/sessions/` | All session conversation records; persists after Obsidian restarts | Plugin (automatic) |
| `.llm-wiki/ingest-hashes.json` | Records SHA-256 hashes of ingested files; prevents re-ingesting unchanged content | Plugin (automatic) |

---

## 4. Plugin Settings

Open the settings page via Obsidian **Settings → LLM Wiki**.

### 4.1 Provider Settings

The plugin supports multiple LLM Providers. **Each Provider stores its own settings** independently (API Key, Model, and Base URL do not share values).

| Field | Description |
| --- | --- |
| **Provider** | Select the Provider to use: OpenAI / Anthropic / Ollama |

When you switch Providers, the three fields below automatically load the last saved values for that Provider.

#### Per-Provider Settings

| Field | Description | Notes |
| --- | --- | --- |
| **API Key** | API key for the selected Provider | Can be left empty for local Ollama |
| **Model** | Model name or Deployment Name | See default values per Provider below |
| **Base URL** | Override the API endpoint URL (optional) | Ollama default: `http://127.0.0.1:11434/api/chat` |
| **Azure OpenAI API Version** | Only shown when OpenAI Provider is selected and Base URL is an Azure endpoint | Default: `2024-10-21` |

#### Default Models per Provider

| Provider | Default Model |
| --- | --- |
| OpenAI | `gpt-5.4-mini` |
| Anthropic | `claude-sonnet-4-6` |
| Ollama | `llama3.1` |
| Google Gemini | `gemini-2.5-flash` |

#### Azure OpenAI Setup

1. Select **OpenAI** as the Provider
2. Enter the Azure OpenAI `api-key` in the API Key field
3. Enter the Azure endpoint in Base URL (e.g., `https://my-resource.openai.azure.com`)
4. Enter the Deployment Name in the Model field (e.g., `my-gpt4o-deployment`)
5. Enter the corresponding API version in Azure API Version (default: `2024-10-21`)

#### Google Gemini Setup

1. Select **Google Gemini** as the Provider
2. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) to obtain an API Key
3. Enter the key in the API Key field
4. Enter the model name in the Model field (default: `gemini-2.5-flash`; other options include `gemini-2.5-pro`, `gemini-2.0-flash`)
5. Leave Base URL empty (uses default `https://generativelanguage.googleapis.com`); set a custom URL if using a proxy

> **Common Gemini model names:**
> - `gemini-2.5-flash` (default; balanced speed and quality)
> - `gemini-2.5-pro` (higher capability)
> - `gemini-2.0-flash` (compatible fallback)

### 4.2 Path Settings

| Field | Default | Description |
| --- | --- | --- |
| **Raw sources path** | `raw` | Path to the raw source folder (relative to Vault root) |
| **Wiki path** | `wiki` | Root path for the wiki knowledge base |
| **Sessions path** | `.llm-wiki/sessions` | Storage path for session conversation data |

### 4.3 Wiki Schema Settings

| Field | Default | Description |
| --- | --- | --- |
| **Use WIKI_SCHEMA.md** | Enabled | When enabled, reads `WIKI_SCHEMA.md` from the Vault root to override some schema settings |
| **System prompt override** | (default prompt) | Override the system prompt sent to the LLM |
| **Relation types override** | (empty) | Comma-separated list to override allowed relation types. Leave empty to use defaults |

### 4.4 Ingest Settings

| Field | Default | Description |
| --- | --- | --- |
| **Auto ingest** | Enabled | Automatically triggers ingest when a supported file is added to the `raw/` folder |

> **Note:** Auto Ingest only detects **newly added** files, not modifications to existing files. For modified files, use `/reingest` to re-ingest manually.

### 4.5 Lint Schedule Settings

| Field | Default | Description |
| --- | --- | --- |
| **Lint schedule** | Off | Off / Daily / Weekly — runs an automatic wiki health check |
| **Lint time (HH:mm)** | `09:00` | Execution time for daily or weekly runs; format: `HH:mm` (24-hour) |
| **Catch up missed lint on startup** | Off | When enabled, if a scheduled lint was missed while Obsidian was closed, it runs on the next startup |

### 4.6 Context Settings

| Field | Default | Description |
| --- | --- | --- |
| **Context window size** | `20` | Number of most recent messages included in each LLM call (excluding session summary) |

---

## 5. Chat Interface

### 5.1 Layout Overview

```
┌──────────────────────────────────────────┐
│ [Session Selector ▼] [+ New] [Rename] [Summarize Session] │  ← Toolbar
├──────────────────────────────────────────┤
│                                          │
│   [Session Summary] (collapsible, if present)             │
│                                          │
│   User: What is JWT?                     │
│                                          │
│   Assistant: JWT (JSON Web Token) is...  │
│   [Save to Wiki]                         │  ← Below each Assistant reply
│                                          │
│   User: What about OAuth?                │
│                                          │
├──────────────────────────────────────────┤
│ [Type a message...                     ] │  ← Input Bar
│ [Send]                                   │
├──────────────────────────────────────────┤
│ Status: Ingesting wiki/sources/jwt.md... │  ← Status Bar
└──────────────────────────────────────────┘
```

### 5.2 Sending Messages

- Type your question in the input box and press **Enter** or click **Send**
- Use **Shift + Enter** for a line break without sending
- Responses are displayed in streaming mode (character by character)

### 5.3 Save to Wiki Button

Each Assistant reply has a **Save to Wiki** button below it:

1. Clicking the button **immediately saves** that reply to `wiki/analyses/`
2. The page title is **auto-generated** (from the first meaningful line of the reply + a timestamp); no manual input needed
3. After saving, a notification shows: `Saved to wiki: <title>`
4. Semantic relation analysis runs automatically, updating the new page's YAML frontmatter
5. The operation is logged to `wiki/log.md`

> **Tip:** To specify a custom title, use the `/save <title>` command instead.

### 5.4 Toolbar Buttons

| Button | Function |
| --- | --- |
| **Session Selector (dropdown)** | Click to expand the session list and switch to another session |
| **+ New Session** | Create a new blank session |
| **Rename** | Rename the current session (opens an input dialog) |
| **Summarize Session** | Ask the LLM to summarize the current session's full conversation history |

### 5.5 Status Bar

Located at the very bottom of the interface; displays real-time progress of the current operation, such as:

- `Reading source...` (reading a source file during ingest)
- `Generating wiki content...` (LLM is generating page content)
- `Updating wiki page...` (writing to a wiki page)
- `Thinking...` (LLM is processing a query)
- `Summarizing...` (session summary is being generated)

The status bar clears after the operation completes.

---

## 6. Session Management

### 6.1 Session Concept

All conversations take place within a **Session**. All sessions are **permanently saved** and persist after Obsidian is closed.

### 6.2 Creating a New Session

Click **+ New Session** in the Toolbar. The new session title defaults to "New Session".

After the first exchange, the LLM will **automatically generate a 3–6 word short title** to replace "New Session".

### 6.3 Switching Sessions

1. Click the **Session Selector dropdown** in the Toolbar to expand the session list
2. The list is sorted in reverse chronological order (most recently updated at the top)
3. Click the target session name to switch
4. After switching, the chat area displays the full conversation history of that session

### 6.4 Renaming a Session

**Method 1: Rename button**
1. Make sure the session you want to rename is active
2. Click the **Rename** button in the Toolbar
3. Enter the new name in the dialog that appears; press Enter to confirm (or Escape / Cancel to abort)

**Method 2: Double-click in the session list**
1. Expand the Session Selector
2. **Double-click** the target session name to enter rename mode

### 6.5 Deleting a Session

1. Expand the Session Selector
2. Each session item has an **X** button on the right
3. Clicking X prompts for confirmation; confirming deletes it permanently
4. If the deleted session was the active one, the plugin automatically switches to the most recently updated other session; if no other sessions exist, a new session is created automatically

### 6.6 Session Summary (Compression)

When conversation history becomes long, use summary compression to reduce the number of tokens sent to the LLM:

1. Click **Summarize Session** in the Toolbar
2. The LLM compresses the entire current session into a Summary
3. The Summary appears in a collapsible block labeled "Session Summary" at the top of the chat area
4. Subsequent conversations use: **system prompt + Summary + most recent N messages** (N = Context Window Size setting)

> **Tip:** After compression, old messages are still retained; they are simply not included in LLM calls. You can also trigger this with the `/summarize` command.

### 6.7 Session Data Storage

Session data is stored in `.llm-wiki/sessions/`:

- `sessions-index.json`: Records all sessions' IDs, titles, and last-updated timestamps
- `session-<id>.json`: Full conversation record for each session (including Summary and all messages)

Each session retains a maximum of `maxMessagesPerSession` messages (default: 500); the oldest messages are trimmed when the limit is exceeded.

---

## 7. Slash Commands Reference

Type `/` in the chat input box to run specific commands. Use `/help` at any time to view the command list.

### Full Command List

| Command | Description | Example |
| --- | --- | --- |
| `/help` | Display the full command list and usage in chat | `/help` |
| `/ingest <path>` | Ingest a single source file, creating/updating its wiki page | `/ingest raw/api/auth.md` |
| `/reingest <path>` | Force re-ingest a file (even if content is unchanged) | `/reingest raw/api/auth.md` |
| `/ingest-all` | Batch ingest all supported files under the raw path | `/ingest-all` |
| `/ingest-all retry` | Retry only the files that failed in the last `/ingest-all` run | `/ingest-all retry` |
| `/save [title]` | Save the last assistant reply to wiki/analyses | `/save JWT Authentication Flow` |
| `/lint` | Run a wiki health check (orphans, broken links, LLM analysis report) | `/lint` |
| `/relate <page>` | Re-analyze semantic relations for a page and update its YAML frontmatter | `/relate JWT` |
| `/clean-links` | Scan the entire wiki and remove wikilinks pointing to non-existent pages | `/clean-links` |
| `/log-tail [n]` | Show the most recent n log entries (default: 20, max: 200) | `/log-tail 50` |
| `/log-filter <type>` | Filter the log by operation type; combine multiple types | `/log-filter ingest\|lint` |
| `/reindex` | Rebuild `wiki/index.md` based on current wiki pages | `/reindex` |
| `/summarize` | Summarize the current session's conversation history | `/summarize` |

### Detailed Command Descriptions

#### /ingest `<path>`

Ingests the specified source file into the wiki. Steps:
1. Reads and parses the source file (supports md / pdf / png / jpg / docx / xlsx / pptx)
2. If the file content is identical to the last ingest (hash unchanged), automatically skips (shows "Ingest skipped: unchanged file.")
3. Creates or updates `wiki/sources/<filename>.md` (source summary page)
4. Extracts entity pages (`wiki/entities/`) and concept pages (`wiki/concepts/`) from the content
5. Runs semantic relation analysis and updates related pages' YAML frontmatter
6. Cleans up wikilinks in newly generated pages that point to non-existent pages
7. Updates `wiki/index.md`
8. Appends an `ingest | <title>` entry to `wiki/log.md`

**Supported path formats:**
- Standard path: `raw/api/auth.md`
- Wikilink format: `[[raw/api/auth]]`

#### /reingest `<path>`

Same as `/ingest`, but **skips the hash comparison** and forces re-ingest regardless of whether the content has changed.

Use cases:
- The file has actually been modified but the hash cache was not updated
- You want to update old wiki pages to reflect the latest LLM capabilities
- Testing or debugging

#### /ingest-all

Scans the entire `raw/` folder (including subdirectories) and batch-ingests all supported files:
- Processes files sequentially (not in parallel) to avoid write conflicts on `index.md`
- Hash checks still apply; unchanged files are skipped
- A failure on one file **does not stop** processing of subsequent files
- After completion, if any files failed, a message shows: "Ingest-all done with N failures. Run /ingest-all retry"

#### /ingest-all retry

Retries only the files that failed in the most recent `/ingest-all` run; successfully processed files are not repeated.

#### /save `[title]`

Saves the **last assistant reply** in chat to `wiki/analyses/<title>.md`:
- If no title is provided, defaults to `Saved YYYY-MM-DD` format
- Semantic relation analysis runs automatically after saving
- Updates `wiki/index.md` and `wiki/log.md`

> **Difference from the Save to Wiki button:** The button auto-extracts the title from the first line of the reply; this command lets you specify the title manually.

#### /lint

Runs a wiki health check:

1. **Local analysis:**
   - Counts all wiki pages
   - Identifies orphaned pages: pages with no incoming or outgoing wikilinks
   - Identifies broken links: wikilinks pointing to non-existent pages
2. **LLM analysis:** Sends the statistics to the LLM, which returns:
   - An overall wiki health assessment
   - Improvement suggestions for orphaned pages
   - Fix recommendations for broken links
   - Hints about conceptual gaps or missing pages
3. Results stream into chat; each reply has a **Save to Wiki** button to save the report

#### /relate `<page>`

Re-analyzes the semantic relations between the specified page and other wiki pages, then updates the relation fields in that page's YAML frontmatter.

- `<page>` is the page title (without path or extension), e.g.: `/relate JWT`
- Also accepts wikilink format: `/relate [[wiki/concepts/JWT]]`
- Only updates pages in the `sources/`, `entities/`, and `concepts/` folders (to avoid affecting the index and log)
- Uses a **merge strategy**: only adds newly identified relations; does not overwrite manually set relations

#### /clean-links

Scans all `.md` pages in the entire wiki and removes wikilinks pointing to non-existent pages.

Use case: After deleting certain wiki pages, use this command to clean up residual broken links.

Completion message: `Cleaned broken wikilinks: updated X/Y pages.`

#### /log-tail `[n]`

Displays the most recent n entries from `wiki/log.md` in chat.

- Default: **20** entries
- Maximum: **200** entries
- Example: `/log-tail 30`

#### /log-filter `<type>`

Filters the log by operation type, showing at most 100 matching entries.

Supported types: `ingest`, `query`, `lint`

Combine multiple types with `|` or `,`:
- `/log-filter ingest` (ingest records only)
- `/log-filter ingest|lint` (ingest and lint records)
- `/log-filter query,lint` (query and lint records)

#### /reindex

Rebuilds `wiki/index.md` based on all `.md` pages currently in the wiki folder (excluding `index.md` and `log.md`).

Use cases:
- Sync the index after manually adding or deleting wiki pages
- Fix incorrect index entries
- Rebuild the index after changing the wiki path

#### /summarize

Equivalent to clicking the **Summarize Session** button in the Toolbar; asks the LLM to summarize the current session's full conversation history.

---

## 8. Ingest Workflow

### 8.1 Supported Source File Formats

| Format | Supported Content |
| --- | --- |
| `.md` | Full Markdown text |
| `.pdf` | Full text from text-layer PDFs; scanned PDFs (no text layer) are processed as images if the model supports vision |
| `.png` / `.jpg` | Images sent as base64 to vision-capable models |
| `.docx` | Full Word document text |
| `.xlsx` | Excel worksheet content |
| `.pptx` | Full PowerPoint slide text |

### 8.2 Pages Generated After Ingest

After ingesting a source document, the wiki will contain:

1. **Source page** (`wiki/sources/<filename>.md`): A comprehensive summary of the source document
2. **Entity pages** (`wiki/entities/<name>.md`): Concrete entities extracted from the content (zero or more)
3. **Concept pages** (`wiki/concepts/<name>.md`): Abstract concepts extracted from the content (zero or more)

All pages include YAML frontmatter with type, title, created date, updated date, tags, and relation fields.

### 8.3 YAML Frontmatter Format

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

JWT (JSON Web Token) is an open standard...
```

### 8.4 Content Hash Cache

During ingest, the plugin calculates a SHA-256 hash of the source file and stores it in `.llm-wiki/ingest-hashes.json`.

On subsequent ingest of the same file:
- If the hash matches (content unchanged) → skips with "Ingest skipped: unchanged file"
- If the hash differs (content changed) → re-ingests and updates the hash cache

To force ingest, use `/reingest` to bypass the hash check.

---

## 9. Save to Wiki

### 9.1 Two Ways to Save

| Method | Action | Title Source |
| --- | --- | --- |
| **Save to Wiki button** | Click the button below any Assistant reply | Auto-extracted from the first line of the reply + timestamp |
| **/save command** | Type `/save <title>` in the input box | User-defined title |

### 9.2 Auto-Title Rules (Button Save)

1. Takes the first line of the reply that contains meaningful text (strips Markdown symbols)
2. Truncates to a maximum of 48 characters
3. Appends a timestamp in the format: `YYYY-MM-DD-HH-mm-ss`
4. Example final title: `JWT is an Open Standard 2026-05-26-10-30-00`

### 9.3 Automated Steps After Saving

1. Page is saved to `wiki/analyses/<title>.md`
2. Semantic relation analysis is triggered (`/relate <title>`)
3. `wiki/index.md` is updated
4. A `save-success` entry is appended to `wiki/log.md` (or `save-error` on failure)
5. A notification shows: `Saved to wiki: <title>`

### 9.4 Handling Duplicate Titles

If a title already exists, the plugin **overwrites** the existing page and updates the index/log.

---

## 10. Lint Health Check

### 10.1 Orphaned Pages (Definition)

A page is considered an orphan if it meets **both** of the following conditions:
- No other page has a wikilink pointing to it (incoming = 0)
- It has no wikilinks pointing to other pages (outgoing = 0)

> Note: `index.md` and `log.md` are excluded from orphan detection.

### 10.2 Broken Links (Definition)

A wikilink whose target page title cannot be found as an existing `.md` file in the wiki.

### 10.3 Lint Report Format

Lint results are displayed in chat and include:
- Statistics (total pages, orphan count, broken link count)
- LLM health assessment
- Specific improvement suggestions

You can click **Save to Wiki** to save the Lint report to `wiki/analyses/`.

### 10.4 Automatic Lint Schedule

Configure in Settings:
- **Lint schedule**: Daily or Weekly
- **Lint time**: Execution time (e.g., `09:00`)
- **Catch up on startup**: If Obsidian was closed during a scheduled lint window, runs on next startup

You can also run it at any time via Command Palette: "LLM Wiki: Lint Wiki".

---

## 11. Graph Relations

### 11.1 Semantic Relation Types

The following relation types are supported by default:

| Relation Type | Description |
| --- | --- |
| `related` | General relationship (bidirectional) |
| `is_a` | A is_a B: A is a type of B |
| `part_of` | A part_of B: A is a component of B |
| `mentions` | A mentions B: A references B |
| `supports` | A supports B: A corroborates or provides evidence for B |
| `contradicts` | A contradicts B: A conflicts with B |
| `derived_from` | A derived_from B: A is derived from B |

Relation types can be customized via `WIKI_SCHEMA.md` or the **Relation types override** setting.

### 11.2 YAML Relation Format

```yaml
related:
  - "[[wiki/concepts/OAuth]]"
is_a:
  - "[[wiki/concepts/Token]]"
derived_from:
  - "[[wiki/sources/api-design]]"
```

### 11.3 Viewing Relations in Graph View

Obsidian's native Graph View automatically reads `[[wikilinks]]` from YAML frontmatter and displays them as connections between pages.

Open with: `Ctrl+Shift+G` (or Command Palette → Open Graph View)

### 11.4 Merge Safety

- Relation analysis only **adds** newly identified links
- Does not overwrite any relations you have manually written into frontmatter
- The same link is never written twice (automatic deduplication)

---

## 12. WIKI_SCHEMA.md Configuration

Create `WIKI_SCHEMA.md` in your Vault root to override some default settings.

### 12.1 What Can You Put in WIKI_SCHEMA.md?

The plugin currently reads **2 fields** from `WIKI_SCHEMA.md`:

- `defaultPageType`
- `relationTypes`

In short, `WIKI_SCHEMA.md` primarily controls the "default page type" and "allowed relation fields".

> Note: `WIKI_SCHEMA.md` does **not** directly parse a `systemPrompt` field.  
> To configure the **System prompt**, use **System prompt override** in Settings.

### 12.2 Minimal Working Example

```markdown
# Wiki Schema

defaultPageType: concept

relationTypes: related, is_a, part_of, mentions, appears_in_chapter
```

| Field | Description |
| --- | --- |
| `defaultPageType` | Default `wiki_type` value for new pages |
| `relationTypes` | Allowed relation types (comma-separated) |

### 12.3 Practical Examples (Ready to Copy)

#### Example A: Documentation-Oriented (Chapter Relationships)

```markdown
# Wiki Schema

defaultPageType: concept
relationTypes: related, is_a, part_of, mentions, prerequisite_of, appears_in_chapter, example_of
```

Suitable for technical manuals, SOPs, and course notes.

#### Example B: Research/Analysis-Oriented (Evidence and Conclusions)

```markdown
# Wiki Schema

defaultPageType: summary
relationTypes: related, supports, contradicts, derived_from, cites, extends
```

Suitable for research records, decision memos, and comparative analyses.

### 12.4 Recommended Workflow for Modifications

1. Create or edit `WIKI_SCHEMA.md` in the Vault root.
2. Change only one thing at a time (e.g., add one new relation type).
3. Go to chat and run `/relate <page>` to verify the effect on a single page.
4. Once confirmed, batch-apply `/relate` to important pages.
5. Run `/reindex` when needed to update index visibility.

### 12.5 Is the System Prompt Only for Chat?

No. The **System prompt override** is used across multiple workflows:

- Query (when you ask questions in chat)
- Ingest (generating source summaries and entity/concept pages)
- Lint (LLM health check analysis)

It acts as a **global LLM behavior prompt** for the entire plugin, not just the chat interface.

### 12.6 What Happens When I Change Relation Types?

You can change them in two ways:

1. Set `relationTypes: ...` in `WIKI_SCHEMA.md`
2. Enter a comma-separated list in **Relation types override** in Settings

Effects:
- During `/relate`, the LLM will only output relation fields you have defined
- If the LLM returns an undefined field, the program falls back to `related`
- New relation fields are written into page frontmatter (e.g., `prerequisite_of:`, `cites:`)
- Existing fields are not forcibly removed; the merge strategy focuses on additions

Recommendations:
- Don't add too many relation types at once; start with 5–8 high-value fields
- Use semantically clear, consistent names (e.g., all snake_case)
- After changing relation types, consider re-running `/relate` on core pages to apply the new rules

### 12.7 Priority Order

Settings priority (highest to lowest):

1. **System prompt override** in Settings (highest)
2. **Relation types override** in Settings
3. `WIKI_SCHEMA.md` (if **Use WIKI_SCHEMA.md** is enabled)
4. Plugin built-in defaults (lowest)

### 12.8 Disabling WIKI_SCHEMA.md

Turn off **Use WIKI_SCHEMA.md** in Settings; the plugin will no longer read that file.

---

## 13. index.md — The Global Index

`wiki/index.md` is the global index of the wiki knowledge base, **automatically maintained by the plugin**; it is updated after each Ingest, Save, or `/reindex` command.

### 13.1 Format Example

```markdown
# Wiki Index

## Entities
- [[wiki/entities/Auth0]] - Auth0
- [[wiki/entities/JWT Library]] - JWT Library

## Concepts
- [[wiki/concepts/HTTPS]] - HTTPS
- [[wiki/concepts/JWT]] - JWT
- [[wiki/concepts/OAuth]] - OAuth

## Sources
- [[wiki/sources/api-design]] - api-design
- [[wiki/sources/rest-principles]] - rest-principles

## Analyses
- [[wiki/analyses/REST vs GraphQL 2026-05-26-10-30-00]] - REST vs GraphQL 2026-05-26-10-30-00
```

### 13.2 Category Reference

| Category | Corresponding Folder |
| --- | --- |
| Entities | `wiki/entities/` |
| Concepts | `wiki/concepts/` |
| Sources | `wiki/sources/` |
| Analyses | `wiki/analyses/` |
| Others | Pages not in the above four folders |

Items within each category are sorted **alphabetically by title**.

---

## 14. log.md — Operation Log

`wiki/log.md` is an **append-only** record of all operations. Each operation appends a new entry at the end of the file; existing entries are never modified.

### 14.1 Entry Types

| Entry Type | Triggered By |
| --- | --- |
| `ingest` | Successfully ingested a source file |
| `ingest-skip` | Skipped ingest because content was unchanged |
| `ingest-error` | Failed to ingest a file |
| `query` | LLM replied to a conversation message (non-command) |
| `save-success` | Successfully saved a reply as a wiki page |
| `save-error` | Failed to save a wiki page |
| `lint` | Ran a wiki health check |

### 14.2 Entry Format Example

```markdown
## [2026-05-26 10:30:00] ingest | api-design
- source: raw/api/api-design.md
- derived_entities: 3
- derived_concepts: 5
- touched_pages: 9

## [2026-05-26 10:31:05] ingest-skip | rest-principles
- source: raw/papers/rest-principles.pdf
- reason: unchanged

## [2026-05-26 10:35:22] query | What is JWT?
- session_id: session-1716711322-abc123
- response_chars: 842

## [2026-05-26 10:35:45] save-success | JWT Overview 2026-05-26-10-35-45
- source: button
- path: wiki/analyses/JWT Overview 2026-05-26-10-35-45.md
- chars: 842

## [2026-05-26 11:00:00] lint | wiki health check
- orphans: 2
- broken_links: 1
- pages: 24
```

### 14.3 Viewing the Log

Use the following commands in chat to view the log without opening `log.md` directly:

- `/log-tail 20`: Show the most recent 20 entries
- `/log-filter ingest`: Show only ingest-related entries
- `/log-filter query|save-success`: Show query and successful save entries

---

## 15. .llm-wiki Internal Directory

`.llm-wiki/` is the plugin's **internal data directory**, storing operational data that is not part of the wiki knowledge base. This directory should not be modified manually.

### Directory Structure

```
.llm-wiki/
├── sessions/
│   ├── sessions-index.json              ← Session directory (ID, title, last updated)
│   ├── session-1716711322-abc123.json   ← Full data for one session
│   └── session-1716799999-def456.json
└── ingest-hashes.json                   ← SHA-256 hash cache of ingested files
```

### sessions-index.json Format

```json
{
  "sessions": [
    {
      "id": "session-1716711322-abc123",
      "title": "JWT Authentication Flow Discussion",
      "updatedAt": "2026-05-26T10:35:45.000Z"
    }
  ]
}
```

### session-\<id\>.json Format

```json
{
  "id": "session-1716711322-abc123",
  "title": "JWT Authentication Flow Discussion",
  "createdAt": "2026-05-26T10:30:00.000Z",
  "updatedAt": "2026-05-26T10:35:45.000Z",
  "summary": "This conversation covered the structure and validation flow of JWT...",
  "summaryUpToIndex": 4,
  "messages": [
    {
      "role": "user",
      "content": "What is JWT?",
      "timestamp": "2026-05-26T10:30:00.000Z"
    },
    {
      "role": "assistant",
      "content": "JWT (JSON Web Token) is an open standard...",
      "timestamp": "2026-05-26T10:30:05.000Z"
    }
  ]
}
```

### ingest-hashes.json Format

```json
{
  "raw/api/api-design.md": "sha256:a3b4c5d6e7f8...",
  "raw/papers/rest-principles.pdf": "sha256:b1c2d3e4f5a6..."
}
```

---

## 16. Auto Ingest

When **Auto ingest** is enabled in Settings, the plugin monitors the `raw/` folder (and subdirectories) for **newly added file** events.

### How It Works

1. When a new file is detected, waits **2 seconds** (debounce) to avoid triggering multiple times when several files are added at once
2. If another new file appears within those 2 seconds, the timer resets
3. After the timer expires, all pending new files are ingested sequentially

### Key Limitations

| Scenario | Behavior |
| --- | --- |
| Adding a supported format file to raw/ | ✅ Auto-triggers ingest |
| Modifying an existing file in raw/ | ❌ Not triggered; use `/reingest` |
| Deleting a file from raw/ | ❌ No action |
| Adding a file in a raw/ subdirectory | ✅ Triggered |
| Unsupported file format | ❌ Ignored |

---

## 17. FAQ

### Q1: My API Key is not saved — it disappears after switching providers?

**Cause:** The plugin stores a separate set of settings for each Provider. On first use, switch to each Provider individually and fill in the corresponding API Key, Model, and Base URL.

### Q2: After switching providers, the model name looks wrong?

This is expected. Each Provider has its own default model name. After switching to a new Provider, verify that the Model field contains the correct model name.

### Q3: /ingest shows "Ingest skipped: unchanged file"

This is normal behavior. The plugin detected that the source file's content has not changed (matching hash) and skipped re-ingesting. To force re-ingest, use `/reingest <path>`.

### Q4: No connections appear in Graph View after ingest?

Check:
1. Whether Obsidian Graph View is open
2. Whether pages in `wiki/entities/` and `wiki/concepts/` actually have YAML frontmatter
3. Try running `/relate <pagename>` to manually trigger relation analysis for a single page
4. If still not working, try `/reindex` to rebuild the index, then check Graph View again

### Q5: My session conversation history is gone?

Session data is stored in `.llm-wiki/sessions/`. If you sync your vault with Git, make sure `.llm-wiki/` is not excluded by `.gitignore`.

### Q6: LLM reply shows "Missing API key"

Go to Settings → Obsidian LLM Wiki and confirm that the currently selected Provider has a valid API Key entered.

### Q7: Ollama connection failed

Check:
1. Whether the Ollama service is running (`ollama serve`)
2. Whether the Base URL is correct (default: `http://127.0.0.1:11434/api/chat`)
3. Whether the specified model has been downloaded (`ollama pull llama3.1`)

### Q8: I want to add a custom subdirectory (e.g., `wiki/notes/`)?

You can currently guide the LLM to use custom subdirectories via `WIKI_SCHEMA.md`. If the LLM generates pages pointing to `wiki/notes/`, run `/reindex` in the session to include that directory's pages in the index.

### Q9: log.md is getting too large?

`log.md` is append-only; you can open it manually in Obsidian and delete old entries. The plugin never overwrites `log.md`; it only appends to the end.

### Q10: The automatic Lint schedule is not running?

Check:
1. Obsidian is open during the scheduled time
2. Lint schedule is set to Daily or Weekly in Settings
3. Lint time is in the correct format (`HH:mm`, 24-hour, e.g., `09:00`)
4. If Obsidian was closed during the scheduled window, enable "Catch up missed lint on startup" to run it on the next launch
