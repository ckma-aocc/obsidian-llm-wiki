/** @jest-environment jsdom */

import { LLMWikiView } from "../../src/ui/LLMWikiView";
import { installDomShim } from "../helpers/domShim";

describe("LLMWikiView interactions", () => {
  beforeEach(() => {
    installDomShim();
    jest.clearAllMocks();
  });

  function buildPlugin() {
    const session1 = {
      id: "s1",
      title: "Session 1",
      createdAt: "",
      updatedAt: "",
      messages: [] as any[]
    };
    const session2 = {
      id: "s2",
      title: "Session 2",
      createdAt: "",
      updatedAt: "",
      messages: [{ role: "assistant", content: "Hello", timestamp: "" }] as any[]
    };

    return {
      settings: { contextWindowSize: 20, maxMessagesPerSession: 500 },
      sessionStore: {
        createSession: jest.fn().mockResolvedValue(session1),
        listSessions: jest.fn().mockResolvedValue([
          { id: "s1", title: "Session 1", updatedAt: "2" },
          { id: "s2", title: "Session 2", updatedAt: "1" }
        ]),
        loadSession: jest.fn().mockImplementation(async (id: string) => (id === "s1" ? session1 : session2)),
        appendMessage: jest.fn().mockImplementation(async (_id: string, msg: any) => ({
          ...session1,
          messages: [msg]
        })),
        saveSession: jest.fn().mockResolvedValue(undefined),
        updateTitle: jest.fn().mockResolvedValue(undefined),
        deleteSession: jest.fn().mockResolvedValue(undefined)
      },
      handleSlashCommand: jest.fn().mockResolvedValue(undefined),
      saveLastAssistantMessage: jest.fn().mockResolvedValue(undefined)
    } as any;
  }

  it("dispatches slash command from input Enter", async () => {
    const plugin = buildPlugin();
    const leaf = { app: { vault: {}, workspace: {} } } as any;
    const view = new LLMWikiView(leaf, plugin);

    await view.onOpen();
    view.inputEl.value = "/lint";
    await (view as any).onSend();

    expect(plugin.handleSlashCommand).toHaveBeenCalledWith("lint", "", view);
  });

  it("switches session from custom dropdown and supports rename", async () => {
    const plugin = buildPlugin();
    const leaf = { app: { vault: {}, workspace: {} } } as any;
    const view = new LLMWikiView(leaf, plugin);

    await view.onOpen();

    const trigger = view.contentEl.querySelector(".llm-wiki-session-trigger") as HTMLButtonElement;
    trigger.click();
    const target = Array.from(view.contentEl.querySelectorAll(".llm-wiki-session-option")).find(
      (el) => (el.textContent ?? "").trim() === "Session 2"
    ) as HTMLButtonElement;
    expect(target).toBeDefined();
    target.click();
    await Promise.resolve();
    expect(plugin.sessionStore.loadSession).toHaveBeenCalledWith("s2");

    const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("Renamed Session");
    const renameBtn = Array.from(view.contentEl.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "") === "Rename"
    ) as HTMLButtonElement;
    renameBtn.click();
    await Promise.resolve();

    expect(plugin.sessionStore.updateTitle).toHaveBeenCalledWith("s2", "Renamed Session");
    promptSpy.mockRestore();
  });

  it("clicking Save to Wiki button calls plugin save handler", async () => {
    const plugin = buildPlugin();
    const leaf = { app: { vault: {}, workspace: {} } } as any;
    const view = new LLMWikiView(leaf, plugin);

    await view.onOpen();
    await view.switchSession("s2");
    (view as any).renderMessages();

    const saveBtn = Array.from(view.messagesEl.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Save to Wiki")
    ) as HTMLButtonElement | undefined;

    expect(saveBtn).toBeDefined();
    saveBtn?.click();
    expect(plugin.saveLastAssistantMessage).toHaveBeenCalledWith(view);
  });

  it("deletes active session when clicking X and user confirms", async () => {
    const plugin = buildPlugin();
    const leaf = { app: { vault: {}, workspace: {} } } as any;
    const view = new LLMWikiView(leaf, plugin);

    await view.onOpen();

    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const trigger = view.contentEl.querySelector(".llm-wiki-session-trigger") as HTMLButtonElement;
    trigger.click();
    const deleteBtn = Array.from(view.contentEl.querySelectorAll(".llm-wiki-session-option-delete")).find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Session 1")
    ) as HTMLButtonElement | undefined;
    expect(deleteBtn).toBeDefined();

    deleteBtn?.click();
    await Promise.resolve();

    expect(plugin.sessionStore.deleteSession).toHaveBeenCalledWith("s1");
    confirmSpy.mockRestore();
  });
});