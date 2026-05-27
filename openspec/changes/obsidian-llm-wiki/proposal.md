## Why

Existing LLM + document workflows (RAG, NotebookLM, ChatGPT file upload) re-derive answers from raw sources on every query — knowledge never accumulates, cross-document synthesis is one-shot, and links between concepts are never maintained. Users need a persistent, compounding wiki inside their Obsidian vault where LLMs ingest sources, maintain structured pages, and surface relationships — so the wiki becomes a reusable asset rather than a throwaway query result.

## What Changes

- **New plugin**: `obsidian-llm-wiki` — an Obsidian community plugin built with TypeScript and the Obsidian Plugin API
- Adds a right-sidebar Chat panel for conversational interaction with the wiki
- Adds Ingest capability: LLM reads raw source files (`.md`, `.pdf`, `.png`/`.jpg`, `.docx`, `.xlsx`, `.pptx`) and writes/updates wiki pages
- Adds Query capability: LLM searches wiki pages and synthesizes answers; answers can be saved as new wiki pages
- Adds Lint capability: LLM audits the wiki for contradictions, orphaned pages, and missing links
- Adds Graph/Relations capability: LLM writes semantic `[[wiki links]]` into page frontmatter so Obsidian's native Graph View reflects knowledge relationships; `/relate` command for manual re-analysis
- Adds Session Management: persistent chat sessions with auto-generated titles, history navigation, and context summarization
- Adds Settings page: provider/model/API key selection, folder paths, schema configuration, auto-ingest toggle, auto-lint schedule, context window size

## Capabilities

### New Capabilities

- `chat-ui`: Right-sidebar Obsidian panel with chat input/output, session selector, command dispatch, and Save-to-Wiki action
- `ingest`: LLM-driven ingestion of raw source files into wiki pages; supports multiple file types, streaming progress, auto-watch mode, and re-ingest
- `query`: Natural-language query against wiki pages with LLM synthesis, citation links, and optional save-to-wiki
- `lint`: LLM wiki health-check identifying contradictions, orphaned pages, and missing links; schedulable; result optionally saved as wiki page
- `graph-relations`: Automatic and manual semantic relation analysis writing `[[wiki links]]` into page YAML frontmatter; custom relation types via schema
- `session-management`: Persistent chat sessions with creation, history, title auto-generation, manual rename, and rolling-window context summarization
- `settings`: Plugin settings panel covering LLM provider/model/key, vault folder paths, wiki schema, auto-ingest, auto-lint, and context window

### Modified Capabilities

*(none — this is a new plugin with no existing specs)*

## Impact

- **New repository**: TypeScript Obsidian plugin project (esbuild bundler, Obsidian Plugin API)
- **Dependencies**: `obsidian` (plugin API), LLM provider SDKs or direct fetch calls (OpenAI, Anthropic, Ollama), file-parsing libraries (pdf.js, mammoth, xlsx, sharp/tesseract for images)
- **Vault files written**: wiki pages under configurable `wiki/` folder, `wiki/index.md`, `wiki/log.md`, session data under `.llm-wiki/sessions/`
- **Vault files read**: raw sources folder (configurable), `WIKI_SCHEMA.md` (optional override)
- **No external backend required**: all LLM calls go directly from the plugin to the configured provider endpoint
