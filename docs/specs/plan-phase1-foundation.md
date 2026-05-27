# Obsidian LLM Wiki — Plan 1: Foundation

## Implementation Status Update (2026-05-26)

- Phase 1 foundation is implemented and passing tests.
- Provider abstraction, settings, schema loading, and core type definitions are in production use.
- Runtime behavior now includes startup creation of `rawSourcesPath` when missing.
- Actual scripts differ slightly from early draft examples (build/test scripts and dependency versions follow current repository files).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a working Obsidian plugin with TypeScript scaffold, settings UI, multi-provider LLM abstraction, and wiki schema system — the foundation that Plans 2–5 depend on.

**Architecture:** Single esbuild bundle (`src/main.ts` → `main.js`). `LLMProvider` interface with three concrete implementations (OpenAI, Anthropic, Ollama). `SchemaLoader` reads `WIKI_SCHEMA.md` or falls back to settings override → built-in default. All business logic is pure TypeScript; Obsidian API is mocked in tests via `__mocks__/obsidian.ts`.

**Tech Stack:** TypeScript 5, esbuild, Jest + ts-jest, Obsidian Plugin API v1, `node-fetch` polyfill for SSE streaming

---

## File Map

| File | Responsibility |
|------|---------------|
| `manifest.json` | Plugin metadata (id, name, version, minAppVersion) |
| `package.json` | npm scripts + all dependencies |
| `tsconfig.json` | TypeScript compiler config |
| `esbuild.config.mjs` | Build config: src/main.ts → main.js |
| `jest.config.js` | Jest + ts-jest, maps `obsidian` → mock |
| `__mocks__/obsidian.ts` | Stub Obsidian classes used by the plugin |
| `src/types.ts` | All shared interfaces: `ChatMessage`, `Session`, `LLMWikiSettings` |
| `src/main.ts` | Plugin entry — `onload` wires all services |
| `src/settings/Settings.ts` | `LLMWikiSettings` interface + `DEFAULT_SETTINGS` |
| `src/settings/SettingsTab.ts` | `PluginSettingTab` UI — all settings fields |
| `src/providers/LLMProvider.ts` | `LLMProvider` interface + `ChatOptions` |
| `src/providers/OpenAIProvider.ts` | OpenAI chat completions with SSE streaming |
| `src/providers/AnthropicProvider.ts` | Anthropic messages API with SSE streaming |
| `src/providers/OllamaProvider.ts` | Ollama `/api/chat` with streaming |
| `src/providers/ProviderFactory.ts` | `create(settings): LLMProvider` |
| `src/schema/Schema.ts` | `WikiSchema` interface + `DEFAULT_SCHEMA` |
| `src/schema/SchemaLoader.ts` | `load(vault, settings): Promise<WikiSchema>` |
| `src/schema/WikiPageTemplate.ts` | `render(title, content, type, relations): string` |
| `__tests__/settings.test.ts` | DEFAULT_SETTINGS correctness |
| `__tests__/providers/ProviderFactory.test.ts` | Returns correct class per provider setting |
| `__tests__/providers/OpenAIProvider.test.ts` | Streaming + missing-key error |
| `__tests__/providers/AnthropicProvider.test.ts` | Streaming + missing-key error |
| `__tests__/providers/OllamaProvider.test.ts` | Streaming + connection-error |
| `__tests__/schema/SchemaLoader.test.ts` | Priority: WIKI_SCHEMA.md > settings > default |
| `__tests__/schema/WikiPageTemplate.test.ts` | YAML frontmatter + body output |

---

### Task 1: Project Scaffold + Test Infrastructure

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `jest.config.js`
- Create: `styles.css`
- Create: `__mocks__/obsidian.ts`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "id": "obsidian-llm-wiki",
  "name": "LLM Wiki",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Build and maintain a persistent wiki using LLMs.",
  "author": "Your Name",
  "authorUrl": "https://github.com/yourname",
  "isDesktopOnly": false
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "obsidian-llm-wiki",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "node esbuild.config.mjs",
    "dev": "node esbuild.config.mjs dev",
    "test": "jest --coverage",
    "test:watch": "jest --watch"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.0.0",
    "esbuild": "^0.21.0",
    "jest": "^29.0.0",
    "obsidian": "latest",
    "ts-jest": "^29.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2018",
    "allowSyntheticDefaultImports": true,
    "moduleResolution": "bundler",
    "importHelpers": true,
    "strict": true,
    "lib": ["ES2018", "DOM"]
  },
  "include": ["src/**/*.ts", "__mocks__/**/*.ts"],
  "exclude": ["node_modules", "__tests__"]
}
```

- [ ] **Step 4: Create `esbuild.config.mjs`**

```js
import esbuild from 'esbuild';

const prod = process.argv[2] === 'production';

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
```

- [ ] **Step 5: Create `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: { lines: 80 },
  },
};
```

- [ ] **Step 6: Create `__mocks__/obsidian.ts`**

```typescript
export class Plugin {
  app: any = { vault: mockVault };
  loadData = jest.fn().mockResolvedValue({});
  saveData = jest.fn().mockResolvedValue(undefined);
  addCommand = jest.fn();
  addRibbonIcon = jest.fn().mockReturnValue({ addClass: jest.fn() });
  registerView = jest.fn();
  registerEvent = jest.fn();
  addSettingTab = jest.fn();
}

