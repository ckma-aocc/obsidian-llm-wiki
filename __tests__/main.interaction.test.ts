/** @jest-environment jsdom */

import LLMWikiPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings/Settings";
import { TFile } from "obsidian";
import { VIEW_TYPE_LLM_WIKI } from "../src/ui/LLMWikiView";

const ingestByPathMock = jest.fn().mockResolvedValue(undefined);
const ingestAllMock = jest.fn().mockResolvedValue([]);
const cleanBrokenWikilinksInWikiMock = jest.fn().mockResolvedValue({ scanned: 2, updated: 1 });
const saveMock = jest.fn().mockResolvedValue("wiki/analyses/T.md");
const rebuildIndexMock = jest.fn().mockResolvedValue(undefined);
const appendToLogMock = jest.fn().mockResolvedValue(undefined);
const ensureStructureMock = jest.fn().mockResolvedValue(undefined);
const relateSingleMock = jest.fn().mockResolvedValue(undefined);
const relateMultipleMock = jest.fn().mockResolvedValue(undefined);
const lintMock = jest.fn();
const autoWatcherRegisterMock = jest.fn();
const autoWatcherStartMock = jest.fn();
const autoWatcherStopMock = jest.fn();
const autoWatcherUpdateSettingsMock = jest.fn();
let autoWatcherOnNewRawFile: ((path: string) => Promise<void>) | null = null;

jest.mock("../src/features/ingest/IngestService", () => ({
  IngestService: jest.fn().mockImplementation(() => ({
    ingestByPath: ingestByPathMock,
    ingestAll: ingestAllMock,
    cleanBrokenWikilinksInWiki: cleanBrokenWikilinksInWikiMock
  }))
}));

jest.mock("../src/features/save/SaveService", () => ({
  SaveService: jest.fn().mockImplementation(() => ({
    save: saveMock
  }))
}));

jest.mock("../src/features/ingest/WikiManager", () => ({
  WikiManager: jest.fn().mockImplementation(() => ({
    ensureStructure: ensureStructureMock,
    rebuildIndex: rebuildIndexMock,
    appendToLog: appendToLogMock
  }))
}));

jest.mock("../src/schema/SchemaLoader", () => ({
  SchemaLoader: {
    load: jest.fn().mockResolvedValue({
      systemPrompt: "s",
      pageTypes: ["concept"],
      relationTypes: ["related"],
      defaultPageType: "concept"
    })
  }
}));

jest.mock("../src/features/relations/RelationService", () => ({
  RelationService: jest.fn().mockImplementation(() => ({
    relateSingle: relateSingleMock,
    relateMultiple: relateMultipleMock
  }))
}));

jest.mock("../src/providers/ProviderFactory", () => ({
  ProviderFactory: {
    create: jest.fn().mockReturnValue({ chat: async function* () {} })
  }
}));

jest.mock("../src/features/lint/LintService", () => ({
  LintService: jest.fn().mockImplementation(() => ({
    lint: lintMock
  }))
}));

const lintSchedulerRegisterMock = jest.fn();
const lintSchedulerStartMock = jest.fn(() => ({ stop: jest.fn() }));
jest.mock("../src/features/lint/LintScheduler", () => ({
  LintScheduler: {
    register: lintSchedulerRegisterMock,
    start: lintSchedulerStartMock
  }
}));

jest.mock("../src/features/ingest/AutoWatcher", () => ({
  AutoWatcher: jest.fn().mockImplementation((_vault: any, _settings: any, onNewRawFile: (path: string) => Promise<void>) => {
    autoWatcherOnNewRawFile = onNewRawFile;
    return {
      register: autoWatcherRegisterMock,
      start: autoWatcherStartMock,
      stop: autoWatcherStopMock,
      updateSettings: autoWatcherUpdateSettingsMock
    };
  })
}));

