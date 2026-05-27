## ADDED Requirements

### Requirement: Ingest via context menu
The plugin SHALL register a file context-menu item "LLM Wiki: Ingest" in the Obsidian File Explorer for supported file types. Selecting it SHALL ingest the file into the wiki.

#### Scenario: Ingest from context menu
- **WHEN** user right-clicks a supported file in File Explorer and selects "LLM Wiki: Ingest"
- **THEN** the file is queued for ingestion and processing begins

### Requirement: Ingest via slash command
The chat interface SHALL accept `/ingest [[filename]]` to ingest a specified file.

#### Scenario: Ingest via chat command
- **WHEN** user types `/ingest [[notes.pdf]]` in the chat
- **THEN** the referenced file is ingested and progress is shown in the chat

### Requirement: Supported file formats
The ingest capability SHALL support `.md`, `.pdf`, `.png`, `.jpg`, `.docx`, `.xlsx`, `.pptx`. Unsupported file types SHALL surface an informative error.

#### Scenario: Supported file ingested
- **WHEN** user triggers ingest on a `.pdf` file
- **THEN** the file is parsed and its content is used to update wiki pages

#### Scenario: Unsupported file type
- **WHEN** user triggers ingest on a `.mp4` file
- **THEN** an error message is shown stating the file type is not supported

### Requirement: Streaming ingest progress
During ingestion the plugin SHALL stream LLM progress messages to the chat panel, indicating which wiki page is currently being read or updated.

#### Scenario: Progress shown during ingest
- **WHEN** ingest is in progress
- **THEN** chat shows messages like "Reading source…", "Updating [[Page Name]]…"

### Requirement: Auto-update index and log on ingest
After a successful ingest `wiki/index.md` and `wiki/log.md` SHALL be updated automatically to reflect the new or modified pages.

#### Scenario: Index updated after ingest
- **WHEN** ingest completes successfully
- **THEN** `wiki/index.md` reflects all current wiki pages and `wiki/log.md` has a new entry

### Requirement: Auto-watch mode
When auto-ingest is enabled in settings, the plugin SHALL monitor the configured raw-sources folder. New files added to that folder SHALL be automatically ingested.

#### Scenario: Auto-ingest on new file
- **WHEN** auto-ingest is enabled and a new supported file appears in the raw-sources folder
- **THEN** the file is automatically ingested without user action

#### Scenario: Auto-ingest skipped for unchanged file
- **WHEN** a file that was previously ingested is re-saved with identical content
- **THEN** auto-ingest does not re-process the file

### Requirement: Re-ingest command
The chat interface SHALL accept `/reingest [[filename]]` to force re-ingestion of a previously ingested file.

#### Scenario: Re-ingest existing file
- **WHEN** user types `/reingest [[notes.pdf]]`
- **THEN** the file is re-ingested and existing wiki pages derived from it are updated
