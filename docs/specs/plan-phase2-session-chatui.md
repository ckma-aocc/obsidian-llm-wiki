# Obsidian LLM Wiki — Plan 2: Session & Chat UI

## Implementation Status Update (2026-05-26)

- Phase 2 session/chat features are implemented and covered by interaction tests.
- Session selector has been upgraded from native select to custom dropdown menu.
- Session operations now include per-item delete (`X`) inside dropdown rows with confirmation.
- Rename flow uses explicit Rename action (with modal/prompt fallback) rather than relying on double-click-only interaction.
- Slash command parser and streaming chat pipeline are integrated with the current command set.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistent session storage, full chat sidebar panel with streaming output, and complete session management (auto-title, rename, summarize, sliding context window) — delivering a working chat experience on top of Plan 1's foundation.

**Architecture:** Sessions stored as JSON files under `.llm-wiki/sessions/`. `LLMWikiView` (Obsidian `ItemView`) hosts the full chat UI. `ContextBuilder` assembles the LLM call context as `[summary?] + last N messages`. Slash commands are dispatched by `SlashCommandParser` — unknown commands fall through to `QueryService` (Plan 4).

**Tech Stack:** TypeScript 5, Obsidian Plugin API v1, Jest + ts-jest (Plan 1 mock infrastructure)

**Prerequisite:** Plan 1 complete (`main.js` builds, all tests pass).

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/storage/SessionStore.ts` | Create, load, save, list sessions as JSON; maintains `sessions-index.json` |
| `src/utils/ContextBuilder.ts` | Builds LLM message array: system prompt + summary + last N messages |
| `src/ui/LLMWikiView.ts` | Main `ItemView` — session selector, message list, input bar, toolbar |
| `src/ui/components/SessionSelector.ts` | Dropdown + new-session button + double-click rename |
| `src/ui/components/MessageList.ts` | Renders chat bubbles; streams tokens into assistant bubble; Save-to-Wiki button |
| `src/ui/components/ChatInput.ts` | Textarea; Enter submits, Shift+Enter newlines; detects slash commands |
| `src/ui/SlashCommandParser.ts` | Parses `/command [args]` from input string; returns `{command, args}` or null |
| `__tests__/storage/SessionStore.test.ts` | CRUD + index file + max-message guard |
| `__tests__/utils/ContextBuilder.test.ts` | Sliding window + summary prepend |
| `__tests__/ui/SlashCommandParser.test.ts` | Known/unknown commands, argument parsing |

---

### Task 1: SessionStore

**Files:**
- Create: `src/storage/SessionStore.ts`
- Create: `__tests__/storage/SessionStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/storage/SessionStore.test.ts
import { SessionStore } from '../../src/storage/SessionStore';
import { mockVault } from '../../__mocks__/obsidian';
import type { Session } from '../../src/types';