describe("LLMWikiPlugin interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    autoWatcherOnNewRawFile = null;
    lintMock.mockImplementation(async (onChunk: (c: string) => void) => {
      onChunk("part1 ");
      onChunk("part2");
      return { orphans: ["Orphan A"], brokenLinks: [], llmAnalysis: "part1 part2" };
    });
  });

  function createPlugin() {
    const plugin = new LLMWikiPlugin({} as any, {} as any);
    (plugin as any).settings = { ...DEFAULT_SETTINGS };
    (plugin as any).app.workspace.on = jest.fn().mockReturnValue({ id: "workspace-event" });
    return plugin;
  }

  it("onload registers view, ribbon, commands, and file-menu hook", async () => {
    const plugin = createPlugin();
    const activateSpy = jest.spyOn(plugin, "activateView").mockResolvedValue(undefined);
    const slashSpy = jest.spyOn(plugin, "handleSlashCommand").mockResolvedValue(undefined);

    await plugin.onload();

    expect(autoWatcherStartMock).toHaveBeenCalled();

    expect(plugin.registerView).toHaveBeenCalledWith(VIEW_TYPE_LLM_WIKI, expect.any(Function));
    expect(plugin.addSettingTab).toHaveBeenCalledTimes(1);
    expect(lintSchedulerStartMock).toHaveBeenCalledTimes(1);

    const ribbonCall = (plugin.addRibbonIcon as jest.Mock).mock.calls[0];
    expect(ribbonCall[0]).toBe("bot");
    expect(ribbonCall[1]).toBe("Open LLM Wiki");
    await ribbonCall[2]();
    expect(activateSpy).toHaveBeenCalled();

    const commands = (plugin.addCommand as jest.Mock).mock.calls.map((x) => x[0]);
    expect(commands.map((c: any) => c.id)).toEqual(
      expect.arrayContaining(["open-llm-wiki-chat", "llm-wiki-lint", "llm-wiki-ingest-all"])
    );

    const openChat = commands.find((c: any) => c.id === "open-llm-wiki-chat");
    await openChat.callback();
    expect(activateSpy).toHaveBeenCalled();

    const ingestAll = commands.find((c: any) => c.id === "llm-wiki-ingest-all");
    await ingestAll.callback();
    expect(slashSpy).toHaveBeenCalledWith("ingest-all", "", null);

    const workspaceOn = (plugin.app.workspace.on as jest.Mock).mock.calls;
    const fileMenuCall = workspaceOn.find((x) => x[0] === "file-menu");
    expect(fileMenuCall).toBeDefined();

    const fileMenuHandler = fileMenuCall[1] as (menu: any, file: any) => void;
    const itemRef: any = {};
    const menu = {
      addItem: jest.fn((builder: (item: any) => void) => {
        const item = {
          setTitle: jest.fn().mockReturnThis(),
          onClick: jest.fn(function (cb: () => void) {
            itemRef.cb = cb;
            return this;
          })
        };
        builder(item);
      })
    };

    const tf = new (TFile as any)("raw/new.md");
    fileMenuHandler(menu, tf);
    expect(menu.addItem).toHaveBeenCalledTimes(1);
    expect(itemRef.cb).toBeDefined();
    itemRef.cb();
    expect(slashSpy).toHaveBeenCalledWith("ingest", "raw/new.md", null);
  });

  it("onload wires AutoWatcher callback to ingest slash dispatch", async () => {
    const plugin = createPlugin();
    (plugin as any).settings = { ...DEFAULT_SETTINGS, autoIngest: true };
    const slashSpy = jest.spyOn(plugin, "handleSlashCommand").mockResolvedValue(undefined);

    await plugin.onload();

    expect(autoWatcherStartMock).toHaveBeenCalled();
    expect(autoWatcherOnNewRawFile).toBeDefined();
    await autoWatcherOnNewRawFile?.("raw/auto.md");
    expect(slashSpy).toHaveBeenCalledWith("ingest", "raw/auto.md", null);
  });

  it("lint command callback triggers runLintFromCommand end-to-end", async () => {
    const plugin = createPlugin();
    const runLintSpy = jest.spyOn(plugin as any, "runLintFromCommand");

    await plugin.onload();

    const commands = (plugin.addCommand as jest.Mock).mock.calls.map((x) => x[0]);
    const lintCommand = commands.find((c: any) => c.id === "llm-wiki-lint");
    lintCommand.callback();

    expect(runLintSpy).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lintMock).toHaveBeenCalled();
    expect(relateMultipleMock).toHaveBeenCalledWith(["Orphan A"]);
  });

  it("dispatches ingest and reingest commands", async () => {
    const plugin = createPlugin();
    const view = { setStatus: jest.fn() } as any;

    await plugin.handleSlashCommand("ingest", "raw/a.md", view);
    await plugin.handleSlashCommand("reingest", "raw/b.md", view);

    expect(ingestByPathMock).toHaveBeenNthCalledWith(1, "raw/a.md", false, expect.any(Function));
    expect(ingestByPathMock).toHaveBeenNthCalledWith(2, "raw/b.md", true, expect.any(Function));
  });

  it("handles save command and triggers relation update", async () => {
    const plugin = createPlugin();
    const view = { lastAssistantMessage: "assistant output" } as any;

    await plugin.handleSlashCommand("save", "Topic A", view);

    expect(saveMock).toHaveBeenCalledWith("Topic A", "assistant output");
    expect(relateSingleMock).toHaveBeenCalledWith("Topic A");
  });

  it("handles save command using assistant content from session fallback", async () => {
    const plugin = createPlugin();
    const view = {
      lastAssistantMessage: "",
      session: {
        messages: [
          { role: "user", content: "Q", timestamp: "" },
          { role: "assistant", content: "assistant from session", timestamp: "" }
        ]
      }
    } as any;

    await plugin.handleSlashCommand("save", "Topic B", view);

    expect(saveMock).toHaveBeenCalledWith("Topic B", "assistant from session");
    expect(relateSingleMock).toHaveBeenCalledWith("Topic B");
  });

  it("streams lint to UI and triggers orphan relation update", async () => {
    const plugin = createPlugin();
    const view = {
      messagesEl: {},
      setStatus: jest.fn(),
      appendAssistantMessageStreamed: jest.fn()
    } as any;

    await (plugin as any).runLintFromCommand(view);

    expect(view.setStatus).toHaveBeenCalledWith("Linting...");
    expect(view.setStatus).toHaveBeenLastCalledWith("");
    expect(view.appendAssistantMessageStreamed).toHaveBeenCalledWith("part1 part2");
    expect(relateMultipleMock).toHaveBeenCalledWith(["Orphan A"]);
  });

  it("dispatches reindex command and rebuilds index immediately", async () => {
    const plugin = createPlugin();

    await plugin.handleSlashCommand("reindex", "", null);

    expect(rebuildIndexMock).toHaveBeenCalledTimes(1);
  });

  it("dispatches clean-links command and runs whole-wiki link cleanup", async () => {
    const plugin = createPlugin();

    await plugin.handleSlashCommand("clean-links", "", null);

    expect(cleanBrokenWikilinksInWikiMock).toHaveBeenCalledTimes(1);
  });

  it("dispatches log-tail command and renders recent entries to chat", async () => {
    const plugin = createPlugin();
    const view = { appendAssistantMessageStreamed: jest.fn() } as any;

    (plugin.app.vault.adapter.exists as jest.Mock).mockImplementation(async (path: string) => path === "wiki/log.md");
    (plugin.app.vault.adapter.read as jest.Mock).mockResolvedValue(
      [
        "# Wiki Log",
        "",
        "## [2026-05-25 10:00:00] ingest | A",
        "- source: raw/a.md",
        "",
        "## [2026-05-25 11:00:00] query | B",
        "- response_chars: 120"
      ].join("\n")
    );

    await plugin.handleSlashCommand("log-tail", "1", view);

    expect(view.appendAssistantMessageStreamed).toHaveBeenCalled();
    expect(view.appendAssistantMessageStreamed.mock.calls[0][0]).toContain("query | B");
    expect(view.appendAssistantMessageStreamed.mock.calls[0][0]).not.toContain("ingest | A");
  });

  it("dispatches log-filter command and keeps only requested operation types", async () => {
    const plugin = createPlugin();
    const view = { appendAssistantMessageStreamed: jest.fn() } as any;

    (plugin.app.vault.adapter.exists as jest.Mock).mockImplementation(async (path: string) => path === "wiki/log.md");
    (plugin.app.vault.adapter.read as jest.Mock).mockResolvedValue(
      [
        "# Wiki Log",
        "",
        "## [2026-05-25 10:00:00] ingest | A",
        "",
        "## [2026-05-25 11:00:00] query | B",
        "",
        "## [2026-05-25 12:00:00] lint | pass"
      ].join("\n")
    );

    await plugin.handleSlashCommand("log-filter", "ingest|lint", view);

    expect(view.appendAssistantMessageStreamed).toHaveBeenCalled();
    const output = view.appendAssistantMessageStreamed.mock.calls[0][0] as string;
    expect(output).toContain("ingest | A");
    expect(output).toContain("lint | pass");
    expect(output).not.toContain("query | B");
  });

  it("dispatches help command and outputs full command reference", async () => {
    const plugin = createPlugin();
    const view = { appendAssistantMessageStreamed: jest.fn() } as any;

    await plugin.handleSlashCommand("help", "", view);

    expect(view.appendAssistantMessageStreamed).toHaveBeenCalledTimes(1);
    const output = view.appendAssistantMessageStreamed.mock.calls[0][0] as string;
    expect(output).toContain("LLM Wiki 指令說明");
    expect(output).toContain("/ingest <path>");
    expect(output).toContain("/ingest-all retry");
    expect(output).toContain("/summarize");
  });
});