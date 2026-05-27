# Obsidian LLM Wiki — Plan 4: Query, Save & Graph Relations

## Implementation Status Update (2026-05-26)

- Phase 4 query/save/relation capabilities are implemented and covered by integration tests.
- Save flow writes analysis pages and triggers relation updates after save.
- Save to Wiki button now immediately saves the clicked assistant response with auto-generated title (no title prompt modal).
- Save resolution now falls back to latest assistant message in session history when in-memory cache is empty (e.g., after plugin reload).
- Save operation appends `save-success` / `save-error` entries to `wiki/log.md` for observability.
- Relation extraction is constrained to wiki content folders (`sources`, `entities`, `concepts`) to avoid index/log noise in graph links.
- Frontmatter merge behavior preserves existing fields and adds relation links safely.
- Additional operational commands now exist alongside relation features: `/reindex`, `/log-tail`, `/log-filter`.
- Some lower sections still keep legacy draft snippets for historical context (including modal-based save prompt examples); runtime behavior should follow the status bullets above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `QueryService` (reads wiki pages → LLM response), `SaveService` (saves LLM response as a wiki page), and `RelationService` (LLM-powered semantic graph linking with YAML frontmatter) — plus wire `/save`, `/relate`, "Save to Wiki" button, and post-ingest/post-save relation analysis.

**Architecture:** `QueryService` reads all files under `wikiFolder`, builds a context string, and sends it with the user question to the LLM. `SaveService` uses `WikiPageTemplate` (Plan 1) to format the page before writing with `WikiManager` (Plan 3). `RelationService` calls the LLM to identify semantic relations, then uses `FrontmatterMerger` to merge wikilinks into YAML frontmatter without overwriting existing links. Graph View sees relations via `[[wikilinks]]` in YAML arrays.

**Tech Stack:** TypeScript 5, Obsidian Plugin API, Jest + ts-jest

**Prerequisite:** Plans 1–3 complete.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/features/query/QueryService.ts` | Read wiki pages, build LLM prompt, stream response |
| `src/features/save/SaveService.ts` | Format content as wiki page via `WikiPageTemplate`, write via `WikiManager` |
| `src/features/relations/FrontmatterMerger.ts` | Parse YAML frontmatter, merge new links, write back — never overwrites existing |
| `src/features/relations/RelationService.ts` | LLM call to identify relations, dispatch writes via `FrontmatterMerger` |
| `__tests__/features/query/QueryService.test.ts` | Wiki read + LLM call + stream |
| `__tests__/features/save/SaveService.test.ts` | Page formatting + vault write |
| `__tests__/features/relations/FrontmatterMerger.test.ts` | Merge logic: dedup, symmetric, directed |
| `__tests__/features/relations/RelationService.test.ts` | LLM relation extraction + write dispatch |

---

### Task 1: QueryService

**Files:**
- Create: `src/features/query/QueryService.ts`
- Create: `__tests__/features/query/QueryService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/query/QueryService.test.ts
import { QueryService } from '../../../src/features/query/QueryService';
import { mockVault } from '../../../__mocks__/obsidian';
import type { WikiSchema } from '../../../src/types';

const mockProvider = {
  chat: jest.fn(async function* () { yield 'Based on the wiki, '; yield 'here is the answer.'; }),
};

const mockSchema: WikiSchema = {
  systemPrompt: 'You are a wiki assistant.',
  pageTypes: ['concept', 'summary', 'qa'],
  relationTypes: ['related'],
  defaultPageType: 'concept',
};

const mockSettings = { wikiFolder: 'wiki', contextWindowSize: 20 };