export class ItemView {
  app: any = { vault: mockVault };
  containerEl = { empty: jest.fn(), createEl: jest.fn(() => document.createElement('div')) };
  icon = '';
}

export class PluginSettingTab {
  app: any = { vault: mockVault };
  plugin: any;
  containerEl = { empty: jest.fn(), createEl: jest.fn(() => document.createElement('div')) };
  constructor(_app: any, plugin: any) { this.plugin = plugin; }
}

export class Setting {
  settingEl = document.createElement('div');
  constructor(_containerEl: any) {}
  setName = jest.fn().mockReturnThis();
  setDesc = jest.fn().mockReturnThis();
  addText = jest.fn().mockReturnThis();
  addDropdown = jest.fn().mockReturnThis();
  addToggle = jest.fn().mockReturnThis();
}

export class Notice {
  constructor(public message: string) {}
}

export class Modal {
  app: any;
  contentEl = document.createElement('div');
  open = jest.fn();
  close = jest.fn();
}

export class TFile {
  path: string;
  name: string;
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() ?? path;
  }
}

export const mockVault = {
  read: jest.fn().mockResolvedValue(''),
  create: jest.fn().mockResolvedValue(undefined),
  modify: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  getAbstractFileByPath: jest.fn().mockReturnValue(null),
  getFiles: jest.fn().mockReturnValue([]),
  on: jest.fn().mockReturnValue({ id: 'mock-event' }),
  adapter: {
    read: jest.fn().mockResolvedValue(''),
    write: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    mkdir: jest.fn().mockResolvedValue(undefined),
  },
};
```

- [ ] **Step 7: Create empty `styles.css`**

```css
/* LLM Wiki plugin styles */
.llm-wiki-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
```

- [ ] **Step 8: Install dependencies**

```bash
npm install
```

Expected output: `added N packages` with no errors.

- [ ] **Step 9: Verify test infrastructure runs**

```bash
npx jest --listTests
```

Expected: no test files yet — should print empty list without error.

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "feat: plugin scaffold with build and test infrastructure

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types.ts`
- Create: `__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/types.test.ts
import type { ChatMessage, Session, LLMWikiSettings } from '../src/types';

describe('LLMWikiSettings', () => {
  it('should be a valid TypeScript interface (compile check)', () => {
    const s: LLMWikiSettings = {
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      baseUrl: '',
      rawSourcesPath: 'raw',
      wikiPath: 'wiki',
      sessionsPath: '.llm-wiki/sessions',
      autoIngest: false,
      autoIngestDebounceMs: 2000,
      systemPrompt: '',
      lintSchedule: 'off',
      contextWindowSize: 20,
      wikiSubdirs: ['sources', 'entities', 'concepts', 'analyses'],
    };
    expect(s.provider).toBe('openai');
  });
});

describe('ChatMessage', () => {
  it('should accept role user/assistant/system', () => {
    const m: ChatMessage = { role: 'user', content: 'hello', timestamp: '' };
    expect(m.role).toBe('user');
  });
});

describe('Session', () => {
  it('should have optional summary fields', () => {
    const s: Session = {
      id: '1',
      title: 'Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    expect(s.summary).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/types.test.ts
```

Expected: FAIL — `Cannot find module '../src/types'`

- [ ] **Step 3: Create `src/types.ts`**

```typescript
export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'custom';
export type LintSchedule = 'off' | 'daily' | 'weekly';

export interface LLMWikiSettings {
  provider: ProviderType;
  apiKey: string;
  model: string;
  baseUrl: string;
  rawSourcesPath: string;
  wikiPath: string;
  sessionsPath: string;
  autoIngest: boolean;
  autoIngestDebounceMs: number;
  systemPrompt: string;
  lintSchedule: LintSchedule;
  contextWindowSize: number;
  wikiSubdirs: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachedFiles?: string[];
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  summaryUpToIndex?: number;
  messages: ChatMessage[];
}

export interface RelationMap {
  [relationType: string]: string[]; // e.g. { related: ['[[Page A]]'], is_a: ['[[Concept B]]'] }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/types.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/types.ts __tests__/types.test.ts
git commit -m "feat: add shared TypeScript types

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Settings — Interface + Defaults

**Files:**
- Create: `src/settings/Settings.ts`
- Create: `__tests__/settings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/settings.test.ts
import { DEFAULT_SETTINGS } from '../src/settings/Settings';

