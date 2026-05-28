# Obsidian LLM Wiki — Plan 3: Ingest Pipeline

## Implementation Status Update (2026-05-26)

- Phase 3 ingest pipeline is implemented and integrated with slash commands and context menu ingest.
- `/ingest-all` failure handling is implemented with retry via `/ingest-all retry`.
- Ingest now creates/updates source + derived entity/concept pages and writes structured log details.
- Derived entity/concept generation now uses a structured JSON-only prompt: the model returns `entities` and `concepts` separately, and concept pages are written as reusable technical knowledge nodes rather than one-line summaries.
- Generated concept content now prefers structured sections such as Purpose, Usage, Behavior, Requirements, Notes, Example, and Related.
- Ingest now adds an output language setting (`outputLanguage`), allowing users to choose between Traditional Chinese and English, and injects language instructions into the source + derived prompt to reduce language mixing.
- Broken wikilink cleanup is implemented both during ingest (touched pages) and via `/clean-links` for whole-wiki cleanup.
- Auto-ingest remains create-event based with debounce, and only triggers for files under `rawSourcesPath`.
- Generated wiki frontmatter tags are no longer hard-coded; tags are LLM-driven with enforced 3 to 10 range.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full ingest pipeline — file parsers (md, pdf, docx, xlsx, pptx, image), `IngestService` that calls the LLM to write wiki pages, content-hash deduplication, File Explorer context menu, `/ingest`/`/reingest` slash commands, auto-watch for new files, and index/log updates.

**Architecture:** `FileParser` dispatches to format-specific parsers (all dynamic imports). `IngestService` orchestrates: parse → source summary prompt → derived entity/concept generation prompt → write wiki page(s) → update `wiki/index.md` and `wiki/log.md`. `WikiManager` owns all vault write operations so tests can mock a single boundary. `AutoWatcher` subscribes to `vault.on('create')` with 2-second debounce.

**Prompt behavior notes:** The derived-page prompt is intentionally stricter than the source-summary prompt. It demands JSON-only output, separates entities from concepts, and asks the model to emit durable technical wiki pages with reusable retrieval tags and structured markdown sections. This prevents concept pages from collapsing into shallow summaries and matches the current `IngestService` implementation. Prompt assembly now also includes language instruction from settings (`outputLanguage`: `zh-TW` or `en`) so source/entity/concept pages are generated in the selected language.

**Tech Stack:** TypeScript 5, `pdfjs-dist`, `mammoth`, `xlsx` (SheetJS), `pptx-to-text`, Obsidian Plugin API, Jest + ts-jest

**Prerequisite:** Plans 1 and 2 complete (all tests pass, `main.js` builds).

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/features/ingest/FileParser.ts` | Format dispatcher + `ParsedContent` type |
| `src/features/ingest/parsers/MdParser.ts` | Return raw markdown text |
| `src/features/ingest/parsers/PdfParser.ts` | `pdfjs-dist` dynamic import, extract text pages |
| `src/features/ingest/parsers/DocxParser.ts` | `mammoth` dynamic import, extract raw text |
| `src/features/ingest/parsers/XlsxParser.ts` | `xlsx` dynamic import, sheets → TSV |
| `src/features/ingest/parsers/PptxParser.ts` | `pptx-to-text` dynamic import, slides → text |
| `src/features/ingest/parsers/ImageParser.ts` | base64-encode for vision models |
| `src/features/ingest/ContentHasher.ts` | SHA-256 hash of file content string |
| `src/features/ingest/WikiManager.ts` | Create/update wiki pages; update index.md + log.md |
| `src/features/ingest/IngestService.ts` | Orchestrate: hash check → parse → LLM → WikiManager |
| `src/features/ingest/AutoWatcher.ts` | `vault.on('create')` with 2s debounce |
| `__tests__/features/ingest/FileParser.test.ts` | Extension routing tests |
| `__tests__/features/ingest/ContentHasher.test.ts` | Hash stability + change detection |
| `__tests__/features/ingest/WikiManager.test.ts` | Page write + index/log update |
| `__tests__/features/ingest/IngestService.test.ts` | Full pipeline (mocked parser + provider + WikiManager) |

---

### Task 1: FileParser (format dispatcher)

**Files:**
- Create: `src/features/ingest/FileParser.ts`
- Create: `src/features/ingest/parsers/MdParser.ts`
- Create: `__tests__/features/ingest/FileParser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/ingest/FileParser.test.ts
import { FileParser } from '../../../src/features/ingest/FileParser';
import type { TFile } from 'obsidian';

