## ADDED Requirements

### Requirement: Natural-language query
The plugin SHALL treat any chat message that is not a slash command as a query. The LLM SHALL search the wiki and synthesize a response with citation links to referenced wiki pages.

#### Scenario: Query with wiki results
- **WHEN** user asks a question in the chat
- **THEN** LLM responds with a synthesized answer containing `[[wikilinks]]` to cited pages

#### Scenario: Query with no relevant wiki pages
- **WHEN** user asks a question and no relevant wiki pages exist
- **THEN** LLM responds indicating the wiki does not contain relevant information

### Requirement: Save response via button
Each LLM query response SHALL have a "Save to Wiki" button. Clicking it SHALL open a title prompt; on confirmation the response SHALL be saved as a new wiki page and index/log updated.

#### Scenario: Save via button
- **WHEN** user clicks "Save to Wiki" on a query response and enters a title
- **THEN** a new wiki page is created with the response content and `[[wiki links]]` resolved

#### Scenario: Save cancelled
- **WHEN** user clicks "Save to Wiki" but dismisses the title prompt
- **THEN** no page is created and no changes are made to the vault

### Requirement: Save response via slash command
The chat interface SHALL accept `/save [page title]` to save the most recent LLM response as a wiki page.

#### Scenario: Save last response with title
- **WHEN** user types `/save My New Topic`
- **THEN** the last LLM response is saved as `wiki/My New Topic.md`

### Requirement: Auto-update index and log on save
After saving a query response `wiki/index.md` and `wiki/log.md` SHALL be updated automatically.

#### Scenario: Index updated after save
- **WHEN** a query response is saved as a wiki page
- **THEN** `wiki/index.md` and `wiki/log.md` are updated to include the new page
