## ADDED Requirements

### Requirement: Sidebar chat panel
The plugin SHALL register an Obsidian ItemView in the right sidebar that provides a chat interface. The panel SHALL be openable via the Obsidian command palette and via a ribbon icon.

#### Scenario: Open chat panel from ribbon
- **WHEN** user clicks the LLM Wiki ribbon icon
- **THEN** the right sidebar opens with the LLM Wiki chat panel visible

#### Scenario: Open chat panel from command palette
- **WHEN** user executes "LLM Wiki: Open Chat" from the command palette
- **THEN** the right sidebar opens with the LLM Wiki chat panel focused

### Requirement: Chat message input and submission
The panel SHALL provide a text input field. Pressing Enter (without Shift) or clicking the Send button SHALL submit the message. Shift+Enter SHALL insert a newline.

#### Scenario: Submit message with Enter
- **WHEN** user types a message and presses Enter
- **THEN** the message is added to the chat and processing begins

#### Scenario: Newline with Shift+Enter
- **WHEN** user presses Shift+Enter in the input field
- **THEN** a newline is inserted and no submission occurs

### Requirement: Streaming LLM response display
LLM responses SHALL stream token-by-token into the chat panel as they arrive. A loading indicator SHALL be shown while the response is in progress.

#### Scenario: Streaming response
- **WHEN** LLM begins responding
- **THEN** tokens appear progressively in the chat bubble without waiting for full completion

#### Scenario: Loading indicator shown
- **WHEN** a request is in flight
- **THEN** a spinner or typing indicator is visible in the chat panel

### Requirement: Save-to-Wiki action on responses
Each LLM response SHALL have a "Save to Wiki" button. Clicking it SHALL prompt for a page title and save the response as a new wiki page.

#### Scenario: Save response via button
- **WHEN** user clicks "Save to Wiki" on an LLM response
- **THEN** user is prompted for a page title and the response is saved as a wiki page

### Requirement: Slash command dispatch
The chat input SHALL recognize slash commands (`/ingest`, `/save`, `/lint`, `/relate`, `/reingest`, `/summarize`) and route them to the appropriate subsystem.

#### Scenario: Recognized slash command
- **WHEN** user submits a message starting with a known slash command
- **THEN** the command is dispatched to the corresponding capability handler

#### Scenario: Unknown slash command
- **WHEN** user submits a message starting with an unrecognized slash prefix
- **THEN** the message is treated as a plain query (not an error)