function makeFile(ext: string, path: string): TFile {
  return { extension: ext, path, name: `file.${ext}`, stat: { size: 100 } } as unknown as TFile;
}

describe('FileParser', () => {
  it('accepts .md extension', () => {
    expect(FileParser.supports(makeFile('md', 'raw/note.md'))).toBe(true);
  });

  it('accepts .pdf extension', () => {
    expect(FileParser.supports(makeFile('pdf', 'raw/doc.pdf'))).toBe(true);
  });

  it('accepts .docx extension', () => {
    expect(FileParser.supports(makeFile('docx', 'raw/doc.docx'))).toBe(true);
  });

  it('accepts .xlsx extension', () => {
    expect(FileParser.supports(makeFile('xlsx', 'raw/sheet.xlsx'))).toBe(true);
  });

  it('accepts .pptx extension', () => {
    expect(FileParser.supports(makeFile('pptx', 'raw/slide.pptx'))).toBe(true);
  });

  it('accepts image extensions', () => {
    expect(FileParser.supports(makeFile('png', 'raw/img.png'))).toBe(true);
    expect(FileParser.supports(makeFile('jpg', 'raw/img.jpg'))).toBe(true);
    expect(FileParser.supports(makeFile('jpeg', 'raw/img.jpeg'))).toBe(true);
    expect(FileParser.supports(makeFile('webp', 'raw/img.webp'))).toBe(true);
  });

  it('rejects unsupported extension', () => {
    expect(FileParser.supports(makeFile('zip', 'raw/archive.zip'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/ingest/FileParser.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/ingest/FileParser'`

- [ ] **Step 3: Create `src/features/ingest/parsers/MdParser.ts`**

```typescript
export class MdParser {
  static async parse(content: string): Promise<string> {
    return content;
  }
}
```

- [ ] **Step 4: Create `src/features/ingest/FileParser.ts`**

```typescript
import type { TFile, Vault } from 'obsidian';

export type ParsedContent =
  | { type: 'text'; text: string }
  | { type: 'image'; base64: string; mimeType: string };

const TEXT_EXTENSIONS = new Set(['md', 'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

export class FileParser {
  static supports(file: TFile): boolean {
    return TEXT_EXTENSIONS.has(file.extension.toLowerCase()) ||
           IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
  }

  static async parse(file: TFile, vault: Vault): Promise<ParsedContent> {
    const ext = file.extension.toLowerCase();

    if (IMAGE_EXTENSIONS.has(ext)) {
      const { ImageParser } = await import('./parsers/ImageParser');
      return ImageParser.parse(file, vault);
    }

    if (ext === 'md' || ext === 'txt') {
      const text = await vault.cachedRead(file);
      const { MdParser } = await import('./parsers/MdParser');
      return { type: 'text', text: await MdParser.parse(text) };
    }

    if (ext === 'pdf') {
      const arrayBuffer = await vault.readBinary(file);
      const { PdfParser } = await import('./parsers/PdfParser');
      return { type: 'text', text: await PdfParser.parse(arrayBuffer) };
    }

    if (ext === 'docx' || ext === 'doc') {
      const arrayBuffer = await vault.readBinary(file);
      const { DocxParser } = await import('./parsers/DocxParser');
      return { type: 'text', text: await DocxParser.parse(arrayBuffer) };
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const arrayBuffer = await vault.readBinary(file);
      const { XlsxParser } = await import('./parsers/XlsxParser');
      return { type: 'text', text: await XlsxParser.parse(arrayBuffer) };
    }

    if (ext === 'pptx' || ext === 'ppt') {
      const arrayBuffer = await vault.readBinary(file);
      const { PptxParser } = await import('./parsers/PptxParser');
      return { type: 'text', text: await PptxParser.parse(arrayBuffer) };
    }

    throw new Error(`Unsupported file type: .${ext}`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest __tests__/features/ingest/FileParser.test.ts
```

Expected: PASS, 9 tests

- [ ] **Step 6: Commit**

```bash
git add src/features/ingest/FileParser.ts src/features/ingest/parsers/MdParser.ts __tests__/features/ingest/FileParser.test.ts
git commit -m "feat: add FileParser format dispatcher with extension routing

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Format-specific parsers (PDF, DOCX, XLSX, PPTX, Image)

**Files:**
- Create: `src/features/ingest/parsers/PdfParser.ts`
- Create: `src/features/ingest/parsers/DocxParser.ts`
- Create: `src/features/ingest/parsers/XlsxParser.ts`
- Create: `src/features/ingest/parsers/PptxParser.ts`
- Create: `src/features/ingest/parsers/ImageParser.ts`

> These parsers wrap third-party libraries via dynamic import. Unit tests mock the libraries. Integration is verified in Task 5 (IngestService integration test).

- [ ] **Step 1: Create `src/features/ingest/parsers/PdfParser.ts`**

```typescript
export class PdfParser {
  static async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    // Dynamic import keeps pdfjs-dist out of the main bundle until needed
    const pdfjsLib = await import('pdfjs-dist');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ');
      pages.push(pageText);
    }
    return pages.join('\n\n');
  }
}
```

- [ ] **Step 2: Create `src/features/ingest/parsers/DocxParser.ts`**

```typescript
export class DocxParser {
  static async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
}
```

- [ ] **Step 3: Create `src/features/ingest/parsers/XlsxParser.ts`**

```typescript
export class XlsxParser {
  static async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const sections: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const tsv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
      sections.push(`## Sheet: ${sheetName}\n${tsv}`);
    }
    return sections.join('\n\n');
  }
}
```

- [ ] **Step 4: Create `src/features/ingest/parsers/PptxParser.ts`**

```typescript
export class PptxParser {
  static async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      const { pptxToText } = await import('pptx-to-text');
      return await pptxToText(arrayBuffer);
    } catch {
      // Fallback: parse PPTX as ZIP and extract raw XML text
      const JSZip = await import('jszip');
      const zip = await JSZip.loadAsync(arrayBuffer);
      const slideFiles = Object.keys(zip.files).filter((f) => f.match(/ppt\/slides\/slide\d+\.xml/));
      slideFiles.sort();
      const texts: string[] = [];
      for (const slideFile of slideFiles) {
        const xml = await zip.files[slideFile].async('text');
        // Strip XML tags, keep text content
        const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        texts.push(text);
      }
      return texts.join('\n\n');
    }
  }
}
```

- [ ] **Step 5: Create `src/features/ingest/parsers/ImageParser.ts`**

```typescript
import type { TFile, Vault } from 'obsidian';
import type { ParsedContent } from '../FileParser';

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export class ImageParser {
  static async parse(file: TFile, vault: Vault): Promise<ParsedContent> {
    const arrayBuffer = await vault.readBinary(file);
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);
    const mimeType = MIME_MAP[file.extension.toLowerCase()] ?? 'image/png';
    return { type: 'image', base64, mimeType };
  }
}
```

- [ ] **Step 6: Build to verify parsers compile**

```bash
npm run build
```

Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/features/ingest/parsers/
git commit -m "feat: add format parsers (PDF/DOCX/XLSX/PPTX/image)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: ContentHasher

**Files:**
- Create: `src/features/ingest/ContentHasher.ts`
- Create: `__tests__/features/ingest/ContentHasher.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/ingest/ContentHasher.test.ts
import { ContentHasher } from '../../../src/features/ingest/ContentHasher';

