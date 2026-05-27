# Obsidian LLM Wiki

Obsidian community plugin that builds a persistent wiki with LLM-assisted ingest, query, save, lint, and relation linking.

## Features

- Right sidebar chat view (Obsidian LLM Wiki: Open Chat)
- Session management in chat: create, switch, rename, delete, summarize
- Save assistant replies to wiki via per-message Save to Wiki button or slash command
- Slash commands:
	- /help
	- /ingest <path>
	- /reingest <path>
	- /ingest-all
	- /ingest-all retry
	- /save [title]
	- /lint
	- /relate <page>
	- /clean-links
	- /log-tail [n]
	- /log-filter <ingest|query|lint>
	- /reindex
	- /summarize
- Provider support: OpenAI (including Azure OpenAI), Anthropic, Ollama, Google Gemini
- Per-provider configuration isolation (API key, model, base URL are stored separately per provider)
- Session persistence as JSON under .llm-wiki/sessions/
- Supported ingest formats: .md, .pdf, .png, .jpg, .docx, .xlsx, .pptx
- Auto-ingest for new files created under raw path
- Auto-maintained wiki structure and metadata:
	- wiki/sources, wiki/entities, wiki/concepts, wiki/analyses
	- wiki/index.md
	- wiki/log.md

## Development

```bash
npm install
npm run build
npm test
```

## Usage

1. Open Obsidian settings and configure provider, API key, model, folder paths, and optional schema overrides.
2. Run command palette action `Obsidian LLM Wiki: Open Chat`.
3. Ask a question or use slash commands.
4. Save assistant output into your wiki via button or `/save`.