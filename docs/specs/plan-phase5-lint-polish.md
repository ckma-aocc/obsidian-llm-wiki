# Obsidian LLM Wiki — Plan 5: Lint & Polish

## Implementation Status Update (2026-05-26)

- Phase 5 lint and polish scope is implemented and validated in current test suite.
- Lint can run manually via command and scheduler; lint runs append structured entries into `wiki/log.md`.
- Log observability is expanded with `/log-tail` and `/log-filter` for in-chat operational tracing.
- Slash command surface has been polished to include cleanup and index maintenance flows (`/clean-links`, `/reindex`).
- UI/interaction polish includes selectable rendered text, markdown rendering fixes, and session UX refinements.
- Settings UI polish now includes sectioned categories (Provider, Vault Folders, Schema/Relations, Ingest, Lint, Context) for faster settings navigation.
- API Key settings input is masked by default with an eye-toggle show/hide control, and resets to masked mode whenever the settings page is reopened.
- Assistant markdown message spacing is tuned to a compact layout: assistant uses normal whitespace and tighter paragraph/list margins, while user messages keep `pre-wrap` to preserve manual line breaks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `LintService` (LLM-powered wiki health check with orphan + broken-link detection), the auto-lint scheduler, wire `/lint` and all remaining slash commands, add comprehensive error notices, write `README.md`, and perform final integration verification.

**Architecture:** `LintService` gathers all wiki pages, detects orphans (pages with no incoming wikilinks) and broken links (wikilinks pointing to non-existent pages) locally, then sends a structured report to the LLM for qualitative analysis. Results stream to the chat panel, and "Save to Wiki" saves the report as a wiki page. The auto-lint scheduler uses Obsidian's `Plugin.registerInterval` (not `setInterval`) so it is cleared on unload.

**Tech Stack:** TypeScript 5, Obsidian Plugin API, Jest + ts-jest

**Prerequisite:** Plans 1–4 complete.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/features/lint/LintService.ts` | Orphan detection, broken-link detection, LLM health check prompt, structured report |
| `src/features/lint/LintScheduler.ts` | Register/clear `Plugin.registerInterval` based on settings schedule |
| `__tests__/features/lint/LintService.test.ts` | Orphan + broken-link detection; LLM call verification |
| `__tests__/features/lint/LintScheduler.test.ts` | Scheduler register/clear based on schedule setting |
| `README.md` | Installation, configuration, and quick-start documentation |

---

### Task 1: LintService

**Files:**
- Create: `src/features/lint/LintService.ts`
- Create: `__tests__/features/lint/LintService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/lint/LintService.test.ts
import { LintService } from '../../../src/features/lint/LintService';
import { mockVault } from '../../../__mocks__/obsidian';
import type { WikiSchema } from '../../../src/types';

const mockProvider = {
  chat: jest.fn(async function* () {
    yield '## Lint Report\n\n**Orphaned pages:** 1\n**Issues:** None critical.';
  }),
};

const mockSchema: WikiSchema = {
  systemPrompt: 'You are a wiki assistant.',
  pageTypes: ['concept'],
  relationTypes: ['related'],
  defaultPageType: 'concept',
};

const mockSettings = { wikiFolder: 'wiki' };

// Page A links to B, B links to C, D is orphaned (no incoming links)
const PAGE_A = `---
wiki_type: concept
related: ["[[Page B]]"]
---
# Page A`;

const PAGE_B = `---
wiki_type: concept
related: ["[[Page C]]"]
---
# Page B`;

const PAGE_C = `---
wiki_type: concept
related: []
---
# Page C`;

const PAGE_D = `---
wiki_type: concept
related: []
---
# Page D - Orphan`;

// Page E has a broken link
const PAGE_E = `---
wiki_type: concept
related: ["[[NonExistent]]"]
---
# Page E`;

