## 1. Project Scaffold

- [ ] 1.1 Initialize Obsidian plugin repo with esbuild scaffold (`manifest.json`, `main.ts`, `styles.css`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`)
- [ ] 1.2 Install core dependencies: `obsidian`, `typescript`, `esbuild`, `@types/node`
- [ ] 1.3 Install file-parsing libraries: `pdfjs-dist`, `mammoth`, `xlsx`, `pptx-to-text`
- [ ] 1.4 Create folder structure: `src/providers/`, `src/features/`, `src/ui/`, `src/storage/`, `src/schema/`

## 2. Settings

- [ ] 2.1 Define `LLMWikiSettings` interface (provider, apiKey, model, rawSourcesFolder, wikiFolder, sessionsFolder, autoIngest, autoLintSchedule, contextWindowSize, schemaOverrides)
- [ ] 2.2 Implement `DEFAULT_SETTINGS` with all defaults
- [ ] 2.3 Build `LLMWikiSettingsTab` (Obsidian `PluginSettingTab`): provider dropdown, API key field, model name field
- [ ] 2.4 Add folder path fields to settings tab (raw sources, wiki, sessions)
- [ ] 2.5 Add wiki schema fields to settings tab (default page type, relation types, WIKI_SCHEMA.md toggle)
- [ ] 2.6 Add auto-ingest toggle to settings tab
- [ ] 2.7 Add auto-lint schedule dropdown (Off / Daily / Weekly) to settings tab
- [ ] 2.8 Add context window size numeric input (default 20) to settings tab
- [ ] 2.9 Wire `loadData()` / `saveData()` for settings persistence

## 3. LLM Provider Abstraction

- [ ] 3.1 Define `LLMProvider` interface with `chat(messages, opts): AsyncIterable<string>`
- [ ] 3.2 Implement `OpenAIProvider` using `fetch` with SSE streaming
- [ ] 3.3 Implement `AnthropicProvider` using `fetch` with SSE streaming
- [ ] 3.4 Implement `OllamaProvider` using Ollama's local API with streaming
- [ ] 3.5 Implement `ProviderFactory.create(settings)` that returns the correct provider
- [ ] 3.6 Add error handling: missing API key notice, HTTP errors, timeout

## 4. Wiki Schema

- [ ] 4.1 Define default schema constant (types: `concept`, `summary`, `qa`; default relation: `related`; frontmatter template)
- [ ] 4.2 Implement `SchemaLoader.load(vault, settings)`: check for `WIKI_SCHEMA.md`, parse it, merge with settings overrides, fall back to default
- [ ] 4.3 Implement `WikiPageTemplate.render(title, content, type, relations)` that produces YAML frontmatter + body

## 5. Session Storage

- [ ] 5.1 Define `Session` and `ChatMessage` types
- [ ] 5.2 Implement `SessionStore`: create, load, save, list sessions as JSON files under `.llm-wiki/sessions/`
- [ ] 5.3 Implement `sessions-index.json` read/write for ordered session list
- [ ] 5.4 Implement max-message guard (default 500): auto-trigger summarize when limit approached

## 6. Chat UI Panel

- [ ] 6.1 Implement `LLMWikiView` extending `ItemView` (view type, display text, icon)
- [ ] 6.2 Register the view and add ribbon icon in `Plugin.onload()`
- [ ] 6.3 Build session selector dropdown at panel top (shows session titles, allows switching)
- [ ] 6.4 Implement message list renderer (user bubble, LLM bubble with streaming token append)
- [ ] 6.5 Build chat input (textarea, Send button, Enter/Shift+Enter behavior)
- [ ] 6.6 Add "Save to Wiki" button to each LLM message bubble
- [ ] 6.7 Add loading/spinner indicator during in-flight requests
- [ ] 6.8 Implement slash command parser: detect `/command [args]` vs. plain query
- [ ] 6.9 Register "LLM Wiki: Open Chat" command palette item

## 7. Ingest Feature

- [ ] 7.1 Implement `IngestService.ingest(file, vault, provider, schema, settings)` — parses file, calls LLM to generate/update wiki pages, streams progress to chat
- [ ] 7.2 Implement file format dispatcher: route to `.md`, `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.png`/`.jpg` parsers (dynamic imports)
- [ ] 7.3 Implement `PdfParser`, `DocxParser`, `XlsxParser`, `PptxParser` (dynamic imports)
- [ ] 7.4 Implement image ingest: base64-encode image, send to vision-capable model
- [ ] 7.5 Implement content-hash deduplication (store hash in session metadata; skip if unchanged)
- [ ] 7.6 Register File Explorer context-menu item "LLM Wiki: Ingest"
- [ ] 7.7 Wire `/ingest [[filename]]` slash command to `IngestService`
- [ ] 7.8 Wire `/reingest [[filename]]` slash command to force re-ingest
- [ ] 7.9 Implement auto-watch: subscribe to `vault.on('create')` filtered to raw-sources folder with 2s debounce
- [ ] 7.10 Update `wiki/index.md` and `wiki/log.md` after successful ingest

## 8. Query Feature

- [ ] 8.1 Implement `QueryService.query(userMessage, session, vault, provider, settings)`: read relevant wiki pages, build LLM prompt, stream response to chat
- [ ] 8.2 Implement wiki page reader: list all files under wiki folder, read their content
- [ ] 8.3 Wire plain chat messages (non-slash) to `QueryService`
- [ ] 8.4 Wire "Save to Wiki" button to `SaveService.save(content, vault, schema, settings)`
- [ ] 8.5 Wire `/save [title]` slash command to `SaveService`
- [ ] 8.6 Update `wiki/index.md` and `wiki/log.md` after save

## 9. Lint Feature

- [ ] 9.1 Implement `LintService.lint(vault, provider, settings)`: read all wiki pages, call LLM for health check, return structured report
- [ ] 9.2 Include orphan detection (pages with no incoming/outgoing wikilinks) in lint prompt
- [ ] 9.3 Include broken-link detection (wikilinks to non-existent pages) in lint prompt
- [ ] 9.4 Wire `/lint` slash command to `LintService`
- [ ] 9.5 Register "LLM Wiki: Lint Wiki" command palette item
- [ ] 9.6 Wire "Save to Wiki" on lint results to `SaveService`
- [ ] 9.7 Implement auto-lint scheduler using `setInterval`/Obsidian's scheduled tasks; trigger based on settings (daily/weekly)

## 10. Graph Relations Feature

- [ ] 10.1 Implement `RelationService.analyse(pages, newPage, provider, schema)`: call LLM to identify semantic relations, return `{ page, relations }` list
- [ ] 10.2 Implement `RelationService.writeRelations(vault, relationsMap)`: read each page's frontmatter, merge new wikilinks into `related:` (and custom relation fields), write back
- [ ] 10.3 Call `RelationService` at end of ingest (post-ingest hook)
- [ ] 10.4 Call `RelationService` at end of save-to-wiki
- [ ] 10.5 Wire `/relate [[page]]` slash command to `RelationService` for single-page re-analysis
- [ ] 10.6 In lint, identify pages with empty `related:` and attempt relation population
- [ ] 10.7 Support custom relation types from schema (populate named frontmatter fields alongside `related:`)

## 11. Session Management Feature

- [ ] 11.1 On plugin load, create a new session and display it in the chat panel
- [ ] 11.2 Implement session title auto-generation: after first LLM response, call LLM for a 5-word title, update session JSON and selector
- [ ] 11.3 Implement inline session rename: double-click session name in selector → editable input → Enter to save
- [ ] 11.4 Implement `/summarize` slash command: call LLM to compress session history, store summary in session JSON, confirm in chat
- [ ] 11.5 Implement sliding context window in all LLM calls: `[summary?] + last N messages`
- [ ] 11.6 Populate session selector with all sessions from `sessions-index.json`; allow switching

## 12. Polish and Integration

- [ ] 12.1 Add Obsidian Notice banners for all error states (missing API key, unsupported file, parse error, WIKI_SCHEMA.md parse warning)
- [ ] 12.2 Add plugin `onunload()` cleanup (remove event listeners, close view)
- [ ] 12.3 Verify Graph View shows edges when `related:` frontmatter contains `[[wikilinks]]`
- [ ] 12.4 Write `README.md` with installation, setup, and quick-start instructions
- [ ] 12.5 Test with each supported provider (OpenAI, Anthropic, Ollama) and each file format
