## ADDED Requirements

### Requirement: LLM provider and model configuration
The plugin settings SHALL allow selecting a provider (OpenAI, Anthropic, Ollama) and entering the corresponding API key and model name. The active provider SHALL be used for all LLM calls.

#### Scenario: Switch provider
- **WHEN** user changes provider from OpenAI to Anthropic and saves settings
- **THEN** all subsequent LLM calls use the Anthropic provider with the configured key and model

#### Scenario: Missing API key
- **WHEN** user attempts an LLM operation with no API key configured
- **THEN** the plugin surfaces an error Notice prompting the user to add an API key in settings

### Requirement: Vault folder path configuration
Settings SHALL allow configuring: raw-sources folder path (default `raw/`), wiki folder path (default `wiki/`), and sessions folder path (default `.llm-wiki/sessions/`).

#### Scenario: Custom wiki folder
- **WHEN** user sets wiki folder to `knowledge-base/`
- **THEN** all wiki pages are written to and read from `knowledge-base/`

### Requirement: Wiki schema configuration
Settings SHALL allow selecting between the built-in default schema and a `WIKI_SCHEMA.md` file. Individual schema fields (default page type, relation types) SHALL be overridable in the settings UI.

#### Scenario: WIKI_SCHEMA.md loaded
- **WHEN** `WIKI_SCHEMA.md` exists in the vault root and no settings override is set
- **THEN** the plugin uses the schema defined in that file

#### Scenario: Settings UI overrides schema file
- **WHEN** user sets a relation type in the settings UI
- **THEN** that value takes precedence over any value in `WIKI_SCHEMA.md`

### Requirement: Auto-ingest toggle
Settings SHALL provide a toggle to enable or disable auto-ingest (watching the raw-sources folder).

#### Scenario: Auto-ingest enabled
- **WHEN** auto-ingest toggle is turned on
- **THEN** new files added to the raw-sources folder are automatically ingested

#### Scenario: Auto-ingest disabled
- **WHEN** auto-ingest toggle is turned off
- **THEN** new files in raw-sources are not automatically ingested

### Requirement: Auto-lint schedule
Settings SHALL provide a dropdown to configure auto-lint frequency: Off / Daily / Weekly. Default is Off.

#### Scenario: Weekly lint scheduled
- **WHEN** auto-lint is set to Weekly
- **THEN** lint runs automatically once per week at the configured time

### Requirement: Context window size
Settings SHALL provide a numeric input for the LLM context sliding window (number of most recent messages to include). Default is 20.

#### Scenario: Context window updated
- **WHEN** user sets context window to 10
- **THEN** LLM calls include at most the 10 most recent messages from the session