describe('QueryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate 2 wiki pages
    mockVault.getFiles.mockReturnValue([
      { path: 'wiki/concepts/ML.md', extension: 'md', name: 'ML.md' },
      { path: 'wiki/concepts/NLP.md', extension: 'md', name: 'NLP.md' },
    ]);
    mockVault.cachedRead.mockResolvedValue('---\nwiki_type: concept\n---\n# Content here');
  });

  it('reads wiki pages and includes them in LLM prompt', async () => {
    const service = new QueryService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any);
    const chunks: string[] = [];

    await service.query('What is machine learning?', [], (c) => chunks.push(c));

    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    const [messages] = (mockProvider.chat as jest.Mock).mock.calls[0];
    const userMsg = messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toContain('What is machine learning?');
  });

  it('streams tokens to onChunk callback', async () => {
    const service = new QueryService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any);
    const chunks: string[] = [];

    await service.query('test', [], (c) => chunks.push(c));

    expect(chunks.join('')).toBe('Based on the wiki, here is the answer.');
  });

  it('returns full response string', async () => {
    const service = new QueryService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any);
    const result = await service.query('test', [], jest.fn());
    expect(result).toBe('Based on the wiki, here is the answer.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/query/QueryService.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/query/QueryService'`

- [ ] **Step 3: Create `src/features/query/QueryService.ts`**

```typescript
import type { Vault, TFile } from 'obsidian';
import type { LLMProvider, WikiSchema, LLMWikiSettings, ChatMessage } from '../../types';

const MAX_WIKI_CONTEXT_CHARS = 12000;

export class QueryService {
  constructor(
    private vault: Vault,
    private provider: LLMProvider,
    private schema: WikiSchema,
    private settings: Pick<LLMWikiSettings, 'wikiFolder' | 'contextWindowSize'>,
  ) {}

  async query(
    question: string,
    sessionHistory: ChatMessage[],
    onChunk: (text: string) => void,
  ): Promise<string> {
    const wikiContext = await this.buildWikiContext();

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${this.schema.systemPrompt}\n\n## Wiki Knowledge Base\n\n${wikiContext}`,
        timestamp: '',
      },
      ...sessionHistory,
      { role: 'user', content: question, timestamp: new Date().toISOString() },
    ];

    let full = '';
    for await (const token of this.provider.chat(messages)) {
      full += token;
      onChunk(token);
    }
    return full;
  }

  private async buildWikiContext(): Promise<string> {
    const wikiFiles = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(this.settings.wikiFolder) && f.extension === 'md');

    const parts: string[] = [];
    let total = 0;

    for (const file of wikiFiles) {
      if (total >= MAX_WIKI_CONTEXT_CHARS) break;
      const content = await this.vault.cachedRead(file as TFile);
      const excerpt = content.slice(0, 1500);
      parts.push(`### ${file.name}\n${excerpt}`);
      total += excerpt.length;
    }

    return parts.join('\n\n---\n\n') || '(No wiki pages yet.)';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/features/query/QueryService.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/query/QueryService.ts __tests__/features/query/QueryService.test.ts
git commit -m "feat: add QueryService reading wiki context for LLM responses

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: SaveService

**Files:**
- Create: `src/features/save/SaveService.ts`
- Create: `__tests__/features/save/SaveService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/save/SaveService.test.ts
import { SaveService } from '../../../src/features/save/SaveService';
import { mockVault } from '../../../__mocks__/obsidian';
import type { WikiSchema } from '../../../src/types';

const mockWikiManager = {
  writePage: jest.fn().mockResolvedValue(undefined),
  appendToLog: jest.fn().mockResolvedValue(undefined),
  updateIndex: jest.fn().mockResolvedValue(undefined),
};

const mockSchema: WikiSchema = {
  systemPrompt: 'You are a wiki assistant.',
  pageTypes: ['concept', 'summary', 'qa'],
  relationTypes: ['related'],
  defaultPageType: 'concept',
};

const mockSettings = { wikiFolder: 'wiki' };

describe('SaveService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('save() writes page with YAML frontmatter', async () => {
    const service = new SaveService(mockWikiManager as any, mockSchema, mockSettings as any);
    await service.save('Machine Learning', 'Machine learning is a subset of AI.');

    expect(mockWikiManager.writePage).toHaveBeenCalledWith(
      'wiki/concepts/Machine Learning.md',
      expect.stringContaining('wiki_type: concept')
    );
    expect(mockWikiManager.writePage).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Machine learning is a subset of AI.')
    );
  });

  it('save() updates index after writing', async () => {
    const service = new SaveService(mockWikiManager as any, mockSchema, mockSettings as any);
    await service.save('Test Page', 'content');

    expect(mockWikiManager.updateIndex).toHaveBeenCalledWith('Test Page', expect.stringContaining('Test Page'));
    expect(mockWikiManager.appendToLog).toHaveBeenCalledWith(expect.stringContaining('Saved'));
  });

  it('save() uses provided page type when given', async () => {
    const service = new SaveService(mockWikiManager as any, mockSchema, mockSettings as any);
    await service.save('My QA', 'Q: ... A: ...', 'qa');

    expect(mockWikiManager.writePage).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('wiki_type: qa')
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/save/SaveService.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/save/SaveService'`

- [ ] **Step 3: Create `src/features/save/SaveService.ts`**

```typescript
import type { WikiSchema, LLMWikiSettings } from '../../types';
import { WikiPageTemplate } from '../../schema/WikiPageTemplate';
import type { WikiManager } from '../ingest/WikiManager';

export class SaveService {
  constructor(
    private wikiManager: WikiManager,
    private schema: WikiSchema,
    private settings: Pick<LLMWikiSettings, 'wikiFolder'>,
  ) {}

  async save(
    title: string,
    content: string,
    pageType?: string,
    relations?: Record<string, string[]>,
  ): Promise<string> {
    const type = pageType ?? this.schema.defaultPageType;
    const pageContent = WikiPageTemplate.render(title, content, type, relations ?? {});
    const path = `${this.settings.wikiFolder}/concepts/${title}.md`;

    await this.wikiManager.writePage(path, pageContent);
    await this.wikiManager.updateIndex(title, path);
    await this.wikiManager.appendToLog(`Saved: ${path}`);

    return path;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/features/save/SaveService.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/save/SaveService.ts __tests__/features/save/SaveService.test.ts
git commit -m "feat: add SaveService for writing LLM responses as wiki pages

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: FrontmatterMerger

**Files:**
- Create: `src/features/relations/FrontmatterMerger.ts`
- Create: `__tests__/features/relations/FrontmatterMerger.test.ts`

The merger parses YAML frontmatter, merges new wikilinks, deduplicates, and writes back — never deleting existing links.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/relations/FrontmatterMerger.test.ts
import { FrontmatterMerger } from '../../../src/features/relations/FrontmatterMerger';

const BASE_PAGE = `---
wiki_type: concept
updated: 2026-01-01
tags: [wiki, concept]
related: ["[[Existing Page]]"]
is_a: []
---

# My Page

Content here.`;

describe('FrontmatterMerger.merge', () => {
  it('adds a new related link without removing existing one', () => {
    const result = FrontmatterMerger.merge(BASE_PAGE, 'related', ['[[New Page]]']);
    expect(result).toContain('[[Existing Page]]');
    expect(result).toContain('[[New Page]]');
  });

  it('does not duplicate an existing link', () => {
    const result = FrontmatterMerger.merge(BASE_PAGE, 'related', ['[[Existing Page]]']);
    const count = (result.match(/\[\[Existing Page\]\]/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('creates relation field if not present', () => {
    const result = FrontmatterMerger.merge(BASE_PAGE, 'mentions', ['[[Mentioned Thing]]']);
    expect(result).toContain('mentions:');
    expect(result).toContain('[[Mentioned Thing]]');
  });

  it('preserves non-frontmatter body content', () => {
    const result = FrontmatterMerger.merge(BASE_PAGE, 'related', ['[[New Page]]']);
    expect(result).toContain('# My Page');
    expect(result).toContain('Content here.');
  });

  it('handles page with no frontmatter by creating it', () => {
    const bare = '# Bare Page\n\nContent.';
    const result = FrontmatterMerger.merge(bare, 'related', ['[[Something]]']);
    expect(result).toMatch(/^---\n/);
    expect(result).toContain('related:');
    expect(result).toContain('[[Something]]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/relations/FrontmatterMerger.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/relations/FrontmatterMerger'`

- [ ] **Step 3: Create `src/features/relations/FrontmatterMerger.ts`**

```typescript
export class FrontmatterMerger {
  static merge(pageContent: string, relationField: string, newLinks: string[]): string {
    const fmMatch = pageContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!fmMatch) {
      // No frontmatter — create minimal frontmatter
      const fm = `---\nwiki_type: concept\n${relationField}: ${JSON.stringify(newLinks)}\n---\n`;
      return fm + pageContent;
    }

    const fmRaw = fmMatch[1];
    const body = fmMatch[2];

    // Find existing values for this relation field
    const fieldRegex = new RegExp(`^(${relationField}:\\s*)(.*)$`, 'm');
    const fieldMatch = fmRaw.match(fieldRegex);

    let updatedFm: string;

    if (fieldMatch) {
      // Parse existing array
      const existingStr = fieldMatch[2].trim();
      let existing: string[] = [];
      try {
        existing = JSON.parse(existingStr.replace(/'/g, '"'));
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = existingStr ? [existingStr] : [];
      }

      // Merge, dedup
      const merged = Array.from(new Set([...existing, ...newLinks]));
      updatedFm = fmRaw.replace(fieldRegex, `$1${JSON.stringify(merged)}`);
    } else {
      // Append new field at end of frontmatter
      updatedFm = fmRaw + `\n${relationField}: ${JSON.stringify(newLinks)}`;
    }

    return `---\n${updatedFm}\n---\n${body}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/features/relations/FrontmatterMerger.test.ts
```

Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/relations/FrontmatterMerger.ts __tests__/features/relations/FrontmatterMerger.test.ts
git commit -m "feat: add FrontmatterMerger for non-destructive YAML relation merging

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: RelationService

**Files:**
- Create: `src/features/relations/RelationService.ts`
- Create: `__tests__/features/relations/RelationService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/relations/RelationService.test.ts
import { RelationService } from '../../../src/features/relations/RelationService';
import { mockVault } from '../../../__mocks__/obsidian';
import type { WikiSchema } from '../../../src/types';

const mockProvider = {
  chat: jest.fn(async function* () {
    yield JSON.stringify([
      { page: '[[Machine Learning]]', relationType: 'related' },
      { page: '[[Neural Networks]]', relationType: 'is_a' },
    ]);
  }),
};

const mockSchema: WikiSchema = {
  systemPrompt: 'You are a wiki assistant.',
  pageTypes: ['concept'],
  relationTypes: ['related', 'is_a', 'part_of', 'mentions', 'supports', 'contradicts', 'derived_from'],
  defaultPageType: 'concept',
};

describe('RelationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVault.getFiles.mockReturnValue([
      { path: 'wiki/concepts/ML.md', extension: 'md', name: 'ML.md' },
    ]);
    mockVault.cachedRead.mockResolvedValue('---\nwiki_type: concept\nrelated: []\n---\n# ML');
    mockVault.getAbstractFileByPath.mockReturnValue({ path: 'wiki/concepts/NewPage.md' });
    mockVault.modify.mockResolvedValue(undefined);
  });

  it('analyse() calls provider with wiki page list and new page content', async () => {
    const service = new RelationService(mockVault as any, mockProvider as any, mockSchema);
    await service.analyse('[[New Page]]', 'New page about deep learning.', 'wiki');

    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    const [messages] = (mockProvider.chat as jest.Mock).mock.calls[0];
    const userMsg = messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toContain('deep learning');
  });

  it('analyse() calls vault.modify to merge relations into existing pages', async () => {
    const service = new RelationService(mockVault as any, mockProvider as any, mockSchema);
    await service.analyse('[[New Page]]', 'New page about deep learning.', 'wiki');
    // Should write back the page with merged frontmatter
    expect(mockVault.modify).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/relations/RelationService.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/relations/RelationService'`

- [ ] **Step 3: Create `src/features/relations/RelationService.ts`**

```typescript
import type { Vault, TFile } from 'obsidian';
import type { LLMProvider, WikiSchema, ChatMessage } from '../../types';
import { FrontmatterMerger } from './FrontmatterMerger';

interface RelationResult {
  page: string;
  relationType: string;
}

const DIRECTED_RELATIONS = new Set(['is_a', 'part_of', 'derived_from']);

export class RelationService {
  constructor(
    private vault: Vault,
    private provider: LLMProvider,
    private schema: WikiSchema,
  ) {}

  async analyse(newPageLink: string, newPageContent: string, wikiFolder: string): Promise<void> {
    const wikiFiles = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(wikiFolder) && f.extension === 'md');

    const pageList = wikiFiles.map((f) => `[[${f.name.replace(/\.md$/, '')}]]`).join(', ');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a knowledge graph analyst. Respond with ONLY a valid JSON array. Each element must be: {"page": "[[PageName]]", "relationType": "<type>"}. Valid types: ${this.schema.relationTypes.join(', ')}. Do not include any text outside the JSON array.`,
        timestamp: '',
      },
      {
        role: 'user',
        content: `New page: ${newPageLink}\n\nContent:\n${newPageContent.slice(0, 3000)}\n\nExisting wiki pages: ${pageList}\n\nIdentify semantic relations from the new page to existing pages.`,
        timestamp: '',
      },
    ];

    let json = '';
    for await (const token of this.provider.chat(messages)) json += token;

    let relations: RelationResult[] = [];
    try {
      const jsonStr = json.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
      relations = JSON.parse(jsonStr);
      if (!Array.isArray(relations)) relations = [];
    } catch {
      return; // LLM returned non-parseable JSON — skip silently
    }

    await this.writeRelations(newPageLink, relations, wikiFolder);
  }

  async reanalysePageRelations(pageLink: string, wikiFolder: string): Promise<void> {
    const pageName = pageLink.replace(/^\[\[/, '').replace(/\]\]$/, '');
    const pageFile = this.vault.getFiles().find(
      (f) => f.path.startsWith(wikiFolder) && f.name === `${pageName}.md`
    );
    if (!pageFile) return;
    const content = await this.vault.cachedRead(pageFile as TFile);
    await this.analyse(pageLink, content, wikiFolder);
  }

  private async writeRelations(
    newPageLink: string,
    relations: RelationResult[],
    wikiFolder: string,
  ): Promise<void> {
    for (const { page, relationType } of relations) {
      if (!this.schema.relationTypes.includes(relationType)) continue;

      // Write outgoing relation on newPage (merge into its frontmatter later via SaveService)
      // Write incoming relation on target page
      const targetName = page.replace(/^\[\[/, '').replace(/\]\]$/, '');
      const targetFile = this.vault.getFiles().find(
        (f) => f.path.startsWith(wikiFolder) && f.name === `${targetName}.md`
      );
      if (!targetFile) continue;

      const targetContent = await this.vault.cachedRead(targetFile as TFile);
      let updated = targetContent;

      if (DIRECTED_RELATIONS.has(relationType)) {
        // Directed: only add forward link on source (newPage), no reverse forced
        // We write a "related" back-reference on the target as a soft link
        updated = FrontmatterMerger.merge(updated, 'related', [newPageLink]);
      } else {
        // Symmetric (e.g. "related", "mentions"): add in both directions
        updated = FrontmatterMerger.merge(updated, relationType, [newPageLink]);
      }

      if (updated !== targetContent) {
        await this.vault.modify(targetFile as TFile, updated);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/features/relations/RelationService.test.ts
```

Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/relations/RelationService.ts __tests__/features/relations/RelationService.test.ts
git commit -m "feat: add RelationService for LLM-driven semantic graph relations

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Wire Query, Save, and Relate into LLMWikiView

**Files:**
- Modify: `src/ui/LLMWikiView.ts` — replace stub methods with real service calls

- [ ] **Step 1: Update `handleQuery` in `LLMWikiView.ts` to use `QueryService`**

Replace the `handleQuery` method's LLM call section:

```typescript
private async handleQuery(query: string): Promise<void> {
  const userMsg: ChatMessage = { role: 'user', content: query, timestamp: new Date().toISOString() };
  this.currentSession = await this.sessionStore.appendMessage(this.currentSession.id, userMsg);
  this.appendMessageBubble(userMsg);

  this.isStreaming = true;
  this.setStatus('Thinking…');

  const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
  const provider = ProviderFactory.create(this.plugin.settings);

  const { QueryService } = await import('../features/query/QueryService');
  const queryService = new QueryService(this.app.vault, provider, schema, this.plugin.settings);

  const assistantBubble = this.messagesEl.createEl('div', { cls: 'llm-wiki-bubble llm-wiki-bubble-assistant' });
  const contentEl = assistantBubble.createEl('div', { cls: 'llm-wiki-bubble-content', text: '' });
  let fullContent = '';

  try {
    const historyForContext = ContextBuilder.build(
      this.currentSession,
      schema.systemPrompt,
      this.plugin.settings.contextWindowSize
    ).filter((m) => m.role !== 'system');

    fullContent = await queryService.query(query, historyForContext, (token) => {
      fullContent += token; // local variable gets token for streaming display
      contentEl.textContent += token;
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
    // Reset because query() already accumulated internally
    fullContent = contentEl.textContent ?? '';
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

    const actions = assistantBubble.createEl('div', { cls: 'llm-wiki-bubble-actions' });
    const copyBtn = actions.createEl('button', { text: '📋', cls: 'llm-wiki-action-btn' });
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(fullContent));
    const saveBtn = actions.createEl('button', { text: '💾 Save to Wiki', cls: 'llm-wiki-action-btn' });
    saveBtn.addEventListener('click', () => this.saveToWiki(fullContent));

    if (this.currentSession.messages.length === 2) this.autoGenerateTitle();
  }
}
```

- [ ] **Step 2: Update `saveToWiki` in `LLMWikiView.ts`**

```typescript
private async saveToWiki(content: string): Promise<void> {
  const title = await this.promptForTitle();
  if (!title) return;

  const { SaveService } = await import('../features/save/SaveService');
  const { WikiManager } = await import('../features/ingest/WikiManager');
  const { RelationService } = await import('../features/relations/RelationService');
  const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
  const provider = ProviderFactory.create(this.plugin.settings);
  const wm = new WikiManager(this.app.vault, this.plugin.settings.wikiFolder);
  const saveService = new SaveService(wm, schema, this.plugin.settings);
  const relationService = new RelationService(this.app.vault, provider, schema);

  const path = await saveService.save(title, content);
  new Notice(`✅ Saved to ${path}`);

  // Post-save relation analysis (non-blocking)
  relationService.analyse(`[[${title}]]`, content, this.plugin.settings.wikiFolder).catch(() => {});
}

private async promptForTitle(): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'llm-wiki-modal-overlay';
    modal.innerHTML = `
      <div class="llm-wiki-modal">
        <label>Page Title</label>
        <input type="text" class="llm-wiki-modal-input" placeholder="Enter page title…" />
        <div class="llm-wiki-modal-buttons">
          <button class="llm-wiki-btn llm-wiki-btn-primary">Save</button>
          <button class="llm-wiki-btn">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const input = modal.querySelector('input') as HTMLInputElement;
    const [saveBtn, cancelBtn] = modal.querySelectorAll('button');
    input.focus();
    const cleanup = (val: string | null) => { modal.remove(); resolve(val); };
    saveBtn.addEventListener('click', () => cleanup(input.value.trim() || null));
    cancelBtn.addEventListener('click', () => cleanup(null));
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') cleanup(input.value.trim() || null);
      if (e.key === 'Escape') cleanup(null);
    });
  });
}
```

- [ ] **Step 3: Wire `/save` and `/relate` commands in `handleCommand`**

Add cases to the `switch`:

```typescript
case 'save': {
  const lastAssistantMsg = [...this.currentSession.messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistantMsg) { new Notice('No assistant response to save.'); return; }
  const title = args || await this.promptForTitle();
  if (!title) return;
  const { SaveService } = await import('../features/save/SaveService');
  const { WikiManager } = await import('../features/ingest/WikiManager');
  const { RelationService } = await import('../features/relations/RelationService');
  const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
  const provider = ProviderFactory.create(this.plugin.settings);
  const wm = new WikiManager(this.app.vault, this.plugin.settings.wikiFolder);
  const saveService = new SaveService(wm, schema, this.plugin.settings);
  const path = await saveService.save(title, lastAssistantMsg.content);
  new Notice(`✅ Saved to ${path}`);
  const relationService = new RelationService(this.app.vault, provider, schema);
  relationService.analyse(`[[${title}]]`, lastAssistantMsg.content, this.plugin.settings.wikiFolder).catch(() => {});
  break;
}
case 'relate': {
  const pageLink = args || null;
  if (!pageLink) { new Notice('Usage: /relate [[Page Name]]'); return; }
  const { RelationService } = await import('../features/relations/RelationService');
  const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
  const provider = ProviderFactory.create(this.plugin.settings);
  const relationService = new RelationService(this.app.vault, provider, schema);
  new Notice(`🔗 Analysing relations for ${pageLink}…`);
  await relationService.reanalysePageRelations(pageLink, this.plugin.settings.wikiFolder);
  new Notice(`✅ Relations updated for ${pageLink}`);
  break;
}
```

- [ ] **Step 4: Build and run all tests**

```bash
npm run build && npx jest --verbose
```

Expected: Build success. All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/LLMWikiView.ts
git commit -m "feat: wire QueryService, SaveService, RelationService into chat UI

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Plan 4 Complete

```bash
npm run build && npx jest --coverage
```

Expected: All tests PASS. Chat responses use wiki context. Save-to-Wiki creates YAML-frontmatted pages visible in Graph View.

**Next:** Plan 5 — Lint & Polish