describe('DEFAULT_SETTINGS', () => {
  it('has correct provider default', () => {
    expect(DEFAULT_SETTINGS.provider).toBe('openai');
  });
  it('has empty apiKey', () => {
    expect(DEFAULT_SETTINGS.apiKey).toBe('');
  });
  it('has correct rawSourcesPath', () => {
    expect(DEFAULT_SETTINGS.rawSourcesPath).toBe('raw');
  });
  it('has correct wikiPath', () => {
    expect(DEFAULT_SETTINGS.wikiPath).toBe('wiki');
  });
  it('has correct sessionsPath', () => {
    expect(DEFAULT_SETTINGS.sessionsPath).toBe('.llm-wiki/sessions');
  });
  it('autoIngest is false by default', () => {
    expect(DEFAULT_SETTINGS.autoIngest).toBe(false);
  });
  it('autoIngestDebounceMs is 2000', () => {
    expect(DEFAULT_SETTINGS.autoIngestDebounceMs).toBe(2000);
  });
  it('lintSchedule is off', () => {
    expect(DEFAULT_SETTINGS.lintSchedule).toBe('off');
  });
  it('contextWindowSize is 20', () => {
    expect(DEFAULT_SETTINGS.contextWindowSize).toBe(20);
  });
  it('wikiSubdirs has 4 default directories', () => {
    expect(DEFAULT_SETTINGS.wikiSubdirs).toEqual(
      ['sources', 'entities', 'concepts', 'analyses']
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/settings.test.ts
```

Expected: FAIL — `Cannot find module '../src/settings/Settings'`

- [ ] **Step 3: Create `src/settings/Settings.ts`**

```typescript
import type { LLMWikiSettings } from '../types';

export const DEFAULT_SETTINGS: LLMWikiSettings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o',
  baseUrl: '',
  rawSourcesPath: 'raw',
  wikiPath: 'wiki',
  sessionsPath: '.llm-wiki/sessions',
  autoIngest: false,
  autoIngestDebounceMs: 2000,
  systemPrompt: '',
  lintSchedule: 'off',
  contextWindowSize: 20,
  wikiSubdirs: ['sources', 'entities', 'concepts', 'analyses'],
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/settings.test.ts
```

Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/settings/Settings.ts __tests__/settings.test.ts
git commit -m "feat: add LLMWikiSettings defaults

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Settings Tab UI

**Files:**
- Create: `src/settings/SettingsTab.ts`
- Create: `__tests__/SettingsTab.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/SettingsTab.test.ts
import { LLMWikiSettingsTab } from '../src/settings/SettingsTab';
import { DEFAULT_SETTINGS } from '../src/settings/Settings';
import { Plugin } from 'obsidian';

describe('LLMWikiSettingsTab', () => {
  let mockPlugin: any;

  beforeEach(() => {
    mockPlugin = new Plugin();
    mockPlugin.settings = { ...DEFAULT_SETTINGS };
    mockPlugin.saveSettings = jest.fn().mockResolvedValue(undefined);
  });

  it('instantiates without error', () => {
    expect(() => new LLMWikiSettingsTab(mockPlugin.app, mockPlugin)).not.toThrow();
  });

  it('display() calls containerEl.empty()', () => {
    const tab = new LLMWikiSettingsTab(mockPlugin.app, mockPlugin);
    tab.display();
    expect(tab.containerEl.empty).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/SettingsTab.test.ts
```

Expected: FAIL — `Cannot find module '../src/settings/SettingsTab'`

- [ ] **Step 3: Create `src/settings/SettingsTab.ts`**

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';
import type { LLMWikiSettings } from '../types';
import { DEFAULT_SETTINGS } from './Settings';

type PluginWithSettings = {
  settings: LLMWikiSettings;
  saveSettings: () => Promise<void>;
};

export class LLMWikiSettingsTab extends PluginSettingTab {
  private plugin: PluginWithSettings;

  constructor(app: App, plugin: PluginWithSettings) {
    super(app, plugin as any);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'LLM Wiki Settings' });

    // --- Provider ---
    new Setting(containerEl)
      .setName('Provider')
      .setDesc('LLM service to use for all operations.')
      .addDropdown((drop) => {
        drop
          .addOption('openai', 'OpenAI')
          .addOption('anthropic', 'Anthropic')
          .addOption('ollama', 'Ollama (local)')
          .addOption('custom', 'Custom')
          .setValue(this.plugin.settings.provider)
          .onChange(async (value) => {
            this.plugin.settings.provider = value as LLMWikiSettings['provider'];
            await this.plugin.saveSettings();
          });
      });

    // --- API Key ---
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Required for OpenAI and Anthropic. Leave empty for Ollama.')
      .addText((text) => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    // --- Model ---
    new Setting(containerEl)
      .setName('Model')
      .setDesc('Model name, e.g. gpt-4o, claude-3-5-sonnet-20241022, llama3')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Base URL ---
    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('For Ollama or custom providers, e.g. http://localhost:11434')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Vault Folders' });

    // --- Raw Sources Path ---
    new Setting(containerEl)
      .setName('Raw Sources Folder')
      .setDesc(`Folder for raw input files. Default: ${DEFAULT_SETTINGS.rawSourcesPath}`)
      .addText((text) =>
        text
          .setValue(this.plugin.settings.rawSourcesPath)
          .onChange(async (value) => {
            this.plugin.settings.rawSourcesPath = value || DEFAULT_SETTINGS.rawSourcesPath;
            await this.plugin.saveSettings();
          })
      );

    // --- Wiki Path ---
    new Setting(containerEl)
      .setName('Wiki Folder')
      .setDesc(`Folder for generated wiki pages. Default: ${DEFAULT_SETTINGS.wikiPath}`)
      .addText((text) =>
        text
          .setValue(this.plugin.settings.wikiPath)
          .onChange(async (value) => {
            this.plugin.settings.wikiPath = value || DEFAULT_SETTINGS.wikiPath;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Ingest' });

    // --- Auto Ingest ---
    new Setting(containerEl)
      .setName('Auto-ingest')
      .setDesc('Automatically ingest new files added to the Raw Sources folder.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoIngest).onChange(async (value) => {
          this.plugin.settings.autoIngest = value;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl('h3', { text: 'Lint' });

    // --- Auto Lint Schedule ---
    new Setting(containerEl)
      .setName('Auto-lint Schedule')
      .setDesc('Automatically run wiki health checks.')
      .addDropdown((drop) =>
        drop
          .addOption('off', 'Off')
          .addOption('daily', 'Daily')
          .addOption('weekly', 'Weekly')
          .setValue(this.plugin.settings.lintSchedule)
          .onChange(async (value) => {
            this.plugin.settings.lintSchedule = value as LLMWikiSettings['lintSchedule'];
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Context' });

    // --- Context Window Size ---
    new Setting(containerEl)
      .setName('Context Window Size')
      .setDesc('Number of recent messages included in each LLM call (default 20).')
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.contextWindowSize))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.contextWindowSize = n;
              await this.plugin.saveSettings();
            }
          })
      );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/SettingsTab.test.ts
```

Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/settings/SettingsTab.ts __tests__/SettingsTab.test.ts
git commit -m "feat: add settings tab UI

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: LLMProvider Interface

**Files:**
- Create: `src/providers/LLMProvider.ts`
- Create: `__tests__/providers/ProviderFactory.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/providers/ProviderFactory.test.ts
import { ProviderFactory } from '../../src/providers/ProviderFactory';
import { DEFAULT_SETTINGS } from '../../src/settings/Settings';

describe('ProviderFactory.create', () => {
  it('returns OpenAIProvider for openai', () => {
    const p = ProviderFactory.create({ ...DEFAULT_SETTINGS, provider: 'openai' });
    expect(p.constructor.name).toBe('OpenAIProvider');
  });

  it('returns AnthropicProvider for anthropic', () => {
    const p = ProviderFactory.create({ ...DEFAULT_SETTINGS, provider: 'anthropic' });
    expect(p.constructor.name).toBe('AnthropicProvider');
  });

  it('returns OllamaProvider for ollama', () => {
    const p = ProviderFactory.create({ ...DEFAULT_SETTINGS, provider: 'ollama' });
    expect(p.constructor.name).toBe('OllamaProvider');
  });

  it('returns OllamaProvider for custom (baseUrl-based)', () => {
    const p = ProviderFactory.create({ ...DEFAULT_SETTINGS, provider: 'custom', baseUrl: 'http://localhost:1234' });
    expect(p.constructor.name).toBe('OllamaProvider');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/providers/ProviderFactory.test.ts
```

Expected: FAIL — `Cannot find module '../../src/providers/ProviderFactory'`

- [ ] **Step 3: Create `src/providers/LLMProvider.ts`**

```typescript
import type { ChatMessage } from '../types';

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
  supportsVision(): boolean;
}
```

- [ ] **Step 4: Create `src/providers/ProviderFactory.ts`**

```typescript
import type { LLMWikiSettings } from '../types';
import type { LLMProvider } from './LLMProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OllamaProvider } from './OllamaProvider';

export class ProviderFactory {
  static create(settings: LLMWikiSettings): LLMProvider {
    switch (settings.provider) {
      case 'openai':
        return new OpenAIProvider(settings.apiKey, settings.model);
      case 'anthropic':
        return new AnthropicProvider(settings.apiKey, settings.model);
      case 'ollama':
      case 'custom':
        return new OllamaProvider(
          settings.baseUrl || 'http://localhost:11434',
          settings.model,
          settings.apiKey
        );
    }
  }
}
```

- [ ] **Step 5: Create stub files so ProviderFactory compiles**

Create `src/providers/OpenAIProvider.ts` (full implementation in Task 6):

```typescript
import type { ChatMessage } from '../types';
import type { ChatOptions, LLMProvider } from './LLMProvider';

export class OpenAIProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string) {}

  async *chat(_messages: ChatMessage[], _opts?: ChatOptions): AsyncIterable<string> {
    yield '';
  }

  supportsVision(): boolean {
    return this.model.includes('gpt-4') || this.model.includes('vision');
  }
}
```

Create `src/providers/AnthropicProvider.ts` (stub):

```typescript
import type { ChatMessage } from '../types';
import type { ChatOptions, LLMProvider } from './LLMProvider';

export class AnthropicProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string) {}

  async *chat(_messages: ChatMessage[], _opts?: ChatOptions): AsyncIterable<string> {
    yield '';
  }

  supportsVision(): boolean {
    return this.model.includes('claude-3');
  }
}
```

Create `src/providers/OllamaProvider.ts` (stub):

```typescript
import type { ChatMessage } from '../types';
import type { ChatOptions, LLMProvider } from './LLMProvider';

export class OllamaProvider implements LLMProvider {
  constructor(
    private baseUrl: string,
    private model: string,
    private apiKey: string = ''
  ) {}

  async *chat(_messages: ChatMessage[], _opts?: ChatOptions): AsyncIterable<string> {
    yield '';
  }

  supportsVision(): boolean {
    return false;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx jest __tests__/providers/ProviderFactory.test.ts
```

Expected: PASS, 4 tests

- [ ] **Step 7: Commit**

```bash
git add src/providers/ __tests__/providers/ProviderFactory.test.ts
git commit -m "feat: add LLMProvider interface and ProviderFactory

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: OpenAIProvider — Full SSE Streaming Implementation

**Files:**
- Modify: `src/providers/OpenAIProvider.ts`
- Create: `__tests__/providers/OpenAIProvider.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/providers/OpenAIProvider.test.ts
import { OpenAIProvider } from '../../src/providers/OpenAIProvider';

// Helper: build a fake SSE stream from an array of delta strings
function makeSseStream(deltas: string[]): Response {
  const lines = deltas.flatMap((d) => [
    `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}`,
    '',
  ]);
  lines.push('data: [DONE]', '');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      for (const line of lines) ctrl.enqueue(encoder.encode(line + '\n'));
      ctrl.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('OpenAIProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('streams tokens from SSE response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeSseStream(['Hello', ' world']));
    const provider = new OpenAIProvider('sk-test', 'gpt-4o');
    const tokens: string[] = [];
    for await (const t of provider.chat([{ role: 'user', content: 'hi', timestamp: '' }])) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('throws when apiKey is empty', async () => {
    const provider = new OpenAIProvider('', 'gpt-4o');
    await expect(async () => {
      for await (const _ of provider.chat([])) { /* */ }
    }).rejects.toThrow('OpenAI API key is not configured');
  });

  it('throws on non-200 HTTP response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 })
    );
    const provider = new OpenAIProvider('sk-bad', 'gpt-4o');
    await expect(async () => {
      for await (const _ of provider.chat([{ role: 'user', content: 'hi', timestamp: '' }])) { /* */ }
    }).rejects.toThrow('OpenAI API error: 401');
  });

  it('supportsVision returns true for gpt-4o', () => {
    expect(new OpenAIProvider('k', 'gpt-4o').supportsVision()).toBe(true);
  });

  it('supportsVision returns false for gpt-3.5', () => {
    expect(new OpenAIProvider('k', 'gpt-3.5-turbo').supportsVision()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/providers/OpenAIProvider.test.ts
```

Expected: FAIL on streaming and error tests

- [ ] **Step 3: Implement `src/providers/OpenAIProvider.ts`**

```typescript
import type { ChatMessage } from '../types';
import type { ChatOptions, LLMProvider } from './LLMProvider';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string) {}

  async *chat(messages: ChatMessage[], opts: ChatOptions = {}): AsyncIterable<string> {
    if (!this.apiKey) throw new Error('OpenAI API key is not configured');

    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens,
      }),
      signal: opts.signal,
    });

    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore malformed lines
        }
      }
    }
  }

  supportsVision(): boolean {
    return this.model.includes('gpt-4') || this.model.includes('vision');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/providers/OpenAIProvider.test.ts
```

Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/providers/OpenAIProvider.ts __tests__/providers/OpenAIProvider.test.ts
git commit -m "feat: implement OpenAIProvider with SSE streaming

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: AnthropicProvider — Full SSE Streaming Implementation

**Files:**
- Modify: `src/providers/AnthropicProvider.ts`
- Create: `__tests__/providers/AnthropicProvider.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/providers/AnthropicProvider.test.ts
import { AnthropicProvider } from '../../src/providers/AnthropicProvider';

function makeAnthropicStream(deltas: string[]): Response {
  const events = deltas.map((d) =>
    `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: 'text_delta', text: d } })}\n\n`
  );
  events.push('event: message_stop\ndata: {}\n\n');
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      for (const e of events) ctrl.enqueue(encoder.encode(e));
      ctrl.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('AnthropicProvider', () => {
  beforeEach(() => { global.fetch = jest.fn(); });

  it('streams tokens from SSE response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeAnthropicStream(['Hi', ' there']));
    const provider = new AnthropicProvider('key', 'claude-3-5-sonnet-20241022');
    const tokens: string[] = [];
    for await (const t of provider.chat([{ role: 'user', content: 'hello', timestamp: '' }])) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['Hi', ' there']);
  });

  it('throws when apiKey is empty', async () => {
    const provider = new AnthropicProvider('', 'claude-3-5-sonnet-20241022');
    await expect(async () => {
      for await (const _ of provider.chat([])) { /* */ }
    }).rejects.toThrow('Anthropic API key is not configured');
  });

  it('throws on non-200 HTTP response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    const provider = new AnthropicProvider('key', 'claude-3-5-sonnet-20241022');
    await expect(async () => {
      for await (const _ of provider.chat([{ role: 'user', content: 'hi', timestamp: '' }])) { /* */ }
    }).rejects.toThrow('Anthropic API error: 403');
  });

  it('supportsVision returns true for claude-3', () => {
    expect(new AnthropicProvider('k', 'claude-3-5-sonnet-20241022').supportsVision()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/providers/AnthropicProvider.test.ts
```

Expected: FAIL on streaming tests

- [ ] **Step 3: Implement `src/providers/AnthropicProvider.ts`**

```typescript
import type { ChatMessage } from '../types';
import type { ChatOptions, LLMProvider } from './LLMProvider';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string) {}

  async *chat(messages: ChatMessage[], opts: ChatOptions = {}): AsyncIterable<string> {
    if (!this.apiKey) throw new Error('Anthropic API key is not configured');

    // Anthropic requires system messages to be separate
    const systemMsg = messages.find((m) => m.role === 'system');
    const userMsgs = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        messages: userMsgs,
        system: systemMsg?.content,
        stream: true,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: opts.signal,
    });

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split('\n\n');
      buf = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        const data = dataLine.slice(5).trim();
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            yield parsed.delta.text;
          }
        } catch {
          // ignore malformed events
        }
      }
    }
  }

  supportsVision(): boolean {
    return this.model.includes('claude-3');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/providers/AnthropicProvider.test.ts
```

Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/providers/AnthropicProvider.ts __tests__/providers/AnthropicProvider.test.ts
git commit -m "feat: implement AnthropicProvider with SSE streaming

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: OllamaProvider — Full Streaming Implementation

**Files:**
- Modify: `src/providers/OllamaProvider.ts`
- Create: `__tests__/providers/OllamaProvider.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/providers/OllamaProvider.test.ts
import { OllamaProvider } from '../../src/providers/OllamaProvider';

function makeOllamaStream(tokens: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      for (let i = 0; i < tokens.length; i++) {
        const done = i === tokens.length - 1;
        ctrl.enqueue(encoder.encode(
          JSON.stringify({ message: { content: tokens[i] }, done }) + '\n'
        ));
      }
      ctrl.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('OllamaProvider', () => {
  beforeEach(() => { global.fetch = jest.fn(); });

  it('streams tokens from ndjson response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeOllamaStream(['Hello', ' Ollama']));
    const provider = new OllamaProvider('http://localhost:11434', 'llama3');
    const tokens: string[] = [];
    for await (const t of provider.chat([{ role: 'user', content: 'hi', timestamp: '' }])) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['Hello', ' Ollama']);
  });

  it('throws on connection failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('fetch failed'));
    const provider = new OllamaProvider('http://localhost:11434', 'llama3');
    await expect(async () => {
      for await (const _ of provider.chat([{ role: 'user', content: 'hi', timestamp: '' }])) { /* */ }
    }).rejects.toThrow('Ollama connection failed');
  });

  it('supportsVision returns false', () => {
    expect(new OllamaProvider('http://localhost:11434', 'llama3').supportsVision()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/providers/OllamaProvider.test.ts
```

Expected: FAIL on streaming tests

- [ ] **Step 3: Implement `src/providers/OllamaProvider.ts`**

```typescript
import type { ChatMessage } from '../types';
import type { ChatOptions, LLMProvider } from './LLMProvider';

export class OllamaProvider implements LLMProvider {
  constructor(
    private baseUrl: string,
    private model: string,
    private apiKey: string = ''
  ) {}

  async *chat(messages: ChatMessage[], opts: ChatOptions = {}): AsyncIterable<string> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/chat`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          options: {
            temperature: opts.temperature ?? 0.7,
            num_predict: opts.maxTokens,
          },
        }),
        signal: opts.signal,
      });
    } catch (e) {
      throw new Error(`Ollama connection failed: ${(e as Error).message}`);
    }

    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const content = parsed.message?.content;
          if (content) yield content;
          if (parsed.done) return;
        } catch {
          // ignore malformed ndjson
        }
      }
    }
  }

  supportsVision(): boolean {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/providers/OllamaProvider.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/providers/OllamaProvider.ts __tests__/providers/OllamaProvider.test.ts
git commit -m "feat: implement OllamaProvider with ndjson streaming

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Wiki Schema System

**Files:**
- Create: `src/schema/Schema.ts`
- Create: `src/schema/SchemaLoader.ts`
- Create: `src/schema/WikiPageTemplate.ts`
- Create: `__tests__/schema/SchemaLoader.test.ts`
- Create: `__tests__/schema/WikiPageTemplate.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/schema/SchemaLoader.test.ts
import { SchemaLoader } from '../../src/schema/SchemaLoader';
import { DEFAULT_SCHEMA } from '../../src/schema/Schema';
import { DEFAULT_SETTINGS } from '../../src/settings/Settings';
import { mockVault } from '../../__mocks__/obsidian';

describe('SchemaLoader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns DEFAULT_SCHEMA when no WIKI_SCHEMA.md and no settings override', async () => {
    mockVault.adapter.exists.mockResolvedValueOnce(false);
    const schema = await SchemaLoader.load(mockVault as any, DEFAULT_SETTINGS);
    expect(schema.relationTypes).toEqual(DEFAULT_SCHEMA.relationTypes);
  });

  it('parses WIKI_SCHEMA.md when it exists', async () => {
    mockVault.adapter.exists.mockResolvedValueOnce(true);
    mockVault.adapter.read.mockResolvedValueOnce(
      '# Wiki Schema\n\n## Relation Types\n- appears_in_chapter\n- contradicts\n'
    );
    const schema = await SchemaLoader.load(mockVault as any, DEFAULT_SETTINGS);
    expect(schema.relationTypes).toContain('appears_in_chapter');
    expect(schema.relationTypes).toContain('contradicts');
  });

  it('settings systemPrompt overrides WIKI_SCHEMA.md systemPrompt', async () => {
    mockVault.adapter.exists.mockResolvedValueOnce(true);
    mockVault.adapter.read.mockResolvedValueOnce('# Wiki Schema\n\n## System Prompt\nFrom file\n');
    const settingsWithPrompt = { ...DEFAULT_SETTINGS, systemPrompt: 'From settings' };
    const schema = await SchemaLoader.load(mockVault as any, settingsWithPrompt);
    expect(schema.systemPrompt).toBe('From settings');
  });

  it('falls back to DEFAULT_SCHEMA systemPrompt when settings prompt is empty', async () => {
    mockVault.adapter.exists.mockResolvedValueOnce(false);
    const schema = await SchemaLoader.load(mockVault as any, { ...DEFAULT_SETTINGS, systemPrompt: '' });
    expect(schema.systemPrompt).toBe(DEFAULT_SCHEMA.systemPrompt);
  });
});
```

```typescript
// __tests__/schema/WikiPageTemplate.test.ts
import { WikiPageTemplate } from '../../src/schema/WikiPageTemplate';

describe('WikiPageTemplate.render', () => {
  it('produces YAML frontmatter with wiki_type', () => {
    const result = WikiPageTemplate.render('My Page', 'Content here', 'concept', {});
    expect(result).toContain('wiki_type: concept');
  });

  it('produces related: list from relation map', () => {
    const result = WikiPageTemplate.render('My Page', 'Body', 'entity', {
      related: ['[[Page A]]', '[[Page B]]'],
    });
    expect(result).toContain('- "[[Page A]]"');
    expect(result).toContain('- "[[Page B]]"');
  });

  it('includes updated date', () => {
    const result = WikiPageTemplate.render('My Page', 'Body', 'concept', {});
    expect(result).toMatch(/updated: \d{4}-\d{2}-\d{2}/);
  });

  it('appends body content after frontmatter', () => {
    const result = WikiPageTemplate.render('Title', 'My body text', 'summary', {});
    expect(result).toContain('My body text');
    // frontmatter must come first
    expect(result.indexOf('---')).toBeLessThan(result.indexOf('My body text'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/schema/
```

Expected: FAIL — modules not found

- [ ] **Step 3: Create `src/schema/Schema.ts`**

```typescript
export interface WikiSchema {
  systemPrompt: string;
  pageTypes: string[];
  relationTypes: string[];
  defaultPageType: string;
}

export const DEFAULT_RELATION_TYPES = [
  'related',
  'is_a',
  'part_of',
  'mentions',
  'supports',
  'contradicts',
  'derived_from',
];

export const DEFAULT_SCHEMA: WikiSchema = {
  pageTypes: ['sources', 'entities', 'concepts', 'analyses'],
  defaultPageType: 'concepts',
  relationTypes: DEFAULT_RELATION_TYPES,
  systemPrompt: `You are an expert knowledge-base maintainer. Your job is to help the user build and maintain a structured wiki inside their Obsidian vault.

## Wiki Structure
- wiki/sources/   — summaries of ingested raw documents
- wiki/entities/  — pages about specific people, organisations, products
- wiki/concepts/  — definitions, theories, techniques
- wiki/analyses/  — comparisons, Q&A, synthesis saved by the user

## Relation Types
${DEFAULT_RELATION_TYPES.map((r) => `- ${r}`).join('\n')}

## Rules
- Every wiki page MUST have YAML frontmatter with wiki_type, related, updated fields.
- Always use [[wikilinks]] when referencing other wiki pages.
- When ingesting a source, update index.md and log.md.
- When writing relations, merge with existing frontmatter — never delete existing links.
`,
};
```

- [ ] **Step 4: Create `src/schema/SchemaLoader.ts`**

```typescript
import type { Vault } from 'obsidian';
import type { LLMWikiSettings } from '../types';
import { DEFAULT_SCHEMA, WikiSchema } from './Schema';

const SCHEMA_FILE = 'WIKI_SCHEMA.md';

export class SchemaLoader {
  static async load(vault: Vault, settings: LLMWikiSettings): Promise<WikiSchema> {
    let schema: WikiSchema = { ...DEFAULT_SCHEMA, relationTypes: [...DEFAULT_SCHEMA.relationTypes] };

    const exists = await (vault.adapter as any).exists(SCHEMA_FILE);
    if (exists) {
      try {
        const content = await (vault.adapter as any).read(SCHEMA_FILE);
        schema = SchemaLoader.parseSchemaFile(content, schema);
      } catch {
        // fall back to default — SchemaLoader errors are non-fatal
        console.warn('[LLM Wiki] Failed to parse WIKI_SCHEMA.md, using default schema');
      }
    }

    // Settings override takes highest priority
    if (settings.systemPrompt) {
      schema.systemPrompt = settings.systemPrompt;
    }

    return schema;
  }

  private static parseSchemaFile(content: string, base: WikiSchema): WikiSchema {
    const result = { ...base };

    // Extract system prompt (content under "## System Prompt" section)
    const promptMatch = content.match(/##\s+System Prompt\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (promptMatch) result.systemPrompt = promptMatch[1].trim();

    // Extract relation types (list items under "## Relation Types")
    const relMatch = content.match(/##\s+Relation Types\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (relMatch) {
      const types = relMatch[1]
        .split('\n')
        .map((l) => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
      if (types.length > 0) result.relationTypes = types;
    }

    return result;
  }
}
```

- [ ] **Step 5: Create `src/schema/WikiPageTemplate.ts`**

```typescript
import type { RelationMap } from '../types';

export class WikiPageTemplate {
  static render(
    title: string,
    content: string,
    type: string,
    relations: RelationMap
  ): string {
    const today = new Date().toISOString().split('T')[0];

    // Build YAML frontmatter
    const relationEntries = Object.entries(relations)
      .map(([key, links]) => {
        if (links.length === 0) return `${key}: []`;
        return `${key}:\n${links.map((l) => `  - "${l}"`).join('\n')}`;
      })
      .join('\n');

    const frontmatter = [
      '---',
      `wiki_type: ${type}`,
      `updated: ${today}`,
      `tags: [wiki, ${type}]`,
      relationEntries || 'related: []',
      '---',
    ].join('\n');

    return `${frontmatter}\n\n# ${title}\n\n${content}`;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest __tests__/schema/
```

Expected: PASS, 8 tests

- [ ] **Step 7: Commit**

```bash
git add src/schema/ __tests__/schema/
git commit -m "feat: add wiki schema system (SchemaLoader + WikiPageTemplate)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Plugin Entry Point (`main.ts`) + Full Build Verification

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: Create `src/main.ts`**

```typescript
import { Plugin } from 'obsidian';
import type { LLMWikiSettings } from './types';
import { DEFAULT_SETTINGS } from './settings/Settings';
import { LLMWikiSettingsTab } from './settings/SettingsTab';

export default class LLMWikiPlugin extends Plugin {
  settings!: LLMWikiSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new LLMWikiSettingsTab(this.app, this));

    this.addRibbonIcon('brain', 'LLM Wiki', () => {
      // Chat view will be activated here in Plan 2
    });

    this.addCommand({
      id: 'open-chat',
      name: 'Open Chat',
      callback: () => {
        // Chat view activation in Plan 2
      },
    });
  }

  async onunload(): Promise<void> {
    // Cleanup registered in Plan 2+
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Step 2: Build the plugin**

```bash
npm run build
```

Expected: `main.js` produced in the project root. No TypeScript errors.

- [ ] **Step 3: Run all tests**

```bash
npx jest --coverage
```

Expected: All tests PASS. Coverage ≥ 80% for lines.

- [ ] **Step 4: Verify all provider + schema tests together**

```bash
npx jest --verbose
```

Expected output includes:
```
PASS __tests__/types.test.ts
PASS __tests__/settings.test.ts
PASS __tests__/SettingsTab.test.ts
PASS __tests__/providers/ProviderFactory.test.ts
PASS __tests__/providers/OpenAIProvider.test.ts
PASS __tests__/providers/AnthropicProvider.test.ts
PASS __tests__/providers/OllamaProvider.test.ts
PASS __tests__/schema/SchemaLoader.test.ts
PASS __tests__/schema/WikiPageTemplate.test.ts
```

- [ ] **Step 5: Final commit**

```bash
git add src/main.ts
git commit -m "feat: wire plugin entry point — Foundation complete

All providers, settings, and schema system functional.
Ready for Plan 2: Session & Chat UI.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Spec Coverage Check

| Spec Requirement | Task Covered |
|---|---|
| tasks.md 1.1 — manifest.json scaffold | Task 1 |
| tasks.md 1.2 — core deps installed | Task 1 |
| tasks.md 1.3 — file-parsing libs | Not in Plan 1 → Plan 3 |
| tasks.md 1.4 — folder structure | Task 1 (src/ dirs created implicitly) |
| tasks.md 2.1 — LLMWikiSettings interface | Task 2 |
| tasks.md 2.2 — DEFAULT_SETTINGS | Task 3 |
| tasks.md 2.3–2.8 — SettingsTab fields | Task 4 |
| tasks.md 2.9 — loadData/saveData | Task 10 |
| tasks.md 3.1 — LLMProvider interface | Task 5 |
| tasks.md 3.2 — OpenAIProvider SSE | Task 6 |
| tasks.md 3.3 — AnthropicProvider SSE | Task 7 |
| tasks.md 3.4 — OllamaProvider streaming | Task 8 |
| tasks.md 3.5 — ProviderFactory | Task 5 |
| tasks.md 3.6 — error handling | Tasks 6, 7, 8 |
| tasks.md 4.1 — default schema constant | Task 9 |
| tasks.md 4.2 — SchemaLoader | Task 9 |
| tasks.md 4.3 — WikiPageTemplate | Task 9 |
