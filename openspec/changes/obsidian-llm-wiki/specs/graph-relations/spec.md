## ADDED Requirements

### Requirement: Automatic relation analysis on ingest
When ingest completes, the plugin SHALL invoke the LLM to identify semantic relationships between the ingested/updated pages and existing wiki pages. Identified relationships SHALL be written as `[[wikilinks]]` in the YAML frontmatter `related:` field of the affected pages.

#### Scenario: Relations written after ingest
- **WHEN** ingest of a file completes
- **THEN** related wiki pages have `[[wikilinks]]` added to their `related:` frontmatter field

#### Scenario: Graph View reflects relations
- **WHEN** wiki pages have `related: ["[[Page A]]"]` in frontmatter
- **THEN** Obsidian's native Graph View shows edges between those pages

### Requirement: Automatic relation analysis on save
When a query response is saved as a wiki page, the plugin SHALL identify and write relations between the new page and existing wiki pages.

#### Scenario: Relations written on save
- **WHEN** a query response is saved as a wiki page
- **THEN** the new page's `related:` frontmatter is populated with links to related existing pages

### Requirement: Manual relate command
The chat interface SHALL accept `/relate [page]` to trigger re-analysis of a specific page's semantic relations. Existing `related:` entries SHALL be reviewed and updated.

#### Scenario: Manual relate on a page
- **WHEN** user types `/relate [[Machine Learning]]`
- **THEN** LLM re-analyses the page's relations and updates `related:` frontmatter

### Requirement: Lint includes orphan relation detection
During lint, the LLM SHALL identify wiki pages that have no entries in their `related:` frontmatter and attempt to populate them.

#### Scenario: Lint populates missing relations
- **WHEN** lint runs and finds a page with an empty `related:` list
- **THEN** lint attempts to find related pages and adds them, reporting the additions in the lint result

### Requirement: Custom relation types via schema
The `WIKI_SCHEMA.md` file and settings page SHALL allow defining custom relation type labels (e.g., `appears_in_chapter`, `contradicts`). The LLM SHALL use these labels when populating frontmatter fields alongside the default `related:` field.

#### Scenario: Custom relation type applied
- **WHEN** schema defines a `contradicts` relation type and LLM identifies a contradiction between two pages
- **THEN** the page's frontmatter is updated with `contradicts: ["[[Other Page]]"]`
