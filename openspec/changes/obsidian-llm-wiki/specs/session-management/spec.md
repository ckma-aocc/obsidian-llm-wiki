## ADDED Requirements

### Requirement: New session on startup
Each time the user opens Obsidian, the plugin SHALL start in a new chat session by default.

#### Scenario: New session on Obsidian open
- **WHEN** Obsidian is launched or the plugin is reloaded
- **THEN** a new empty session is created and shown in the chat panel

### Requirement: Persistent session storage
All sessions SHALL be persisted as JSON files under `.llm-wiki/sessions/` in the vault. Sessions SHALL not be cleared on plugin reload or Obsidian restart.

#### Scenario: Session survives restart
- **WHEN** Obsidian is restarted after a conversation
- **THEN** the prior session history is accessible from the session selector

### Requirement: Session selector
The chat panel SHALL display a session selector at the top. Users SHALL be able to switch to any prior session and resume the conversation.

#### Scenario: Switch to prior session
- **WHEN** user selects a prior session from the session selector
- **THEN** the chat panel loads that session's message history

### Requirement: Auto-generated session title
After the first exchange in a new session, the plugin SHALL ask the LLM to generate a concise session title. The generated title SHALL appear in the session selector.

#### Scenario: Title generated after first exchange
- **WHEN** the first LLM response in a new session completes
- **THEN** the session selector shows an auto-generated title for the session

### Requirement: Manual session title rename
Users SHALL be able to double-click a session name in the session selector to edit it inline.

#### Scenario: Rename session inline
- **WHEN** user double-clicks a session name in the selector
- **THEN** the name becomes an editable field; pressing Enter saves the new title

### Requirement: Session context summarization
The chat interface SHALL accept `/summarize` to compress the current session history into a single summary message. Subsequent LLM calls SHALL use `[summary] + last N messages` as context.

#### Scenario: Summarize session
- **WHEN** user types `/summarize`
- **THEN** LLM compresses history into a summary stored in the session; chat confirms with "Session summarized"

#### Scenario: Summarized context used in subsequent calls
- **WHEN** a session has been summarized and user sends a new message
- **THEN** the LLM call context includes the summary plus the most recent N messages (not full history)

### Requirement: Sliding context window
Each LLM call SHALL include at most the most recent N messages (configurable in settings, default 20) plus any session summary. Messages beyond N SHALL be excluded from the context sent to the LLM.

#### Scenario: Context capped at N messages
- **WHEN** session has 30 messages and N=20
- **THEN** LLM call context includes only the last 20 messages (and summary if present)