const SESSIONS_PATH = '.llm-wiki/sessions';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVault.adapter.exists.mockResolvedValue(false);
    mockVault.adapter.read.mockResolvedValue('{"sessions":[]}');
    store = new SessionStore(mockVault as any, SESSIONS_PATH);
  });

  it('createSession returns a session with generated id', async () => {
    const session = await store.createSession();
    expect(session.id).toBeTruthy();
    expect(session.messages).toEqual([]);
    expect(session.title).toBe('New Session');
  });

  it('saveSession writes JSON to correct path', async () => {
    const session = await store.createSession();
    await store.saveSession(session);
    expect(mockVault.adapter.write).toHaveBeenCalledWith(
      expect.stringContaining(session.id),
      expect.stringContaining('"id"')
    );
  });

  it('loadSession reads and parses correct file', async () => {
    const id = 'test-id-123';
    const mockData: Session = {
      id,
      title: 'Test',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      messages: [{ role: 'user', content: 'hi', timestamp: '2026-01-01T00:00:00.000Z' }],
    };
    mockVault.adapter.read.mockResolvedValueOnce(JSON.stringify(mockData));
    const loaded = await store.loadSession(id);
    expect(loaded.title).toBe('Test');
    expect(loaded.messages).toHaveLength(1);
  });

  it('listSessions returns empty array when no index', async () => {
    mockVault.adapter.exists.mockResolvedValueOnce(false);
    const list = await store.listSessions();
    expect(list).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/storage/SessionStore.test.ts
```

Expected: FAIL — `Cannot find module '../../src/storage/SessionStore'`

- [ ] **Step 3: Create `src/storage/SessionStore.ts`**

```typescript
import type { Vault } from 'obsidian';
import type { Session, ChatMessage } from '../types';

interface SessionIndex {
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
}

export class SessionStore {
  private indexPath: string;

  constructor(private vault: Vault, private sessionsPath: string) {
    this.indexPath = `${sessionsPath}/sessions-index.json`;
  }

  async createSession(): Promise<Session> {
    const now = new Date().toISOString();
    const session: Session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: 'New Session',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await this.ensureDirectory();
    await this.saveSession(session);
    await this.addToIndex(session);
    return session;
  }

  async saveSession(session: Session): Promise<void> {
    const path = this.sessionPath(session.id);
    const data = JSON.stringify(session, null, 2);
    const exists = await (this.vault.adapter as any).exists(path);
    if (exists) {
      await (this.vault.adapter as any).write(path, data);
    } else {
      await (this.vault.adapter as any).write(path, data);
    }
  }

  async loadSession(id: string): Promise<Session> {
    const path = this.sessionPath(id);
    const data = await (this.vault.adapter as any).read(path);
    return JSON.parse(data) as Session;
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const session = await this.loadSession(id);
    session.title = title;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
    await this.updateIndex(id, title);
  }

  async appendMessage(id: string, message: ChatMessage): Promise<Session> {
    const session = await this.loadSession(id);
    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
    return session;
  }

  async listSessions(): Promise<SessionIndex['sessions']> {
    const exists = await (this.vault.adapter as any).exists(this.indexPath);
    if (!exists) return [];
    const data = await (this.vault.adapter as any).read(this.indexPath);
    const index: SessionIndex = JSON.parse(data);
    return index.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private sessionPath(id: string): string {
    return `${this.sessionsPath}/${id}.json`;
  }

  private async ensureDirectory(): Promise<void> {
    const exists = await (this.vault.adapter as any).exists(this.sessionsPath);
    if (!exists) await (this.vault.adapter as any).mkdir(this.sessionsPath);
  }

  private async addToIndex(session: Session): Promise<void> {
    const sessions = await this.listSessions();
    sessions.unshift({ id: session.id, title: session.title, updatedAt: session.updatedAt });
    await (this.vault.adapter as any).write(this.indexPath, JSON.stringify({ sessions }, null, 2));
  }

  private async updateIndex(id: string, title: string): Promise<void> {
    const sessions = await this.listSessions();
    const entry = sessions.find((s) => s.id === id);
    if (entry) {
      entry.title = title;
      await (this.vault.adapter as any).write(this.indexPath, JSON.stringify({ sessions }, null, 2));
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/storage/SessionStore.test.ts
```

Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/storage/SessionStore.ts __tests__/storage/SessionStore.test.ts
git commit -m "feat: add SessionStore with persistent JSON sessions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: ContextBuilder

**Files:**
- Create: `src/utils/ContextBuilder.ts`
- Create: `__tests__/utils/ContextBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/utils/ContextBuilder.test.ts
import { ContextBuilder } from '../../src/utils/ContextBuilder';
import type { Session, ChatMessage } from '../../src/types';

function makeMessages(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `msg ${i}`,
    timestamp: new Date().toISOString(),
  })) as ChatMessage[];
}

describe('ContextBuilder.build', () => {
  it('includes system prompt as first message', () => {
    const session: Session = { id: '1', title: '', createdAt: '', updatedAt: '', messages: [] };
    const msgs = ContextBuilder.build(session, 'You are helpful.', 20);
    expect(msgs[0]).toEqual({ role: 'system', content: 'You are helpful.', timestamp: '' });
  });

  it('caps messages at contextWindowSize', () => {
    const session: Session = {
      id: '1', title: '', createdAt: '', updatedAt: '',
      messages: makeMessages(30),
    };
    const msgs = ContextBuilder.build(session, 'prompt', 20);
    // 1 system + 20 messages
    expect(msgs).toHaveLength(21);
    // Last message should be msg 29
    expect(msgs[msgs.length - 1].content).toBe('msg 29');
  });

  it('prepends summary when session has summary', () => {
    const session: Session = {
      id: '1', title: '', createdAt: '', updatedAt: '',
      summary: 'Earlier we discussed X.',
      summaryUpToIndex: 10,
      messages: makeMessages(15),
    };
    const msgs = ContextBuilder.build(session, 'prompt', 20);
    const summaryMsg = msgs.find((m) => m.role === 'system' && m.content.includes('Earlier we discussed'));
    expect(summaryMsg).toBeDefined();
  });

  it('uses messages after summaryUpToIndex when summary present', () => {
    const session: Session = {
      id: '1', title: '', createdAt: '', updatedAt: '',
      summary: 'Summary of first 5.',
      summaryUpToIndex: 4,
      messages: makeMessages(10),
    };
    const msgs = ContextBuilder.build(session, 'prompt', 20);
    // Should have: system + summary + messages[5..9]
    const userMessages = msgs.filter((m) => m.role !== 'system');
    expect(userMessages).toHaveLength(5); // messages 5,6,7,8,9
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/utils/ContextBuilder.test.ts
```

Expected: FAIL — `Cannot find module '../../src/utils/ContextBuilder'`

- [ ] **Step 3: Create `src/utils/ContextBuilder.ts`**

```typescript
import type { ChatMessage, Session } from '../types';

export class ContextBuilder {
  static build(session: Session, systemPrompt: string, windowSize: number): ChatMessage[] {
    const now = '';
    const result: ChatMessage[] = [{ role: 'system', content: systemPrompt, timestamp: now }];

    let messages = session.messages;

    if (session.summary !== undefined && session.summaryUpToIndex !== undefined) {
      // Only use messages after the summary
      messages = messages.slice(session.summaryUpToIndex + 1);
      result.push({
        role: 'system',
        content: `[Session Summary]\n${session.summary}`,
        timestamp: now,
      });
    }

    // Apply sliding window
    const windowed = messages.slice(-windowSize);
    result.push(...windowed);

    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/utils/ContextBuilder.test.ts
```

Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/ContextBuilder.ts __tests__/utils/ContextBuilder.test.ts
git commit -m "feat: add ContextBuilder for sliding window + summary context

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: SlashCommandParser

**Files:**
- Create: `src/ui/SlashCommandParser.ts`
- Create: `__tests__/ui/SlashCommandParser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/ui/SlashCommandParser.test.ts
import { SlashCommandParser, KNOWN_COMMANDS } from '../../src/ui/SlashCommandParser';

describe('SlashCommandParser.parse', () => {
  it('returns null for plain message', () => {
    expect(SlashCommandParser.parse('hello world')).toBeNull();
  });

  it('parses /ingest with path argument', () => {
    const result = SlashCommandParser.parse('/ingest raw/article.pdf');
    expect(result).toEqual({ command: 'ingest', args: 'raw/article.pdf' });
  });

  it('parses /save with title', () => {
    const result = SlashCommandParser.parse('/save My New Page');
    expect(result).toEqual({ command: 'save', args: 'My New Page' });
  });

  it('parses /lint with no args', () => {
    const result = SlashCommandParser.parse('/lint');
    expect(result).toEqual({ command: 'lint', args: '' });
  });

  it('parses /relate with page', () => {
    expect(SlashCommandParser.parse('/relate [[Machine Learning]]'))
      .toEqual({ command: 'relate', args: '[[Machine Learning]]' });
  });

  it('parses /summarize', () => {
    expect(SlashCommandParser.parse('/summarize')).toEqual({ command: 'summarize', args: '' });
  });

  it('treats unknown slash prefix as null (plain query)', () => {
    expect(SlashCommandParser.parse('/unknowncmd foo')).toBeNull();
  });

  it('KNOWN_COMMANDS contains all expected commands', () => {
    expect(KNOWN_COMMANDS).toEqual(
      expect.arrayContaining(['ingest', 'reingest', 'ingest-all', 'save', 'lint', 'relate', 'summarize', 'help'])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/ui/SlashCommandParser.test.ts
```

Expected: FAIL — `Cannot find module '../../src/ui/SlashCommandParser'`

- [ ] **Step 3: Create `src/ui/SlashCommandParser.ts`**

```typescript
export const KNOWN_COMMANDS = [
  'ingest',
  'reingest',
  'ingest-all',
  'save',
  'lint',
  'relate',
  'summarize',
  'help',
] as const;

export type SlashCommand = (typeof KNOWN_COMMANDS)[number];

export interface ParsedCommand {
  command: SlashCommand;
  args: string;
}

export class SlashCommandParser {
  static parse(input: string): ParsedCommand | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;

    const spaceIdx = trimmed.indexOf(' ');
    const commandStr = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
    const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

    if ((KNOWN_COMMANDS as readonly string[]).includes(commandStr)) {
      return { command: commandStr as SlashCommand, args };
    }

    return null; // unknown slash prefix → treat as plain query
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/ui/SlashCommandParser.test.ts
```

Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui/SlashCommandParser.ts __tests__/ui/SlashCommandParser.test.ts
git commit -m "feat: add SlashCommandParser for chat input dispatch

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: LLMWikiView (Chat Sidebar Panel)

**Files:**
- Create: `src/ui/LLMWikiView.ts`
- Modify: `src/main.ts` — register view + ribbon icon

- [ ] **Step 1: Create `src/ui/LLMWikiView.ts`**

```typescript
import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type LLMWikiPlugin from '../main';
import { SessionStore } from '../storage/SessionStore';
import { ContextBuilder } from '../utils/ContextBuilder';
import { ProviderFactory } from '../providers/ProviderFactory';
import { SchemaLoader } from '../schema/SchemaLoader';
import { SlashCommandParser } from './SlashCommandParser';
import type { Session, ChatMessage } from '../types';

export const VIEW_TYPE_LLM_WIKI = 'llm-wiki-chat';

export class LLMWikiView extends ItemView {
  private plugin: LLMWikiPlugin;
  private sessionStore!: SessionStore;
  private currentSession!: Session;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sessionSelectorEl!: HTMLSelectElement;
  private statusEl!: HTMLElement;
  private isStreaming = false;

  constructor(leaf: WorkspaceLeaf, plugin: LLMWikiPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_LLM_WIKI; }
  getDisplayText(): string { return 'LLM Wiki'; }
  getIcon(): string { return 'brain'; }

  async onOpen(): Promise<void> {
    this.sessionStore = new SessionStore(
      this.app.vault,
      this.plugin.settings.sessionsPath
    );

    this.buildUI();
    await this.initSession();
  }

  private buildUI(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('llm-wiki-chat-container');

    // Toolbar
    const toolbar = root.createEl('div', { cls: 'llm-wiki-toolbar' });
    this.sessionSelectorEl = toolbar.createEl('select', { cls: 'llm-wiki-session-select' });
    this.sessionSelectorEl.addEventListener('change', () => this.onSessionSwitch());

    const summarizeBtn = toolbar.createEl('button', { text: '∑ Summarize', cls: 'llm-wiki-btn' });
    summarizeBtn.addEventListener('click', () => this.handleCommand('summarize', ''));

    this.statusEl = root.createEl('div', { cls: 'llm-wiki-status', text: '' });

    // Message list
    this.messagesEl = root.createEl('div', { cls: 'llm-wiki-messages' });

    // Input area
    const inputArea = root.createEl('div', { cls: 'llm-wiki-input-area' });
    this.inputEl = inputArea.createEl('textarea', {
      cls: 'llm-wiki-input',
      attr: { placeholder: 'Ask a question or type /help for commands…' },
    });

    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });

    const sendBtn = inputArea.createEl('button', { text: 'Send', cls: 'llm-wiki-send-btn' });
    sendBtn.addEventListener('click', () => this.submit());
  }

  private async initSession(): Promise<void> {
    await this.refreshSessionSelector();
    this.currentSession = await this.sessionStore.createSession();
    this.addSessionOption(this.currentSession, true);
  }

  private async refreshSessionSelector(): Promise<void> {
    const sessions = await this.sessionStore.listSessions();
    this.sessionSelectorEl.empty();
    const newOpt = this.sessionSelectorEl.createEl('option', { text: '+ New Session', value: '__new__' });
    newOpt.selected = true;
    for (const s of sessions) {
      this.sessionSelectorEl.createEl('option', { text: s.title, value: s.id });
    }
  }

  private addSessionOption(session: Session, selected = false): void {
    const opt = document.createElement('option');
    opt.value = session.id;
    opt.text = session.title;
    opt.selected = selected;
    // Insert after the "+ New Session" option
    this.sessionSelectorEl.insertBefore(opt, this.sessionSelectorEl.options[1] ?? null);
  }

  private async onSessionSwitch(): Promise<void> {
    const val = this.sessionSelectorEl.value;
    if (val === '__new__') {
      this.currentSession = await this.sessionStore.createSession();
      this.addSessionOption(this.currentSession, true);
      this.messagesEl.empty();
    } else {
      this.currentSession = await this.sessionStore.loadSession(val);
      this.renderAllMessages();
    }
  }

  private renderAllMessages(): void {
    this.messagesEl.empty();
    for (const msg of this.currentSession.messages) {
      this.appendMessageBubble(msg);
    }
  }

  private appendMessageBubble(msg: ChatMessage): HTMLElement {
    const bubble = this.messagesEl.createEl('div', {
      cls: `llm-wiki-bubble llm-wiki-bubble-${msg.role}`,
    });
    bubble.createEl('div', { cls: 'llm-wiki-bubble-content', text: msg.content });

    if (msg.role === 'assistant') {
      const actions = bubble.createEl('div', { cls: 'llm-wiki-bubble-actions' });
      const copyBtn = actions.createEl('button', { text: '📋', cls: 'llm-wiki-action-btn' });
      copyBtn.addEventListener('click', () => navigator.clipboard.writeText(msg.content));
      const saveBtn = actions.createEl('button', { text: '💾 Save to Wiki', cls: 'llm-wiki-action-btn' });
      saveBtn.addEventListener('click', () => this.saveToWiki(msg.content));
    }

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return bubble;
  }

  private async submit(): Promise<void> {
    if (this.isStreaming) return;
    const input = this.inputEl.value.trim();
    if (!input) return;
    this.inputEl.value = '';

    const parsed = SlashCommandParser.parse(input);
    if (parsed) {
      await this.handleCommand(parsed.command, parsed.args);
    } else {
      await this.handleQuery(input);
    }
  }

  private async handleQuery(query: string): Promise<void> {
    const userMsg: ChatMessage = { role: 'user', content: query, timestamp: new Date().toISOString() };
    this.currentSession = await this.sessionStore.appendMessage(this.currentSession.id, userMsg);
    this.appendMessageBubble(userMsg);

    this.isStreaming = true;
    this.setStatus('Thinking…');

    const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
    const provider = ProviderFactory.create(this.plugin.settings);
    const messages = ContextBuilder.build(this.currentSession, schema.systemPrompt, this.plugin.settings.contextWindowSize);

    const assistantBubble = this.messagesEl.createEl('div', { cls: 'llm-wiki-bubble llm-wiki-bubble-assistant' });
    const contentEl = assistantBubble.createEl('div', { cls: 'llm-wiki-bubble-content', text: '' });
    let fullContent = '';

    try {
      for await (const token of provider.chat(messages)) {
        fullContent += token;
        contentEl.textContent = fullContent;
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      }
    } catch (e) {
      new Notice(`LLM error: ${(e as Error).message}`);
      assistantBubble.remove();
    } finally {
      this.isStreaming = false;
      this.setStatus('');
    }

    if (fullContent) {
      const assistantMsg: ChatMessage = { role: 'assistant', content: fullContent, timestamp: new Date().toISOString() };
      this.currentSession = await this.sessionStore.appendMessage(this.currentSession.id, assistantMsg);

      // Add action buttons
      const actions = assistantBubble.createEl('div', { cls: 'llm-wiki-bubble-actions' });
      const copyBtn = actions.createEl('button', { text: '📋', cls: 'llm-wiki-action-btn' });
      copyBtn.addEventListener('click', () => navigator.clipboard.writeText(fullContent));
      const saveBtn = actions.createEl('button', { text: '💾 Save to Wiki', cls: 'llm-wiki-action-btn' });
      saveBtn.addEventListener('click', () => this.saveToWiki(fullContent));

      // Auto-generate title after first exchange
      if (this.currentSession.messages.length === 2) {
        this.autoGenerateTitle();
      }
    }
  }

  private async handleCommand(command: string, args: string): Promise<void> {
    const systemMsg: ChatMessage = { role: 'system', content: `/${command} ${args}`.trim(), timestamp: new Date().toISOString() };
    this.appendMessageBubble({ ...systemMsg, role: 'assistant' });
    // Feature services (ingest, lint, etc.) hooked in Plans 3–5
    new Notice(`Command /${command} will be wired in the next plan phase.`);
  }

  private async autoGenerateTitle(): Promise<void> {
    try {
      const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
      const provider = ProviderFactory.create(this.plugin.settings);
      const titlePrompt: ChatMessage[] = [
        { role: 'system', content: 'Generate a concise 4-6 word title for this conversation. Respond with only the title, no punctuation.', timestamp: '' },
        ...this.currentSession.messages.slice(0, 2),
      ];
      let title = '';
      for await (const token of provider.chat(titlePrompt)) title += token;
      title = title.trim().slice(0, 60);
      if (title) {
        await this.sessionStore.updateTitle(this.currentSession.id, title);
        this.currentSession.title = title;
        // Update the selector option
        const opt = Array.from(this.sessionSelectorEl.options).find((o) => o.value === this.currentSession.id);
        if (opt) opt.text = title;
      }
    } catch {
      // Non-fatal: title generation failure is silent
    }
  }

  private async saveToWiki(content: string): Promise<void> {
    // Implemented fully in Plan 4 (QueryService + SaveService)
    new Notice('Save to Wiki will be fully wired in Plan 4.');
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  async onClose(): Promise<void> {
    // cleanup
  }
}
```

- [ ] **Step 2: Update `src/main.ts` to register the view**

```typescript
import { Plugin, WorkspaceLeaf } from 'obsidian';
import type { LLMWikiSettings } from './types';
import { DEFAULT_SETTINGS } from './settings/Settings';
import { LLMWikiSettingsTab } from './settings/SettingsTab';
import { LLMWikiView, VIEW_TYPE_LLM_WIKI } from './ui/LLMWikiView';

export default class LLMWikiPlugin extends Plugin {
  settings!: LLMWikiSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new LLMWikiSettingsTab(this.app, this));

    this.registerView(VIEW_TYPE_LLM_WIKI, (leaf) => new LLMWikiView(leaf, this));

    this.addRibbonIcon('brain', 'LLM Wiki: Open Chat', () => this.activateView());

    this.addCommand({
      id: 'open-chat',
      name: 'Open Chat',
      callback: () => this.activateView(),
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_LLM_WIKI);
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_LLM_WIKI)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_LLM_WIKI, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Step 3: Build and verify no TypeScript errors**

```bash
npm run build
```

Expected: `main.js` produced. Zero TypeScript errors.

- [ ] **Step 4: Run all tests**

```bash
npx jest --verbose
```

Expected: All existing tests PASS plus new ones.

- [ ] **Step 5: Commit**

```bash
git add src/ui/LLMWikiView.ts src/main.ts
git commit -m "feat: add LLMWikiView chat panel with session selector and streaming

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Session Summarize Command (`/summarize`)

**Files:**
- Modify: `src/ui/LLMWikiView.ts` — wire `/summarize` through `handleCommand`

- [ ] **Step 1: Update `handleCommand` in `LLMWikiView.ts`**

Replace the `handleCommand` method:

```typescript
private async handleCommand(command: string, args: string): Promise<void> {
  switch (command) {
    case 'summarize':
      await this.handleSummarize();
      break;
    case 'help':
      this.appendMessageBubble({
        role: 'assistant',
        content: `**Available Commands**\n\`/ingest [path]\` — Ingest a raw source file\n\`/reingest [path]\` — Re-ingest an existing file\n\`/ingest-all\` — Ingest all files in raw sources folder\n\`/save [title]\` — Save last response as a wiki page\n\`/relate [page]\` — Re-analyse relations for a page\n\`/lint\` — Run wiki health check\n\`/summarize\` — Compress session history to summary\n\`/help\` — Show this help`,
        timestamp: new Date().toISOString(),
      });
      break;
    default:
      // Plans 3–5 will add: ingest, reingest, ingest-all, save, relate, lint
      new Notice(`/${command} will be available after Plan ${command === 'lint' ? '5' : command === 'relate' ? '4' : '3'} is implemented.`);
  }
}

private async handleSummarize(): Promise<void> {
  if (this.currentSession.messages.length < 4) {
    this.appendMessageBubble({ role: 'assistant', content: 'Session is too short to summarize.', timestamp: new Date().toISOString() });
    return;
  }
  this.setStatus('Summarizing…');
  try {
    const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
    const provider = ProviderFactory.create(this.plugin.settings);
    const summaryPrompt: ChatMessage[] = [
      { role: 'system', content: 'Summarize the following conversation history into 2-3 concise paragraphs. Focus on key topics discussed, decisions made, and important information established.', timestamp: '' },
      ...this.currentSession.messages,
    ];
    let summary = '';
    for await (const token of provider.chat(summaryPrompt)) summary += token;
    summary = summary.trim();

    this.currentSession.summary = summary;
    this.currentSession.summaryUpToIndex = this.currentSession.messages.length - 1;
    await this.sessionStore.saveSession(this.currentSession);

    this.appendMessageBubble({
      role: 'assistant',
      content: `✅ Session summarized.\n\n**Summary:**\n${summary}`,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    new Notice(`Summarize failed: ${(e as Error).message}`);
  } finally {
    this.setStatus('');
  }
}
```

- [ ] **Step 2: Build to verify no errors**

```bash
npm run build
```

Expected: success

- [ ] **Step 3: Run all tests**

```bash
npx jest --coverage
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/LLMWikiView.ts
git commit -m "feat: wire /summarize command with session summary persistence

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Session Inline Rename (Double-click)

**Files:**
- Modify: `src/ui/LLMWikiView.ts` — add double-click rename on session selector

- [ ] **Step 1: Add double-click rename to `buildUI` in `LLMWikiView.ts`**

Add this after the `sessionSelectorEl` event listener:

```typescript
// Double-click to rename current session
this.sessionSelectorEl.addEventListener('dblclick', () => {
  const currentOpt = this.sessionSelectorEl.options[this.sessionSelectorEl.selectedIndex];
  if (!currentOpt || currentOpt.value === '__new__') return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentOpt.text;
  input.className = 'llm-wiki-rename-input';

  const save = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentOpt.text) {
      await this.sessionStore.updateTitle(currentOpt.value, newTitle);
      currentOpt.text = newTitle;
    }
    input.replaceWith(this.sessionSelectorEl);
  };

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') input.replaceWith(this.sessionSelectorEl);
  });
  input.addEventListener('blur', save);
  this.sessionSelectorEl.replaceWith(input);
  input.focus();
  input.select();
});
```

- [ ] **Step 2: Build and run all tests**

```bash
npm run build && npx jest
```

Expected: Build success, all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/LLMWikiView.ts
git commit -m "feat: add double-click inline session rename

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Plan 2 Complete — Ready for Plan 3

Run final verification:

```bash
npm run build && npx jest --coverage
```

Expected: Build success. All tests PASS.

Sessions are persisted in `.llm-wiki/sessions/`. Chat panel streams LLM responses. Sessions can be created, switched, renamed, and summarized.

**Next:** Plan 3 — Ingest Pipeline