describe('ContentHasher', () => {
  it('returns a non-empty hex string', async () => {
    const hash = await ContentHasher.hash('hello world');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('same content produces same hash', async () => {
    const h1 = await ContentHasher.hash('same content');
    const h2 = await ContentHasher.hash('same content');
    expect(h1).toBe(h2);
  });

  it('different content produces different hash', async () => {
    const h1 = await ContentHasher.hash('content A');
    const h2 = await ContentHasher.hash('content B');
    expect(h1).not.toBe(h2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/ingest/ContentHasher.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Create `src/features/ingest/ContentHasher.ts`**

```typescript
export class ContentHasher {
  static async hash(content: string): Promise<string> {
    const encoded = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/features/ingest/ContentHasher.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/ingest/ContentHasher.ts __tests__/features/ingest/ContentHasher.test.ts
git commit -m "feat: add ContentHasher for ingest deduplication

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: WikiManager

**Files:**
- Create: `src/features/ingest/WikiManager.ts`
- Create: `__tests__/features/ingest/WikiManager.test.ts`

The `WikiManager` owns all vault write operations for wiki pages. This is the single mock boundary for persistence tests.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/ingest/WikiManager.test.ts
import { WikiManager } from '../../../src/features/ingest/WikiManager';
import { mockVault } from '../../../__mocks__/obsidian';

describe('WikiManager', () => {
  let wm: WikiManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVault.adapter.exists.mockResolvedValue(false);
    mockVault.adapter.read.mockResolvedValue('');
    wm = new WikiManager(mockVault as any, 'wiki');
  });

  it('writePage creates file when it does not exist', async () => {
    mockVault.getAbstractFileByPath.mockReturnValue(null);
    await wm.writePage('wiki/concepts/Machine Learning.md', '---\nwiki_type: concept\n---\n# ML');
    expect(mockVault.create).toHaveBeenCalledWith(
      'wiki/concepts/Machine Learning.md',
      '---\nwiki_type: concept\n---\n# ML'
    );
  });

  it('writePage modifies file when it already exists', async () => {
    const mockFile = { path: 'wiki/concepts/ML.md' };
    mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
    await wm.writePage('wiki/concepts/ML.md', 'new content');
    expect(mockVault.modify).toHaveBeenCalledWith(mockFile, 'new content');
  });

  it('appendToLog appends timestamped entry', async () => {
    mockVault.getAbstractFileByPath.mockReturnValue(null);
    await wm.appendToLog('Ingested: raw/article.pdf');
    expect(mockVault.create).toHaveBeenCalledWith(
      'wiki/log.md',
      expect.stringContaining('Ingested: raw/article.pdf')
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/ingest/WikiManager.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/ingest/WikiManager'`

- [ ] **Step 3: Create `src/features/ingest/WikiManager.ts`**

```typescript
import type { Vault, TFile } from 'obsidian';

export class WikiManager {
  constructor(private vault: Vault, private wikiFolder: string) {}

  async writePage(path: string, content: string): Promise<void> {
    await this.ensureParentDir(path);
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing) {
      await this.vault.modify(existing as TFile, content);
    } else {
      await this.vault.create(path, content);
    }
  }

  async appendToLog(entry: string): Promise<void> {
    const logPath = `${this.wikiFolder}/log.md`;
    const timestamp = new Date().toISOString();
    const line = `- ${timestamp}: ${entry}\n`;

    const existing = this.vault.getAbstractFileByPath(logPath);
    if (existing) {
      const current = await this.vault.cachedRead(existing as TFile);
      await this.vault.modify(existing as TFile, current + line);
    } else {
      await this.vault.create(logPath, `# LLM Wiki Log\n\n${line}`);
    }
  }

  async updateIndex(title: string, path: string): Promise<void> {
    const indexPath = `${this.wikiFolder}/index.md`;
    const link = `- [[${path.replace(/\.md$/, '')}|${title}]]\n`;

    const existing = this.vault.getAbstractFileByPath(indexPath);
    if (existing) {
      const current = await this.vault.cachedRead(existing as TFile);
      if (!current.includes(link.trim())) {
        await this.vault.modify(existing as TFile, current + link);
      }
    } else {
      await this.vault.create(indexPath, `# Wiki Index\n\n${link}`);
    }
  }

  private async ensureParentDir(filePath: string): Promise<void> {
    const parts = filePath.split('/');
    parts.pop(); // remove filename
    const dir = parts.join('/');
    if (dir) {
      const exists = await (this.vault.adapter as any).exists(dir);
      if (!exists) await (this.vault.adapter as any).mkdir(dir);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/features/ingest/WikiManager.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/ingest/WikiManager.ts __tests__/features/ingest/WikiManager.test.ts
git commit -m "feat: add WikiManager for vault page writes and log/index updates

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: IngestService

**Files:**
- Create: `src/features/ingest/IngestService.ts`
- Create: `__tests__/features/ingest/IngestService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/features/ingest/IngestService.test.ts
import { IngestService } from '../../../src/features/ingest/IngestService';
import { mockVault } from '../../../__mocks__/obsidian';
import type { TFile } from 'obsidian';
import type { WikiSchema } from '../../../src/types';

const mockProvider = {
  chat: jest.fn(async function* () { yield 'Generated wiki content'; }),
};

const mockWikiManager = {
  writePage: jest.fn().mockResolvedValue(undefined),
  appendToLog: jest.fn().mockResolvedValue(undefined),
  updateIndex: jest.fn().mockResolvedValue(undefined),
};

const mockSchema: WikiSchema = {
  systemPrompt: 'You are a wiki assistant.',
  pageTypes: ['concept', 'summary', 'qa'],
  relationTypes: ['related', 'is_a', 'part_of', 'mentions', 'supports', 'contradicts', 'derived_from'],
  defaultPageType: 'concept',
};

const mockSettings = {
  wikiFolder: 'wiki',
  rawSourcesFolder: 'raw',
  contentHashes: {} as Record<string, string>,
};

function makeFile(name: string, ext: string): TFile {
  return { extension: ext, path: `raw/${name}.${ext}`, name: `${name}.${ext}`, stat: { size: 100 } } as unknown as TFile;
}

describe('IngestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVault.cachedRead.mockResolvedValue('# Source Content\nThis is the document text.');
    mockVault.adapter.exists.mockResolvedValue(false);
  });

  it('ingest() calls provider.chat with file content in prompt', async () => {
    const file = makeFile('article', 'md');
    const service = new IngestService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any, mockWikiManager as any);
    const onChunk = jest.fn();

    await service.ingest(file, onChunk);

    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    const [messages] = (mockProvider.chat as jest.Mock).mock.calls[0];
    const userMsg = messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toContain('Source Content');
  });

  it('ingest() writes result to wiki page', async () => {
    const file = makeFile('article', 'md');
    const service = new IngestService(mockVault as any, mockProvider as any, mockSchema, mockSettings as any, mockWikiManager as any);

    await service.ingest(file, jest.fn());

    expect(mockWikiManager.writePage).toHaveBeenCalledWith(
      expect.stringContaining('wiki/'),
      expect.stringContaining('Generated wiki content')
    );
  });

  it('ingest() skips file when hash unchanged', async () => {
    const file = makeFile('article', 'md');
    const content = '# Source Content\nThis is the document text.';
    const { ContentHasher } = await import('../../../src/features/ingest/ContentHasher');
    const hash = await ContentHasher.hash(content);

    const settingsWithHash = { ...mockSettings, contentHashes: { [file.path]: hash } };
    const service = new IngestService(mockVault as any, mockProvider as any, mockSchema, settingsWithHash as any, mockWikiManager as any);

    const onChunk = jest.fn();
    await service.ingest(file, onChunk);

    expect(mockProvider.chat).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith(expect.stringContaining('skipped'));
  });

  it('reingest() bypasses hash check', async () => {
    const file = makeFile('article', 'md');
    const content = '# Source Content\nThis is the document text.';
    const { ContentHasher } = await import('../../../src/features/ingest/ContentHasher');
    const hash = await ContentHasher.hash(content);

    const settingsWithHash = { ...mockSettings, contentHashes: { [file.path]: hash } };
    const service = new IngestService(mockVault as any, mockProvider as any, mockSchema, settingsWithHash as any, mockWikiManager as any);

    await service.reingest(file, jest.fn());

    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/features/ingest/IngestService.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/features/ingest/IngestService'`

- [ ] **Step 3: Create `src/features/ingest/IngestService.ts`**

```typescript
import type { TFile, Vault } from 'obsidian';
import type { LLMProvider, WikiSchema, LLMWikiSettings, ChatMessage } from '../../types';
import { FileParser } from './FileParser';
import { ContentHasher } from './ContentHasher';
import type { WikiManager } from './WikiManager';

export class IngestService {
  constructor(
    private vault: Vault,
    private provider: LLMProvider,
    private schema: WikiSchema,
    private settings: LLMWikiSettings,
    private wikiManager: WikiManager,
  ) {}

  async ingest(file: TFile, onChunk: (text: string) => void): Promise<void> {
    await this._ingest(file, onChunk, false);
  }

  async reingest(file: TFile, onChunk: (text: string) => void): Promise<void> {
    await this._ingest(file, onChunk, true);
  }

  private async _ingest(file: TFile, onChunk: (text: string) => void, force: boolean): Promise<void> {
    if (!FileParser.supports(file)) {
      onChunk(`⚠️ Skipped ${file.name}: unsupported file type.`);
      return;
    }

    // Parse file content
    const parsed = await FileParser.parse(file, this.vault);
    const rawText = parsed.type === 'text' ? parsed.text : `[Image: ${file.name}]`;

    // Hash check (skip for images and when forced)
    if (!force && parsed.type === 'text') {
      const hash = await ContentHasher.hash(rawText);
      const stored = this.settings.contentHashes?.[file.path];
      if (stored && stored === hash) {
        onChunk(`⏭️ ${file.name} skipped — content unchanged.`);
        return;
      }
      if (!this.settings.contentHashes) this.settings.contentHashes = {};
      this.settings.contentHashes[file.path] = hash;
    }

    // Build LLM prompt
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.schema.systemPrompt,
        timestamp: '',
      },
      {
        role: 'user',
        content: this.buildIngestPrompt(file, rawText, parsed.type === 'image' ? parsed : undefined),
        timestamp: '',
      },
    ];

    onChunk(`📥 Ingesting ${file.name}…\n`);

    let fullContent = '';
    for await (const token of this.provider.chat(messages)) {
      fullContent += token;
      onChunk(token);
    }

    if (fullContent) {
      const wikiPath = this.deriveWikiPath(file);
      await this.wikiManager.writePage(wikiPath, fullContent);
      await this.wikiManager.updateIndex(file.basename ?? file.name, wikiPath);
      await this.wikiManager.appendToLog(`Ingested: ${file.path} → ${wikiPath}`);
      onChunk(`\n✅ Written to ${wikiPath}`);
    }
  }

  private buildIngestPrompt(file: TFile, text: string, image?: { base64: string; mimeType: string }): string {
    if (image) {
      return `Please analyse this image and create a wiki page about its contents.\n\nImage file: ${file.name}\n\n[Image data attached as base64]`;
    }
    return `Please analyse the following document and create a wiki page about its key concepts, facts, and information.\n\nSource file: ${file.name}\n\n---\n\n${text.slice(0, 8000)}`;
  }

  private deriveWikiPath(file: TFile): string {
    const basename = file.name.replace(/\.[^.]+$/, '');
    return `${this.settings.wikiFolder}/sources/${basename}.md`;
  }
}
```

- [ ] **Step 4: Add `contentHashes` to `LLMWikiSettings` in `src/types.ts`**

Open `src/types.ts` and add `contentHashes?: Record<string, string>` to the `LLMWikiSettings` interface. Also ensure the `Session` type has `summary?` and `summaryUpToIndex?` fields:

```typescript
// In LLMWikiSettings interface — add:
contentHashes?: Record<string, string>;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest __tests__/features/ingest/IngestService.test.ts
```

Expected: PASS, 4 tests

- [ ] **Step 6: Commit**

```bash
git add src/features/ingest/IngestService.ts __tests__/features/ingest/IngestService.test.ts src/types.ts
git commit -m "feat: add IngestService with hash dedup and LLM wiki page generation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: AutoWatcher + context menu

**Files:**
- Create: `src/features/ingest/AutoWatcher.ts`
- Modify: `src/main.ts` — register auto-watcher + context menu item

- [ ] **Step 1: Create `src/features/ingest/AutoWatcher.ts`**

```typescript
import type { Plugin, TFile } from 'obsidian';
import type { IngestService } from './IngestService';

export class AutoWatcher {
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private plugin: Plugin,
    private ingestService: IngestService,
    private rawSourcesFolder: string,
    private onChunk: (text: string) => void,
  ) {}

  register(): void {
    this.plugin.registerEvent(
      this.plugin.app.vault.on('create', (file) => {
        if (!(file as TFile).extension) return;
        const tfile = file as TFile;
        if (!tfile.path.startsWith(this.rawSourcesFolder)) return;

        const key = tfile.path;
        const existing = this.debounceTimers.get(key);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(async () => {
          this.debounceTimers.delete(key);
          await this.ingestService.ingest(tfile, this.onChunk);
        }, 2000);

        this.debounceTimers.set(key, timer);
      })
    );
  }

  destroy(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }
}
```

- [ ] **Step 2: Wire context menu in `src/main.ts`**

Add to the `onload()` method after the existing commands:

```typescript
// File Explorer context menu — "LLM Wiki: Ingest"
this.registerEvent(
  this.app.workspace.on('file-menu', (menu, file) => {
    if (!(file as TFile).extension) return;
    const tfile = file as TFile;
    if (!FileParser.supports(tfile)) return;

    menu.addItem((item) => {
      item
        .setTitle('LLM Wiki: Ingest')
        .setIcon('brain')
        .onClick(async () => {
          const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_LLM_WIKI)[0]?.view as LLMWikiView | undefined;
          if (!view) {
            new Notice('Open the LLM Wiki chat panel first.');
            return;
          }
          await this.activateView();
          // Dispatch to view's ingest handler (wired via public method added in LLMWikiView)
          (view as any).triggerIngest(tfile);
        });
    });
  })
);
```

Also add `triggerIngest(file: TFile)` to `LLMWikiView.ts`:

```typescript
async triggerIngest(file: TFile): Promise<void> {
  await this.handleCommand('ingest', file.path);
}
```

- [ ] **Step 3: Wire `/ingest` and `/reingest` in `LLMWikiView.handleCommand`**

Update the `switch` in `handleCommand`:

```typescript
case 'ingest': {
  const file = this.app.vault.getAbstractFileByPath(args) as TFile | null;
  if (!file) { new Notice(`File not found: ${args}`); return; }
  const { IngestService } = await import('../features/ingest/IngestService');
  const { WikiManager } = await import('../features/ingest/WikiManager');
  const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
  const provider = ProviderFactory.create(this.plugin.settings);
  const wm = new WikiManager(this.app.vault, this.plugin.settings.wikiFolder);
  const service = new IngestService(this.app.vault, provider, schema, this.plugin.settings, wm);
  const bubble = this.messagesEl.createEl('div', { cls: 'llm-wiki-bubble llm-wiki-bubble-assistant' });
  const contentEl = bubble.createEl('div', { cls: 'llm-wiki-bubble-content', text: '' });
  await service.ingest(file as TFile, (chunk) => {
    contentEl.textContent += chunk;
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  });
  break;
}
case 'reingest': {
  const file = this.app.vault.getAbstractFileByPath(args) as TFile | null;
  if (!file) { new Notice(`File not found: ${args}`); return; }
  const { IngestService } = await import('../features/ingest/IngestService');
  const { WikiManager } = await import('../features/ingest/WikiManager');
  const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
  const provider = ProviderFactory.create(this.plugin.settings);
  const wm = new WikiManager(this.app.vault, this.plugin.settings.wikiFolder);
  const service = new IngestService(this.app.vault, provider, schema, this.plugin.settings, wm);
  const bubble = this.messagesEl.createEl('div', { cls: 'llm-wiki-bubble llm-wiki-bubble-assistant' });
  const contentEl = bubble.createEl('div', { cls: 'llm-wiki-bubble-content', text: '' });
  await service.reingest(file as TFile, (chunk) => {
    contentEl.textContent += chunk;
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  });
  break;
}
case 'ingest-all': {
  const files = this.app.vault.getFiles().filter((f) =>
    f.path.startsWith(this.plugin.settings.rawSourcesFolder)
  );
  if (files.length === 0) { new Notice('No files found in raw sources folder.'); return; }
  const { IngestService } = await import('../features/ingest/IngestService');
  const { WikiManager } = await import('../features/ingest/WikiManager');
  const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
  const provider = ProviderFactory.create(this.plugin.settings);
  const wm = new WikiManager(this.app.vault, this.plugin.settings.wikiFolder);
  const service = new IngestService(this.app.vault, provider, schema, this.plugin.settings, wm);
  const failures: string[] = [];
  for (const file of files) {
    try {
      const bubble = this.messagesEl.createEl('div', { cls: 'llm-wiki-bubble llm-wiki-bubble-assistant' });
      const contentEl = bubble.createEl('div', { cls: 'llm-wiki-bubble-content', text: '' });
      await service.ingest(file, (chunk) => {
        contentEl.textContent += chunk;
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      });
    } catch (e) {
      failures.push(file.path);
    }
  }
  if (failures.length) new Notice(`Ingest failed for ${failures.length} file(s): ${failures.join(', ')}`);
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
git add src/features/ingest/AutoWatcher.ts src/main.ts src/ui/LLMWikiView.ts
git commit -m "feat: wire ingest commands, auto-watcher and context menu

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Plan 3 Complete

```bash
npm run build && npx jest --coverage
```

Expected: All tests PASS. Files in `raw/` are ingested to `wiki/sources/`. Index and log updated.

**Next:** Plan 4 — Query, Save, and Graph Relations
