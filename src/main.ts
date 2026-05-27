import { Menu, Notice, Plugin, TFile } from "obsidian";
import { LLMWikiSettingsTab } from "./settings/SettingsTab";
import { createDefaultProviderConfigs, DEFAULT_SETTINGS, resolveProviderConfig, upsertProviderConfig } from "./settings/Settings";
import type { LLMWikiSettings, ProviderType } from "./types";
import { SessionStore } from "./storage/SessionStore";
import { LLMWikiView, VIEW_TYPE_LLM_WIKI } from "./ui/LLMWikiView";
import type { AutoWatcher } from "./features/ingest/AutoWatcher";
import type { LintSchedulerHandle } from "./features/lint/LintScheduler";

export default class LLMWikiPlugin extends Plugin {
  settings!: LLMWikiSettings;
  sessionStore!: SessionStore;
  private lastFailedIngestPaths: string[] = [];
  private autoWatcher: AutoWatcher | null = null;
  private lintSchedulerHandle: LintSchedulerHandle | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.ensureRawSourcesPathExists();
    this.sessionStore = new SessionStore(this.app.vault, this.settings.sessionsPath);

    this.registerView(VIEW_TYPE_LLM_WIKI, (leaf) => new LLMWikiView(leaf, this));

    this.addRibbonIcon("bot", "Open LLM Wiki", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-llm-wiki-chat",
      name: "LLM Wiki: Open Chat",
      callback: () => void this.activateView()
    });

    this.addCommand({
      id: "llm-wiki-lint",
      name: "LLM Wiki: Lint Wiki",
      callback: () => void this.runLintFromCommand()
    });

    this.addCommand({
      id: "llm-wiki-ingest-all",
      name: "LLM Wiki: Ingest All Raw Files",
      callback: () => void this.handleSlashCommand("ingest-all", "", null)
    });

    this.addSettingTab(new LLMWikiSettingsTab(this.app, this));

    const { AutoWatcher } = await import("./features/ingest/AutoWatcher");
    this.autoWatcher = new AutoWatcher(this.app.vault, this.settings, async (path) => {
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LLM_WIKI);
      const view = leaves[0]?.view as LLMWikiView | undefined;
      await this.handleSlashCommand("ingest", path, view ?? null);
    });
    this.autoWatcher.start();

    await this.rebuildLintScheduler(true);

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: any) => {
        if (!(file instanceof TFile)) return;
        menu.addItem((item) => {
          item.setTitle("LLM Wiki: Ingest").onClick(() => {
            void this.handleSlashCommand("ingest", file.path, null);
          });
        });
      })
    );
  }

  onunload(): void {
    this.autoWatcher?.stop();
    this.autoWatcher = null;
    this.lintSchedulerHandle?.stop();
    this.lintSchedulerHandle = null;
    this.app.workspace.getLeavesOfType(VIEW_TYPE_LLM_WIKI).forEach((leaf) => leaf.detach());
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    this.settings.providerConfigs = (this.settings.providerConfigs ?? []).map((x) => ({ ...x }));

    const migrated = this.migrateProviderSettings(loaded as Record<string, unknown>);
    if (migrated) {
      await this.saveData(this.settings);
    }
  }

  private migrateProviderSettings(loaded: Record<string, unknown>): boolean {
    let changed = false;

    if (!Array.isArray(this.settings.providerConfigs)) {
      this.settings.providerConfigs = createDefaultProviderConfigs();
      changed = true;
    }

    const providers: ProviderType[] = ["openai", "anthropic", "ollama", "custom"];
    for (const provider of providers) {
      if (!this.settings.providerConfigs.some((x) => x.provider === provider)) {
        this.settings.providerConfigs.push(resolveProviderConfig(DEFAULT_SETTINGS, provider));
        changed = true;
      }
    }

    const selected = this.settings.provider;
    const hasLegacyFields =
      typeof loaded.apiKey === "string" ||
      typeof loaded.model === "string" ||
      typeof loaded.baseUrl === "string" ||
      typeof loaded.azureApiVersion === "string";

    if (hasLegacyFields) {
      upsertProviderConfig(this.settings, selected, {
        apiKey: typeof loaded.apiKey === "string" ? loaded.apiKey : undefined,
        model: typeof loaded.model === "string" ? loaded.model : undefined,
        baseUrl: typeof loaded.baseUrl === "string" ? loaded.baseUrl : undefined,
        azureApiVersion: typeof loaded.azureApiVersion === "string" ? loaded.azureApiVersion : undefined
      });
      changed = true;
    }

    const settingsWithLegacy = this.settings as LLMWikiSettings & {
      apiKey?: string;
      model?: string;
      baseUrl?: string;
      azureApiVersion?: string;
    };
    if ("apiKey" in settingsWithLegacy) {
      delete settingsWithLegacy.apiKey;
      changed = true;
    }
    if ("model" in settingsWithLegacy) {
      delete settingsWithLegacy.model;
      changed = true;
    }
    if ("baseUrl" in settingsWithLegacy) {
      delete settingsWithLegacy.baseUrl;
      changed = true;
    }
    if ("azureApiVersion" in settingsWithLegacy) {
      delete settingsWithLegacy.azureApiVersion;
      changed = true;
    }

    return changed;
  }

  private async ensureRawSourcesPathExists(): Promise<void> {
    const rawPath = this.settings.rawSourcesPath.trim() || "raw";
    this.settings.rawSourcesPath = rawPath;
    const adapter = this.app.vault.adapter as any;
    if (!(await adapter.exists(rawPath))) {
      await adapter.mkdir(rawPath);
    }
  }

  async saveSettings(applyRuntime = true): Promise<void> {
    await this.saveData(this.settings);
    if (applyRuntime) {
      await this.applyRuntimeSettings();
    }
  }

  private async applyRuntimeSettings(): Promise<void> {
    if (this.autoWatcher) {
      this.autoWatcher.updateSettings(this.settings);
      this.autoWatcher.start();
    }
    await this.rebuildLintScheduler(false);
  }

  private async rebuildLintScheduler(withStartupCatchUp: boolean): Promise<void> {
    this.lintSchedulerHandle?.stop();
    this.lintSchedulerHandle = null;

    const { LintScheduler } = await import("./features/lint/LintScheduler");
    this.lintSchedulerHandle = LintScheduler.start({
      schedule: this.settings.lintSchedule,
      timeOfDay: this.settings.lintTimeOfDay,
      catchUpOnStartup: withStartupCatchUp && this.settings.lintCatchUpOnStartup,
      lastRunAt: this.settings.lastLintRunAt,
      onTick: async () => {
        await this.runLintFromCommand();
      },
      onDidRun: async (ts) => {
        this.settings.lastLintRunAt = ts;
        await this.saveSettings(false);
      }
    });
  }

  async activateView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LLM_WIKI);
    if (leaves.length) {
      await this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("Cannot open LLM Wiki view.");
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_LLM_WIKI, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async saveLastAssistantMessage(view: LLMWikiView): Promise<void> {
    const assistantMessage = this.resolveAssistantMessage(view);
    if (!assistantMessage) {
      new Notice("No assistant message to save.");
      return;
    }
    const title = this.buildAutoSaveTitle(assistantMessage);
    const { SaveService } = await import("./features/save/SaveService");
    const { WikiManager } = await import("./features/ingest/WikiManager");
    const { SchemaLoader } = await import("./schema/SchemaLoader");
    const manager = new WikiManager(this.app.vault, this.settings.wikiPath);
    await manager.ensureStructure(this.settings.wikiSubdirs);
    try {
      const schema = await SchemaLoader.load(this.app.vault, this.settings);
      const service = new SaveService(manager, schema, this.settings);
      const savedPath = await service.save(title, assistantMessage);
      const { RelationService } = await import("./features/relations/RelationService");
      await new RelationService(this.app.vault, this.settings).relateSingle(title);
      try {
        await manager.appendToLog(`save-success | ${title}`, {
          source: "button",
          path: savedPath,
          chars: assistantMessage.length
        });
      } catch {
        // Do not block user feedback when logging fails.
      }
      new Notice(`Saved to wiki: ${title}`);
    } catch (error) {
      try {
        await manager.appendToLog(`save-error | ${title}`, {
          source: "button",
          error: error instanceof Error ? error.message : String(error)
        });
      } catch {
        // Do not mask the original save error.
      }
      new Notice(`Save failed: ${String(error)}`);
      throw error;
    }
  }

  async handleSlashCommand(command: string, args: string, view: LLMWikiView | null): Promise<void> {
    switch (command) {
      case "ingest":
      case "reingest": {
        const { IngestService } = await import("./features/ingest/IngestService");
        const svc = new IngestService(this.app.vault, this.settings);
        let lastProgress = "";
        await svc.ingestByPath(args, command === "reingest", (m) => {
          lastProgress = m;
          view?.setStatus(m);
        });
        if (lastProgress.includes("Skipping unchanged file")) {
          new Notice("Ingest skipped: unchanged file.");
        } else {
          new Notice("Ingest completed");
        }
        break;
      }
      case "ingest-all": {
        const { IngestService } = await import("./features/ingest/IngestService");
        const svc = new IngestService(this.app.vault, this.settings);
        const retryOnly = args.trim().toLowerCase() === "retry";
        const failed = await svc.ingestAll(retryOnly ? this.lastFailedIngestPaths : null, false, (m) => view?.setStatus(m));
        this.lastFailedIngestPaths = failed;
        if (failed.length) {
          new Notice(`Ingest-all done with ${failed.length} failures. Run /ingest-all retry to retry failed files.`);
        } else {
          new Notice("Ingest-all completed.");
        }
        break;
      }
      case "save": {
        const assistantMessage = this.resolveAssistantMessage(view);
        if (!assistantMessage) {
          new Notice("No assistant message to save.");
          return;
        }
        const title = args || `Saved ${new Date().toISOString().slice(0, 10)}`;
        const { SaveService } = await import("./features/save/SaveService");
        const { WikiManager } = await import("./features/ingest/WikiManager");
        const { SchemaLoader } = await import("./schema/SchemaLoader");
        const manager = new WikiManager(this.app.vault, this.settings.wikiPath);
        await manager.ensureStructure(this.settings.wikiSubdirs);
        try {
          const schema = await SchemaLoader.load(this.app.vault, this.settings);
          const savedPath = await new SaveService(manager, schema, this.settings).save(title, assistantMessage);
          const { RelationService } = await import("./features/relations/RelationService");
          await new RelationService(this.app.vault, this.settings).relateSingle(title);
          try {
            await manager.appendToLog(`save-success | ${title}`, {
              source: "slash",
              path: savedPath,
              chars: assistantMessage.length
            });
          } catch {
            // Do not block user feedback when logging fails.
          }
          new Notice(`Saved page: ${title}`);
        } catch (error) {
          try {
            await manager.appendToLog(`save-error | ${title}`, {
              source: "slash",
              error: error instanceof Error ? error.message : String(error)
            });
          } catch {
            // Do not mask the original save error.
          }
          new Notice(`Save failed: ${String(error)}`);
          throw error;
        }
        break;
      }
      case "lint":
        await this.runLintFromCommand(view ?? undefined);
        break;
      case "relate": {
        const { RelationService } = await import("./features/relations/RelationService");
        const service = new RelationService(this.app.vault, this.settings);
        await service.relateSingle(args.replace(/\[\[|\]\]/g, ""));
        new Notice("Relations updated.");
        break;
      }
      case "clean-links": {
        const { IngestService } = await import("./features/ingest/IngestService");
        const service = new IngestService(this.app.vault, this.settings);
        try {
          const result = await service.cleanBrokenWikilinksInWiki((m) => view?.setStatus(m));
          new Notice(`Cleaned broken wikilinks: updated ${result.updated}/${result.scanned} pages.`);
        } finally {
          view?.setStatus("");
        }
        break;
      }
      case "log-tail": {
        const count = this.parsePositiveInt(args, 20, 200);
        const entries = await this.readLogEntries();
        const selected = entries.slice(-count);
        const output = this.renderLogEntries(`Recent ${selected.length} log entries`, selected);
        this.emitLogOutput(output, view);
        break;
      }
      case "log-filter": {
        const filters = args
          .split(/[|,\s]+/)
          .map((x) => x.trim().toLowerCase())
          .filter((x) => x.length > 0);
        const allowed = new Set(["ingest", "query", "lint"]);
        const wanted = filters.filter((x) => allowed.has(x));
        if (!wanted.length) {
          new Notice("Usage: /log-filter ingest|query|lint");
          break;
        }

        const entries = await this.readLogEntries();
        const selected = entries.filter((entry) => {
          const lower = entry.header.toLowerCase();
          return wanted.some((type) => lower.includes(`] ${type} |`));
        });
        const output = this.renderLogEntries(`Filtered log entries (${wanted.join(", ")})`, selected.slice(-100));
        this.emitLogOutput(output, view);
        break;
      }
      case "reindex": {
        const { WikiManager } = await import("./features/ingest/WikiManager");
        await new WikiManager(this.app.vault, this.settings.wikiPath).rebuildIndex();
        new Notice("Index rebuilt.");
        break;
      }
      case "help":
        this.emitLogOutput(this.renderHelpText(), view);
        break;
      default:
        break;
    }
  }

  private renderHelpText(): string {
    return [
      "### LLM Wiki 指令說明",
      "",
      "| 指令 | 說明 | 範例 |",
      "| --- | --- | --- |",
      "| /help | 顯示完整指令清單與用法。 | /help |",
      "| /ingest <path> | 攝取單一原始檔案並更新 wiki（含來源頁、索引、關聯）。 | /ingest raw/api/auth.md |",
      "| /reingest <path> | 強制重新攝取指定檔案（即使內容雜湊未變）。 | /reingest raw/api/auth.md |",
      "| /ingest-all | 批次攝取 raw 路徑下所有支援格式檔案。 | /ingest-all |",
      "| /ingest-all retry | 只重試上一次 ingest-all 失敗的檔案。 | /ingest-all retry |",
      "| /save [title] | 將最後一則 assistant 回覆存到 wiki/analyses（可帶標題）。 | /save JWT 驗證流程 |",
      "| /lint | 執行 wiki 健檢（孤立頁、壞連結、分析報告）。 | /lint |",
      "| /relate <page> | 重新分析指定頁面的語意關聯並更新 frontmatter。 | /relate wiki/concepts/JWT |",
      "| /clean-links | 清理 wiki 中指向不存在頁面的 wikilink。 | /clean-links |",
      "| /log-tail [n] | 顯示最近 n 筆 log（預設 20，上限 200）。 | /log-tail 30 |",
      "| /log-filter <ingest\|query\|lint> | 依操作類型過濾 log。 | /log-filter ingest\|lint |",
      "| /reindex | 依現有頁面重建 wiki/index.md。 | /reindex |",
      "| /summarize | 摘要目前 session 歷史對話。 | /summarize |",
      "",
      "補充：",
      "- path 可用一般路徑或 [[path]] 格式。",
      "- /summarize 由 chat session 流程處理。"
    ].join("\n");
  }

  private resolveAssistantMessage(view: LLMWikiView | null): string {
    if (!view) return "";
    const direct = view.lastAssistantMessage?.trim();
    if (direct) return direct;

    const fromSession = [...(view.session?.messages ?? [])]
      .reverse()
      .find((msg) => msg.role === "assistant" && msg.content?.trim().length);
    return fromSession?.content ?? "";
  }

  private buildAutoSaveTitle(content: string): string {
    const firstMeaningfulLine =
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? "Saved Analysis";

    const normalized = firstMeaningfulLine
      .replace(/[#>*`\[\]()!_]/g, " ")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    const base = (normalized || "Saved Analysis").slice(0, 48);
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    return `${base} ${stamp}`;
  }

  private emitLogOutput(output: string, view: LLMWikiView | null): void {
    if (view) {
      view.appendAssistantMessageStreamed(output);
      return;
    }
    new Notice(output.split("\n").slice(0, 2).join(" "));
  }

  private parsePositiveInt(raw: string, fallback: number, max: number): number {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
  }

  private async readLogEntries(): Promise<Array<{ header: string; lines: string[] }>> {
    const logPath = `${this.settings.wikiPath}/log.md`;
    const exists = await (this.app.vault.adapter as any).exists(logPath);
    if (!exists) return [];
    const raw = await (this.app.vault.adapter as any).read(logPath);
    const lines = raw.split(/\r?\n/);
    const entries: Array<{ header: string; lines: string[] }> = [];
    let current: { header: string; lines: string[] } | null = null;

    for (const line of lines) {
      if (line.startsWith("## [")) {
        if (current) entries.push(current);
        current = { header: line, lines: [line] };
        continue;
      }
      if (current) {
        current.lines.push(line);
      }
    }

    if (current) entries.push(current);
    return entries;
  }

  private renderLogEntries(title: string, entries: Array<{ header: string; lines: string[] }>): string {
    if (!entries.length) {
      return `### ${title}\n\n(No matching log entries.)`;
    }
    const blocks = entries.map((entry) => entry.lines.join("\n").trimEnd());
    return `### ${title}\n\n${blocks.join("\n\n")}`;
  }

  private async runLintFromCommand(view?: LLMWikiView): Promise<void> {
    const { LintService } = await import("./features/lint/LintService");
    const { ProviderFactory } = await import("./providers/ProviderFactory");
    const { SchemaLoader } = await import("./schema/SchemaLoader");
    const schema = await SchemaLoader.load(this.app.vault, this.settings);
    const provider = ProviderFactory.create(this.settings);
    let full = "";
    const report = await new LintService(this.app.vault, provider, schema, this.settings).lint((chunk) => {
      full += chunk;
      if (view && view.messagesEl) {
        view.setStatus("Linting...");
      }
    });
    if (view) {
      view.setStatus("");
      view.appendAssistantMessageStreamed(full);
    }
    if (report.orphans.length) {
      const { RelationService } = await import("./features/relations/RelationService");
      await new RelationService(this.app.vault, this.settings).relateMultiple(report.orphans);
    }
    const { WikiManager } = await import("./features/ingest/WikiManager");
    await new WikiManager(this.app.vault, this.settings.wikiPath).appendToLog("lint | pass", {
      orphans: report.orphans.length,
      broken_links: report.brokenLinks.length
    });
    if (!view) {
      new Notice(`Lint: ${report.orphans.length} orphans, ${report.brokenLinks.length} broken links.`);
    }
  }
}