describe('LintService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVault.getFiles.mockReturnValue([
      { path: 'wiki/concepts/Page A.md', extension: 'md', name: 'Page A.md' },
      { path: 'wiki/concepts/Page B.md', extension: 'md', name: 'Page B.md' },
      { path: 'wiki/concepts/Page C.md', extension: 'md', name: 'Page C.md' },
      { path: 'wiki/concepts/Page D.md', extension: 'md', name: 'Page D.md' },
      { path: 'wiki/concepts/Page E.md', extension: 'md', name: 'Page E.md' },
    ]);
    mockVault.cachedRead
      .mockResolvedValueOnce(PAGE_A)
      .mockResolvedValueOnce(PAGE_B)
      .mockResolvedValueOnce(PAGE_C)
      .mockResolvedValueOnce(PAGE_D)
      .mockResolvedValueOnce(PAGE_E);
  });

  it('detects orphaned pages (no incoming links)', async () => {
    const service = new LintService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any);
    const report = await service.lint(jest.fn());
    expect(report.orphans).toContain('Page D');
  });

  it('detects broken wikilinks', async () => {
    const service = new LintService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any);
    const report = await service.lint(jest.fn());
    expect(report.brokenLinks.some((bl) => bl.link === '[[NonExistent]]')).toBe(true);
  });

  it('calls LLM provider for qualitative analysis', async () => {
    const service = new LintService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any);
    await service.lint(jest.fn());
    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
  });

  it('streams LLM output to onChunk callback', async () => {
    const service = new LintService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any);
    const chunks: string[] = [];
    await service.lint((chunk) => chunks.push(chunk));
    expect(chunks.join('')).toContain('Lint Report');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/lint/LintService.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/lint/LintService'`

- [ ] **Step 3: Create `src/features/lint/LintService.ts`**

```typescript
import type { Vault, TFile } from 'obsidian';
import type { LLMProvider, WikiSchema, LLMWikiSettings, ChatMessage } from '../../types';

export interface BrokenLink {
  sourcePage: string;
  link: string;
}

export interface LintReport {
  orphans: string[];
  brokenLinks: BrokenLink[];
  llmAnalysis: string;
}

export class LintService {
  constructor(
    private vault: Vault,
    private provider: LLMProvider,
    private schema: WikiSchema,
    private settings: Pick<LLMWikiSettings, 'wikiFolder'>,
  ) {}

  async lint(onChunk: (text: string) => void): Promise<LintReport> {
    const wikiFiles = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(this.settings.wikiFolder) && f.extension === 'md');

    // Build page contents map
    const pageMap: Map<string, string> = new Map();
    for (const file of wikiFiles) {
      const content = await this.vault.cachedRead(file as TFile);
      const name = file.name.replace(/\.md$/, '');
      pageMap.set(name, content);
    }

    const allPageNames = new Set(pageMap.keys());

    // Detect broken links and build incoming-link index
    const incomingLinks: Map<string, number> = new Map();
    const brokenLinks: BrokenLink[] = [];

    for (const [pageName, content] of pageMap) {
      const links = this.extractWikilinks(content);
      for (const link of links) {
        const target = link.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
        if (!allPageNames.has(target)) {
          brokenLinks.push({ sourcePage: pageName, link });
        } else {
          incomingLinks.set(target, (incomingLinks.get(target) ?? 0) + 1);
        }
      }
    }

    // Detect orphans: pages with 0 incoming links (excluding index.md and log.md)
    const orphans: string[] = [];
    for (const pageName of allPageNames) {
      if (pageName === 'index' || pageName === 'log') continue;
      if (!incomingLinks.has(pageName) || incomingLinks.get(pageName) === 0) {
        orphans.push(pageName);
      }
    }

    // Build structured report for LLM
    const reportLines: string[] = [
      `Total wiki pages: ${pageMap.size}`,
      `Orphaned pages (${orphans.length}): ${orphans.join(', ') || 'none'}`,
      `Broken links (${brokenLinks.length}): ${brokenLinks.map((bl) => `${bl.sourcePage} → ${bl.link}`).join(', ') || 'none'}`,
    ];

    // Summarise each page in 1 line for LLM context
    const pageSummaries = [...pageMap.entries()]
      .map(([name, content]) => `- ${name}: ${content.split('\n').find((l) => l.startsWith('#'))?.slice(2) ?? '(no heading)'}`)
      .join('\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${this.schema.systemPrompt}\n\nYou are performing a wiki health check. Analyse the structure and suggest improvements.`,
        timestamp: '',
      },
      {
        role: 'user',
        content: `## Wiki Health Report\n\n${reportLines.join('\n')}\n\n## Page List\n${pageSummaries}\n\nPlease provide:\n1. Summary of wiki health\n2. Suggestions for the orphaned pages\n3. How to fix any broken links\n4. Any conceptual gaps or missing pages you notice`,
        timestamp: '',
      },
    ];

    let llmAnalysis = '';
    for await (const token of this.provider.chat(messages)) {
      llmAnalysis += token;
      onChunk(token);
    }

    return { orphans, brokenLinks, llmAnalysis };
  }

  private extractWikilinks(content: string): string[] {
    const matches = content.match(/\[\[[^\]]+\]\]/g) ?? [];
    return matches;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/features/lint/LintService.test.ts
