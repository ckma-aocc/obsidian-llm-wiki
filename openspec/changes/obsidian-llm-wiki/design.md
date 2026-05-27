## Context

This is a brand-new Obsidian community plugin. No existing codebase to migrate. The plugin must work entirely client-side inside Obsidian's Electron/Node.js environment — no external backend. LLM calls go directly from the plugin to the user's configured provider endpoint (OpenAI-compatible, Anthropic, or Ollama).

The primary reference spec is `docs/specs/obsidian-llm-wiki-plugin.md` (23 user stories across Ingest, Query, Lint, Session, Graph, and Settings).

## Goals / Non-Goals

**Goals:**
- Define the module structure and key architectural boundaries
- Decide on provider abstraction, storage model, and streaming approach
- Identify the main technical risks before implementation

**Non-Goals:**
- Line-by-line implementation details (those belong in tasks / code)
- UI visual design (Obsidian's native CSS handles most of it)
- Embedding / vector search (explicitly out of scope for v1)

## Decisions

### D1 — Plugin architecture: single-entry esbuild bundle

Use the standard Obsidian plugin scaffold: `main.ts` as entry, esbuild producing `main.js`, `manifest.json`, `styles.css`. No framework — raw DOM + Obsidian API for the sidebar view.

**Alternatives considered:**
- React/Svelte component tree → adds bundle size and complexity; Obsidian's API already provides view lifecycle hooks that map cleanly to vanilla TS classes.

---

### D2 — LLM provider abstraction: `LLMProvider` interface

Define a thin interface:
```ts
interface LLMProvider {
  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<string>;
}
```
Implementations: `OpenAIProvider`, `AnthropicProvider`, `OllamaProvider`. The plugin holds one active provider instance resolved from settings. Adding new providers requires only a new class — no changes to callers.

**Alternatives considered:**
- LangChain.js → large dependency, more than needed for this use case.
- Direct fetch in each feature → duplicates error handling and streaming logic.

---

### D3 — Streaming: Web Streams / AsyncIterable over SSE

All LLM calls stream tokens via `AsyncIterable<string>` yielded from the provider. The Chat UI consumes the iterable and appends tokens to a live `<div>` via `innerText +=`. This gives real-time output without buffering entire responses.

**Alternatives considered:**
- Collect full response then render → poor UX for long responses; loses the "thinking in progress" signal.

---

### D4 — File parsing: lazy-loaded per-format libraries

| Format | Library |
|--------|---------|
| `.pdf` | `pdfjs-dist` (already bundled by many Obsidian plugins) |
| `.docx` | `mammoth` |
| `.xlsx` | `xlsx` (SheetJS) |
| `.pptx` | `pptx-to-text` or custom XML parse |
| `.png`/`.jpg` | Pass raw base64 to vision-capable model; no local OCR |
| `.md` | Native `vault.read()` |

Libraries are imported dynamically (`import()`) so they don't inflate startup time.

**Alternatives considered:**
- Local Tesseract OCR for images → large WASM binary, slow; vision models handle this better.

---

### D5 — Session storage: JSON files under `.llm-wiki/sessions/`

Each session is one JSON file: `{ id, title, createdAt, messages: ChatMessage[] }`. The sessions folder is hidden (leading dot) so it doesn't clutter the vault graph. A `sessions-index.json` holds the ordered list for the session selector.

**Alternatives considered:**
- SQLite via `better-sqlite3` → native module, incompatible with Obsidian's Electron packaging.
- Obsidian's `data.json` (plugin data) → single-file for all sessions gets large and hard to manage.

---

### D6 — Wiki page structure: YAML frontmatter + Markdown body

Every wiki page follows:
```yaml
---
wiki_type: <type from schema>
related:
  - "[[Other Page]]"
  - "[[Another Page]]"
tags: [wiki]
updated: <ISO date>
---
```
Relation links use native Obsidian `[[wikilinks]]` so Graph View works without any Obsidian Dataview or custom renderer dependency.

**Alternatives considered:**
- Custom metadata format → breaks Graph View; Obsidian already indexes `[[links]]` natively.
- Storing relations in a separate index file → extra sync burden; frontmatter keeps it co-located and queryable.

---

### D7 — Auto-ingest: Vault `create` event + debounce

Subscribe to `vault.on('create', ...)` filtered to the configured raw-sources folder. Debounce 2 s to handle save-then-modify patterns. Only trigger if auto-ingest is enabled in settings.

---

### D8 — Wiki schema: built-in default + `WIKI_SCHEMA.md` override

The plugin ships a default schema (types, relation types, page template). At startup, check vault root for `WIKI_SCHEMA.md`; if present, parse and merge over the default. Users can also override via Settings UI fields, which take precedence over the file.

---

### D9 — Context window management: sliding window + optional summarize

Each LLM call sends: system prompt + (optional session summary) + last N messages (configurable, default 20). The `/summarize` command compresses all history into a single summary message stored in the session JSON; subsequent calls use `[summary] + last N`. This prevents token overflow without truncation side-effects.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Obsidian API changes break the plugin | Pin `obsidian` peer dependency to a tested version range; add an API compatibility note in README |
| LLM provider rate limits / latency affect UX during ingest of large files | Stream progress tokens per page; allow cancellation; queue large batches |
| `pdfjs-dist` / `mammoth` bundle size increases load time | Dynamic `import()` defers load until first use; show a "loading parser…" status |
| Vision models (image ingest) require API key with vision capability | Document requirement; validate at runtime and surface a clear error |
| Session JSON files grow unbounded | Implement a max-message-per-session setting (default 500); auto-summarize when limit approached |
| Auto-ingest fires on vault sync events (git pull, Obsidian Sync) | Deduplicate by file content hash stored in session metadata; skip if hash unchanged |
| `WIKI_SCHEMA.md` parse errors silently fall back to default | Log parse errors to the Obsidian console and show a Notice banner |
