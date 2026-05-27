## ADDED Requirements

### Requirement: Lint via slash command
The chat interface SHALL accept `/lint` to trigger a wiki health check. The LLM SHALL scan all wiki pages and report contradictions, orphaned pages, and missing links in the chat.

#### Scenario: Lint via chat command
- **WHEN** user types `/lint`
- **THEN** LLM performs a health check and returns a structured report in the chat

### Requirement: Lint via command palette
The plugin SHALL register "LLM Wiki: Lint Wiki" in the Obsidian command palette. Executing it SHALL trigger lint and show results in the chat panel.

#### Scenario: Lint from command palette
- **WHEN** user executes "LLM Wiki: Lint Wiki" from the command palette
- **THEN** lint runs and results are displayed in the chat

### Requirement: Lint report content
The lint report SHALL identify at minimum: contradictory statements across pages, pages with no incoming or outgoing `[[links]]` (orphaned), and pages referenced by `[[links]]` that do not exist (broken links).

#### Scenario: Orphaned page detected
- **WHEN** a wiki page has no incoming or outgoing wikilinks
- **THEN** lint report lists that page as orphaned

#### Scenario: Broken link detected
- **WHEN** a wikilink references a page that does not exist
- **THEN** lint report lists the broken link with the source page

### Requirement: Save lint result as wiki page
After a lint run the user SHALL be able to save the lint report as a wiki page via "Save to Wiki" button or `/save` command.

#### Scenario: Save lint report
- **WHEN** user saves a lint result
- **THEN** the report is stored as a wiki page and index/log are updated

### Requirement: Scheduled auto-lint
The settings page SHALL allow configuring an auto-lint schedule (off / daily / weekly). When enabled, the plugin SHALL run lint automatically on the configured schedule and surface results in the chat.

#### Scenario: Scheduled lint fires
- **WHEN** auto-lint is set to daily and the scheduled time arrives
- **THEN** lint runs automatically and results appear in the chat panel