```

Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/lint/LintService.ts __tests__/features/lint/LintService.test.ts
git commit -m "feat: add LintService with orphan/broken-link detection and LLM analysis

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: LintScheduler

**Files:**
- Create: `src/features/lint/LintScheduler.ts`
- Create: `__tests__/features/lint/LintScheduler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/lint/LintScheduler.test.ts
import { LintScheduler } from '../../../src/features/lint/LintScheduler';

describe('LintScheduler', () => {
  let registerIntervalMock: jest.Mock;
  let lintCallback: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    registerIntervalMock = jest.fn((cb: () => void, ms: number) => {
      return window.setInterval(cb, ms);
    });
    lintCallback = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => jest.useRealTimers());

  it('registers daily interval (24 hours) when schedule is daily', () => {
    LintScheduler.register('daily', registerIntervalMock, lintCallback);
    expect(registerIntervalMock).toHaveBeenCalledWith(
      expect.any(Function),
      24 * 60 * 60 * 1000
    );
  });

  it('registers weekly interval (7 days) when schedule is weekly', () => {
    LintScheduler.register('weekly', registerIntervalMock, lintCallback);
    expect(registerIntervalMock).toHaveBeenCalledWith(
      expect.any(Function),
      7 * 24 * 60 * 60 * 1000
    );
  });

  it('does not register any interval when schedule is off', () => {
    LintScheduler.register('off', registerIntervalMock, lintCallback);
    expect(registerIntervalMock).not.toHaveBeenCalled();
  });

  it('calls lintCallback when interval fires', () => {
    LintScheduler.register('daily', registerIntervalMock, lintCallback);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 100);
    expect(lintCallback).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/lint/LintScheduler.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/lint/LintScheduler'`

- [ ] **Step 3: Create `src/features/lint/LintScheduler.ts`**

```typescript
export type LintSchedule = 'off' | 'daily' | 'weekly';

const INTERVALS: Record<Exclude<LintSchedule, 'off'>, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export class LintScheduler {
  /**
   * Register an auto-lint interval.
   * @param schedule - 'off' | 'daily' | 'weekly'
   * @param registerInterval - Pass `this.registerInterval` from the Plugin class.
   *   It wraps `setInterval` and auto-clears on plugin unload.
   * @param onLint - Async callback invoked each interval. Should not throw.
   */
  static register(
    schedule: LintSchedule,
    registerInterval: (cb: () => void, intervalMs: number) => number,
    onLint: () => Promise<void>,
  ): void {
    if (schedule === 'off') return;

    const ms = INTERVALS[schedule];
    registerInterval(() => {
      onLint().catch((e) => console.warn('Auto-lint error:', e));
    }, ms);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/features/lint/LintScheduler.test.ts
```

Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/lint/LintScheduler.ts __tests__/features/lint/LintScheduler.test.ts
git commit -m "feat: add LintScheduler for daily/weekly auto-lint

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Wire /lint and register command palette item

**Files:**
- Modify: `src/ui/LLMWikiView.ts` — add `lint` case to `handleCommand`
- Modify: `src/main.ts` — register "LLM Wiki: Lint Wiki" command + auto-lint scheduler

- [ ] **Step 1: Add `lint` case to `handleCommand` in `LLMWikiView.ts`**

```typescript
case 'lint': {
  const { LintService } = await import('../features/lint/LintService');
  const { SaveService } = await import('../features/save/SaveService');
  const { WikiManager } = await import('../features/ingest/WikiManager');
  const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
  const provider = ProviderFactory.create(this.plugin.settings);

  const bubble = this.messagesEl.createEl('div', { cls: 'llm-wiki-bubble llm-wiki-bubble-assistant' });
  const contentEl = bubble.createEl('div', { cls: 'llm-wiki-bubble-content', text: '' });

  this.setStatus('Running lint…');
  const lintService = new LintService(this.app.vault, provider, schema, this.plugin.settings);
  const report = await lintService.lint((chunk) => {
    contentEl.textContent += chunk;
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  });
  this.setStatus('');

  // Add "Save Lint Report" button
  const actions = bubble.createEl('div', { cls: 'llm-wiki-bubble-actions' });
  const saveBtn = actions.createEl('button', { text: '💾 Save Lint Report', cls: 'llm-wiki-action-btn' });
  saveBtn.addEventListener('click', async () => {
    const wm = new WikiManager(this.app.vault, this.plugin.settings.wikiFolder);
    const saveService = new SaveService(wm, schema, this.plugin.settings);
    const ts = new Date().toISOString().slice(0, 10);
    await saveService.save(`Lint Report ${ts}`, report.llmAnalysis, 'summary');
    new Notice('✅ Lint report saved to wiki.');
  });
  break;
}
```

- [ ] **Step 2: Register "LLM Wiki: Lint Wiki" command and scheduler in `src/main.ts`**

Add to `onload()` after existing commands:

```typescript
// Lint command palette item
this.addCommand({
  id: 'lint-wiki',
  name: 'Lint Wiki',
  callback: async () => {
    await this.activateView();
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_LLM_WIKI)[0];
    if (leaf?.view) (leaf.view as any).handleCommand('lint', '');
  },
});

// Auto-lint scheduler
import { LintScheduler } from './features/lint/LintScheduler';
import { LintService } from './features/lint/LintService';
import { SchemaLoader } from './schema/SchemaLoader';
import { ProviderFactory } from './providers/ProviderFactory';

LintScheduler.register(
  this.settings.autoLintSchedule,
  this.registerInterval.bind(this),
  async () => {
    const schema = await SchemaLoader.load(this.app.vault, this.settings);
    const provider = ProviderFactory.create(this.settings);
    const lintService = new LintService(this.app.vault, provider, schema, this.settings);
    await lintService.lint((chunk) => console.log('[auto-lint]', chunk));
  },
);
```

- [ ] **Step 3: Build and run all tests**

```bash
npm run build && npx jest --verbose
```

Expected: Build success. All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/LLMWikiView.ts src/main.ts
git commit -m "feat: wire /lint command, command palette item, and auto-lint scheduler

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Error notices and plugin cleanup polish

**Files:**
- Modify: `src/ui/LLMWikiView.ts` — add missing-API-key guard and max-message notice
- Modify: `src/main.ts` — add `onunload()` cleanup
- Modify: `src/settings/SettingsTab.ts` — add validation notice for missing API key

- [ ] **Step 1: Add API key guard at top of `handleQuery` in `LLMWikiView.ts`**

Add this as the first thing in `handleQuery`, before the `appendMessageBubble` call:

```typescript
// Guard: validate settings before LLM call
const { provider: providerType, openAiApiKey, anthropicApiKey } = this.plugin.settings;
if (providerType === 'openai' && !openAiApiKey) {
  new Notice('⚠️ OpenAI API key not set. Go to Settings → LLM Wiki to add it.');
  return;
}
if (providerType === 'anthropic' && !anthropicApiKey) {
  new Notice('⚠️ Anthropic API key not set. Go to Settings → LLM Wiki to add it.');
  return;
}
```

- [ ] **Step 2: Add max-message guard in `handleQuery` — warn at 450 messages**

Add after appending the assistant message to session:

```typescript
// Max message guard
if (this.currentSession.messages.length >= 450) {
  new Notice('⚠️ Session nearing limit (450 messages). Use /summarize to compress history.');
}
```

- [ ] **Step 3: Ensure `onunload()` is complete in `src/main.ts`**

```typescript
async onunload(): Promise<void> {
  this.app.workspace.detachLeavesOfType(VIEW_TYPE_LLM_WIKI);
  // Registered events and intervals are auto-cleared by Obsidian when Plugin.unload() is called.
  // The above detach ensures the view DOM is torn down cleanly.
}
```

- [ ] **Step 4: Add validation notice in `SettingsTab` when provider is selected without API key**

In `LLMWikiSettingsTab.display()`, after the provider dropdown, add a refresh-triggered check:

```typescript
// After provider dropdown handler:
providerDropdown.onChange(async (value) => {
  this.plugin.settings.provider = value as LLMProvider;
  await this.plugin.saveSettings();
  // Refresh tab to show/hide API key field
  this.display();
});

// API key field — only show for cloud providers
if (this.plugin.settings.provider === 'openai') {
  new Setting(containerEl)
    .setName('OpenAI API Key')
    .setDesc('Required for OpenAI provider.')
    .addText((text) =>
      text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.openAiApiKey ?? '')
        .onChange(async (v) => {
          this.plugin.settings.openAiApiKey = v.trim();
          await this.plugin.saveSettings();
        })
    );
}

if (this.plugin.settings.provider === 'anthropic') {
  new Setting(containerEl)
    .setName('Anthropic API Key')
    .setDesc('Required for Anthropic provider.')
    .addText((text) =>
      text
        .setPlaceholder('sk-ant-...')
        .setValue(this.plugin.settings.anthropicApiKey ?? '')
        .onChange(async (v) => {
          this.plugin.settings.anthropicApiKey = v.trim();
          await this.plugin.saveSettings();
        })
    );
}
```

- [ ] **Step 5: Build and run all tests**

```bash
npm run build && npx jest --verbose
```

Expected: Build success. All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/LLMWikiView.ts src/main.ts src/settings/SettingsTab.ts
git commit -m "fix: add API key guards, max-message notice, and onunload cleanup

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Obsidian LLM Wiki Plugin

An Obsidian plugin that implements the [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — a persistent, LLM-maintained knowledge base inside your vault, with a full chat interface.

## Features

- **Chat sidebar** — Ask questions; the LLM answers using your wiki as context
- **Ingest** — Convert raw notes, PDFs, Word docs, Excel sheets, PowerPoint files, and images into wiki pages
- **Save to Wiki** — One click saves any LLM response as a structured wiki page
- **Auto-ingest** — New files dropped in your raw sources folder are automatically ingested
- **Lint** — LLM-powered wiki health check: orphan detection, broken links, content gaps
- **Session management** — Persistent chat history with auto-title, rename, and summarize
- **Graph relations** — Semantic links written to YAML frontmatter so Obsidian's Graph View shows them
- **Multi-provider** — OpenAI, Anthropic, or local Ollama

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Copy them to `<your-vault>/.obsidian/plugins/obsidian-llm-wiki/`
3. In Obsidian → Settings → Community Plugins, enable **LLM Wiki**

## Configuration

Open **Settings → LLM Wiki**:

| Setting | Description | Default |
|---------|-------------|---------|
| Provider | `openai` / `anthropic` / `ollama` | `openai` |
| API Key | Required for OpenAI and Anthropic | *(empty)* |
| Model | Model name for the selected provider | `gpt-4o` |
| Raw Sources Folder | Where you drop source files | `raw` |
| Wiki Folder | Where wiki pages are written | `wiki` |
| Sessions Folder | Where session JSON files are stored | `.llm-wiki/sessions` |
| Auto Ingest | Ingest new files automatically | `false` |
| Auto Lint | `off` / `daily` / `weekly` | `off` |
| Context Window | Number of messages sent to LLM per request | `20` |

## Quick Start

1. Set your API key in Settings
2. Click the 🧠 ribbon icon to open the chat panel
3. Drop a PDF into your `raw/` folder and type `/ingest raw/your-file.pdf`
4. Ask questions — the LLM will use your wiki as context
5. Click **💾 Save to Wiki** on any answer you want to keep

## Slash Commands

| Command | Description |
|---------|-------------|
| `/ingest [path]` | Ingest a single file |
| `/reingest [path]` | Force re-ingest (bypass hash check) |
| `/ingest-all` | Ingest all files in the raw sources folder |
| `/save [title]` | Save last LLM response as a wiki page |
| `/relate [[Page]]` | Re-analyse relations for a specific page |
| `/lint` | Run wiki health check |
| `/summarize` | Compress session history into a summary |
| `/help` | Show available commands |

## Supported File Formats

`.md`, `.txt`, `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`

## Wiki Structure

```
wiki/
  index.md          ← auto-maintained page index
  log.md            ← ingest/save activity log
  sources/          ← pages generated from raw source files
  concepts/         ← pages saved from chat responses
  (custom dirs)     ← schema-extensible
```

## Graph View

Every wiki page has YAML frontmatter with relation fields (`related`, `is_a`, `part_of`, etc.). Obsidian's built-in Graph View reads `[[wikilinks]]` in these fields and renders them as edges.

## Schema Customisation

Create `WIKI_SCHEMA.md` anywhere in your vault:

```markdown
## System Prompt

You are an expert knowledge engineer. Always structure wiki pages with clear headings.

## Relation Types

related, is_a, part_of, mentions, supports, contradicts, derived_from, my_custom_relation
```

## Development

```bash
npm install
npm run dev     # watch + build
npm test        # run test suite
npm run build   # production build
```

## License

MIT
```

- [ ] **Step 2: Verify README renders correctly (spot-check)**

Open `README.md` in a Markdown viewer and confirm the table and code blocks render without errors.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with installation, config, and quick-start

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Final integration verification

- [ ] **Step 1: Run full test suite with coverage**

```bash
npx jest --coverage --verbose
```

Expected output:
```
PASS __tests__/storage/SessionStore.test.ts
PASS __tests__/utils/ContextBuilder.test.ts
PASS __tests__/ui/SlashCommandParser.test.ts
PASS __tests__/features/ingest/FileParser.test.ts
PASS __tests__/features/ingest/ContentHasher.test.ts
PASS __tests__/features/ingest/WikiManager.test.ts
PASS __tests__/features/ingest/IngestService.test.ts
PASS __tests__/features/query/QueryService.test.ts
PASS __tests__/features/save/SaveService.test.ts
PASS __tests__/features/relations/FrontmatterMerger.test.ts
PASS __tests__/features/relations/RelationService.test.ts
PASS __tests__/features/lint/LintService.test.ts
PASS __tests__/features/lint/LintScheduler.test.ts

Test Suites: 13 passed, 13 total
Tests:       ~50 passed
```

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: `main.js` produced. No TypeScript errors. File size under 5MB.

- [ ] **Step 3: Manual smoke test with Obsidian**

1. Copy `main.js`, `manifest.json`, `styles.css` to a test vault's `.obsidian/plugins/obsidian-llm-wiki/`
2. Enable the plugin in Settings → Community Plugins
3. Add your API key in Settings → LLM Wiki
4. Open chat panel via ribbon icon ✅
5. Type a message — verify streaming response ✅
6. Drop a `.md` file in `raw/` → type `/ingest raw/filename.md` → verify wiki page created ✅
7. Click "Save to Wiki" → verify YAML frontmatter present ✅
8. Open Graph View → verify relations show as edges ✅
9. Type `/lint` → verify orphan and broken-link report ✅
10. Switch sessions via selector ✅

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final integration verification — all tests pass, build clean

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## All Plans Complete 🎉

| Plan | Files | Status |
|------|-------|--------|
| Plan 1: Foundation | `src/types.ts`, providers, schema, settings, `main.ts` | ✅ |
| Plan 2: Session & Chat UI | `SessionStore`, `ContextBuilder`, `LLMWikiView`, `SlashCommandParser` | ✅ |
| Plan 3: Ingest Pipeline | `FileParser`, parsers, `WikiManager`, `IngestService`, `AutoWatcher` | ✅ |
| Plan 4: Query + Save + Graph | `QueryService`, `SaveService`, `FrontmatterMerger`, `RelationService` | ✅ |
| Plan 5: Lint & Polish | `LintService`, `LintScheduler`, error notices, `README.md` | ✅ |
