import { ItemView, MarkdownRenderer, Modal, Notice } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { ProviderFactory } from "../providers/ProviderFactory";
import { SchemaLoader } from "../schema/SchemaLoader";
import type LLMWikiPlugin from "../main";
import { SlashCommandParser } from "./SlashCommandParser";
import type { Session } from "../types";
import { WikiManager } from "../features/ingest/WikiManager";

export const VIEW_TYPE_LLM_WIKI = "llm-wiki-chat";

interface SessionListItem {
  id: string;
  title: string;
  updatedAt: string;
}

export class LLMWikiView extends ItemView {
  plugin: LLMWikiPlugin;
  session: Session | null = null;
  sessionPickerEl!: HTMLDivElement;
  sessionTriggerEl!: HTMLButtonElement;
  sessionMenuEl!: HTMLDivElement;
  sessionItems: SessionListItem[] = [];
  sessionMenuOpen = false;
  renameBtnEl!: HTMLButtonElement;
  summarizeBtnEl!: HTMLButtonElement;
  messagesEl!: HTMLDivElement;
  inputEl!: HTMLTextAreaElement;
  statusEl!: HTMLDivElement;
  loading = false;
  lastAssistantMessage = "";
  private documentClickHandler: ((evt: MouseEvent) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LLMWikiPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_LLM_WIKI;
  }

  getDisplayText(): string {
    return "LLM Wiki";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("llm-wiki-chat-container");

    const toolbar = root.createDiv({ cls: "llm-wiki-toolbar" });
    this.sessionPickerEl = toolbar.createDiv({ cls: "llm-wiki-session-picker" });
    this.sessionTriggerEl = this.sessionPickerEl.createEl("button", {
      text: "New Session",
      cls: "llm-wiki-session-trigger"
    });
    this.sessionTriggerEl.setAttribute("aria-haspopup", "listbox");
    this.sessionTriggerEl.setAttribute("aria-expanded", "false");
    this.sessionMenuEl = this.sessionPickerEl.createDiv({ cls: "llm-wiki-session-menu" });
    this.sessionMenuEl.style.display = "none";

    const newBtn = toolbar.createEl("button", { text: "+ New Session" });
    this.renameBtnEl = toolbar.createEl("button", { text: "Rename" });
    this.summarizeBtnEl = toolbar.createEl("button", { text: "Summarize Session" });

    this.messagesEl = root.createDiv({ cls: "llm-wiki-messages" });

    const inputWrap = root.createDiv({ cls: "llm-wiki-input-wrap" });
    this.inputEl = inputWrap.createEl("textarea");
    const sendBtn = inputWrap.createEl("button", { text: "Send" });
    this.statusEl = root.createDiv({ cls: "llm-wiki-status" });

    this.inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && !evt.shiftKey) {
        evt.preventDefault();
        void this.onSend();
      }
    });
    this.sessionTriggerEl.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      this.setSessionMenuOpen(!this.sessionMenuOpen);
    });
    sendBtn.addEventListener("click", () => void this.onSend());
    newBtn.addEventListener("click", () => void this.createNewSession());
    this.renameBtnEl.addEventListener("click", () => void this.renameActiveSession());
    this.summarizeBtnEl.addEventListener("click", () => void this.runSummarize());

    this.documentClickHandler = (evt: MouseEvent) => {
      if (!this.sessionMenuOpen) return;
      const target = evt.target as Node | null;
      if (!target) return;
      if (!this.sessionPickerEl.contains(target)) {
        this.setSessionMenuOpen(false);
      }
    };
    document.addEventListener("click", this.documentClickHandler, true);

    await this.refreshSessionSelector();
    if (!this.session) {
      await this.createNewSession();
    } else {
      this.renderMessages();
    }
    this.updateToolbarState();
  }

  async onClose(): Promise<void> {
    if (this.documentClickHandler) {
      document.removeEventListener("click", this.documentClickHandler, true);
      this.documentClickHandler = null;
    }
    this.containerEl.empty();
  }

  private async onSend(): Promise<void> {
    if (this.loading) return;
    const text = this.inputEl.value.trim();
    if (!text || !this.session) return;

    this.inputEl.value = "";
    await this.addMessage("user", text);
    const cmd = SlashCommandParser.parse(text);

    if (cmd) {
      await this.dispatchSlash(cmd.command, cmd.args);
      return;
    }

    this.loading = true;
    this.setStatus("Thinking...");

    try {
      const provider = ProviderFactory.create(this.plugin.settings);
      const schema = await SchemaLoader.load(this.app.vault, this.plugin.settings);
      const { QueryService } = await import("../features/query/QueryService");
      const query = new QueryService(this.app.vault, provider, schema, this.plugin.settings);

      const bubble = this.addAssistantBubble();
      let full = "";
      const result = await query.query(text, this.session.messages.slice(0, -1), (chunk) => {
        full += chunk;
        bubble.textContent = full;
      });
      this.lastAssistantMessage = result;
      await this.addMessage("assistant", result);
      await new WikiManager(this.app.vault, this.plugin.settings.wikiPath).appendToLog(`query | ${text.slice(0, 80)}`, {
        session_id: this.session.id,
        response_chars: result.length
      });
      await this.tryAutoTitle();
    } catch (error) {
      new Notice(`LLM call failed: ${String(error)}`);
    } finally {
      this.loading = false;
      this.setStatus("");
    }
  }

  private async dispatchSlash(command: string, args: string): Promise<void> {
    switch (command) {
      case "summarize":
        await this.runSummarize();
        break;
      default:
        await this.plugin.handleSlashCommand(command, args, this);
        break;
    }
  }

  async createNewSession(): Promise<void> {
    this.session = await this.plugin.sessionStore.createSession();
    await this.refreshSessionSelector();
    this.renderMessages();
    this.updateToolbarState();
  }

  async switchSession(id: string): Promise<void> {
    if (!id) return;
    this.session = await this.plugin.sessionStore.loadSession(id);
    this.syncSessionTriggerLabel();
    this.setSessionMenuOpen(false);
    this.renderMessages();
    this.updateToolbarState();
  }

  async refreshSessionSelector(): Promise<void> {
    const sessions = (await this.plugin.sessionStore.listSessions()) as SessionListItem[];
    this.sessionItems = sessions;

    if (this.session && !sessions.some((item) => item.id === this.session?.id)) {
      this.session = null;
    }

    if (!this.session && sessions.length) {
      this.session = await this.plugin.sessionStore.loadSession(sessions[0].id);
    }

    this.renderSessionMenu();
    this.syncSessionTriggerLabel();
  }

  async addMessage(role: "user" | "assistant", content: string): Promise<void> {
    if (!this.session) return;
    const message = { role, content, timestamp: new Date().toISOString() } as const;
    this.session = await this.plugin.sessionStore.appendMessage(
      this.session.id,
      message,
      this.plugin.settings.maxMessagesPerSession
    );
    this.renderMessages();
    this.updateToolbarState();
  }

  private renderMessages(): void {
    this.messagesEl.empty();
    if (!this.session) return;
    if (this.session.summary) {
      const summaryBlock = this.messagesEl.createDiv({ cls: "llm-wiki-bubble llm-wiki-bubble-assistant" });
      const summaryContent = summaryBlock.createDiv({ cls: "llm-wiki-message-content" });
      void this.renderAssistantMarkdown(summaryContent, `### Session Summary\n\n${this.session.summary}`);
    }
    for (const msg of this.session.messages) {
      const bubble = this.messagesEl.createDiv({
        cls: `llm-wiki-bubble ${msg.role === "user" ? "llm-wiki-bubble-user" : "llm-wiki-bubble-assistant"}`
      });
      const contentEl = bubble.createDiv({ cls: "llm-wiki-message-content" });
      if (msg.role === "assistant") {
        void this.renderAssistantMarkdown(contentEl, msg.content);
      } else {
        contentEl.textContent = msg.content;
      }
      if (msg.role === "assistant") {
        const saveBtn = bubble.createEl("button", { text: "Save to Wiki" });
        saveBtn.addEventListener("click", () => {
          this.lastAssistantMessage = msg.content;
          void this.plugin.saveLastAssistantMessage(this);
        });
      }
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private addAssistantBubble(): HTMLDivElement {
    const bubble = this.messagesEl.createDiv({ cls: "llm-wiki-bubble llm-wiki-bubble-assistant" });
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return bubble;
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  appendAssistantMessageStreamed(content: string): void {
    const bubble = this.addAssistantBubble();
    const contentEl = bubble.createDiv({ cls: "llm-wiki-message-content" });
    void this.renderAssistantMarkdown(contentEl, content);
    const saveBtn = bubble.createEl("button", { text: "Save to Wiki" });
    saveBtn.addEventListener("click", () => {
      this.lastAssistantMessage = content;
      void this.plugin.saveLastAssistantMessage(this);
    });
    this.lastAssistantMessage = content;
  }

  private async renderAssistantMarkdown(container: HTMLElement, markdown: string): Promise<void> {
    container.empty();
    try {
      await MarkdownRenderer.render(this.app, markdown, container, "", this);
      this.enhanceRenderedMarkdown(container);
    } catch {
      container.textContent = markdown;
    }
  }

  private enhanceRenderedMarkdown(container: HTMLElement): void {
    const tables = Array.from(container.querySelectorAll("table"));
    for (const table of tables) {
      const parent = table.parentElement;
      if (!parent || parent.classList.contains("llm-wiki-table-scroll")) continue;
      const wrap = document.createElement("div");
      wrap.className = "llm-wiki-table-scroll";
      parent.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
  }

  private async runSummarize(): Promise<void> {
    if (!this.session || this.session.messages.length < 2) {
      new Notice("Not enough messages to summarize.");
      return;
    }
    this.loading = true;
    this.setStatus("Summarizing...");
    this.updateToolbarState();
    try {
      const provider = ProviderFactory.create(this.plugin.settings);
      const prompt = this.session.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
      let summary = "";
      for await (const chunk of provider.chat([
        { role: "system", content: "Summarize this session into concise context memory.", timestamp: "" },
        { role: "user", content: prompt, timestamp: "" }
      ])) {
        summary += chunk;
      }
      this.session.summary = summary;
      this.session.summaryUpToIndex = this.session.messages.length - 1;
      await this.plugin.sessionStore.saveSession(this.session);
      this.renderMessages();
      new Notice("Session summarized");
    } catch (error) {
      new Notice(`Summarize failed: ${String(error)}`);
    } finally {
      this.loading = false;
      this.setStatus("");
      this.updateToolbarState();
    }
  }

  private async tryAutoTitle(): Promise<void> {
    if (!this.session || this.session.title !== "New Session") return;
    if (this.session.messages.length < 2) return;
    const provider = ProviderFactory.create(this.plugin.settings);
    let title = "";
    for await (const chunk of provider.chat([
      { role: "system", content: "Generate a concise 3-6 word title for this chat.", timestamp: "" },
      {
        role: "user",
        content: this.session.messages.slice(0, 2).map((m) => m.content).join("\n\n"),
        timestamp: ""
      }
    ])) {
      title += chunk;
    }
    title = title.replace(/[\n#*`]/g, "").trim().slice(0, 80) || "Session";
    this.session.title = title;
    await this.plugin.sessionStore.saveSession(this.session);
    await this.refreshSessionSelector();
  }

  private async renameActiveSession(): Promise<void> {
    if (!this.session) return;
    let next = this.tryPromptRename(this.session.title);
    if (next === null) {
      next = await this.promptRenameWithModal(this.session.title);
    }
    next = next?.trim() ?? null;
    if (!next) {
      new Notice("Rename cancelled.");
      return;
    }
    if (next === this.session.title) return;
    await this.plugin.sessionStore.updateTitle(this.session.id, next);
    this.session.title = next;
    await this.refreshSessionSelector();
    this.updateToolbarState();
    new Notice(`Session renamed to: ${next}`);
  }

  private async deleteSessionById(id: string, title: string): Promise<void> {
    const confirmed = await this.confirmDeleteSession(title);
    if (!confirmed) {
      new Notice("Delete cancelled.");
      return;
    }

    await this.plugin.sessionStore.deleteSession(id);

    const sessions = await this.plugin.sessionStore.listSessions();
    const deletedCurrent = this.session?.id === id;
    if (!sessions.length) {
      await this.createNewSession();
      new Notice(`Session deleted: ${title}`);
      this.setSessionMenuOpen(false);
      return;
    }

    if (deletedCurrent) {
      this.session = await this.plugin.sessionStore.loadSession(sessions[0].id);
      this.renderMessages();
    }

    await this.refreshSessionSelector();
    this.updateToolbarState();
    this.setSessionMenuOpen(false);
    new Notice(`Session deleted: ${title}`);
  }

  private syncSessionTriggerLabel(): void {
    if (!this.sessionTriggerEl) return;
    this.sessionTriggerEl.textContent = this.session?.title ?? "New Session";
  }

  private setSessionMenuOpen(open: boolean): void {
    if (!this.sessionMenuEl || !this.sessionTriggerEl) return;
    this.sessionMenuOpen = open;
    this.sessionMenuEl.style.display = open ? "block" : "none";
    this.sessionTriggerEl.setAttribute("aria-expanded", open ? "true" : "false");
  }

  private renderSessionMenu(): void {
    this.sessionMenuEl.empty();
    if (!this.sessionItems.length) {
      this.sessionMenuEl.createDiv({ cls: "llm-wiki-session-empty", text: "No sessions" });
      return;
    }

    for (const item of this.sessionItems) {
      const row = this.sessionMenuEl.createDiv({ cls: "llm-wiki-session-option-row" });
      const titleBtn = row.createEl("button", {
        text: item.title,
        cls: "llm-wiki-session-option"
      });
      titleBtn.setAttribute("type", "button");
      if (this.session?.id === item.id) {
        titleBtn.addClass("is-active");
      }
      titleBtn.addEventListener("click", (evt) => {
        evt.preventDefault();
        void this.switchSession(item.id);
      });
      titleBtn.addEventListener("dblclick", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        void this.renameSessionById(item.id);
      });

      const delBtn = row.createEl("button", { text: "X", cls: "llm-wiki-session-option-delete" });
      delBtn.setAttribute("type", "button");
      delBtn.setAttribute("aria-label", `Delete session ${item.title}`);
      delBtn.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        void this.deleteSessionById(item.id, item.title);
      });
    }
  }

  private async renameSessionById(id: string): Promise<void> {
    if (this.session?.id !== id) {
      await this.switchSession(id);
    }
    await this.renameActiveSession();
  }

  private tryPromptRename(currentTitle: string): string | null {
    try {
      if (typeof window.prompt !== "function") return null;
      return window.prompt("Rename session", currentTitle);
    } catch {
      return null;
    }
  }

  private async promptRenameWithModal(currentTitle: string): Promise<string | null> {
    return new Promise((resolve) => {
      class RenameSessionModal extends Modal {
        private inputEl!: HTMLInputElement;
        private resolved = false;

        constructor(
          app: LLMWikiView["app"],
          private readonly initialValue: string,
          private readonly onResolve: (value: string | null) => void
        ) {
          super(app);
        }

        onOpen(): void {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h3", { text: "Rename session" });

          this.inputEl = contentEl.createEl("input", { type: "text" });
          this.inputEl.value = this.initialValue;
          this.inputEl.style.width = "100%";
          this.inputEl.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") {
              evt.preventDefault();
              this.submit();
            }
            if (evt.key === "Escape") {
              evt.preventDefault();
              this.cancel();
            }
          });

          const actions = contentEl.createDiv();
          actions.style.display = "flex";
          actions.style.justifyContent = "flex-end";
          actions.style.gap = "8px";
          actions.style.marginTop = "12px";

          const cancelBtn = actions.createEl("button", { text: "Cancel" });
          cancelBtn.addEventListener("click", () => this.cancel());

          const saveBtn = actions.createEl("button", { text: "Save" });
          saveBtn.addClass("mod-cta");
          saveBtn.addEventListener("click", () => this.submit());

          window.setTimeout(() => {
            this.inputEl.focus();
            this.inputEl.select();
          }, 0);
        }

        onClose(): void {
          this.contentEl.empty();
          if (!this.resolved) {
            this.onResolve(null);
          }
        }

        private submit(): void {
          this.resolved = true;
          this.onResolve(this.inputEl.value);
          this.close();
        }

        private cancel(): void {
          this.resolved = true;
          this.onResolve(null);
          this.close();
        }
      }

      const modal = new RenameSessionModal(this.app, currentTitle, resolve);
      modal.open();
    });
  }

  private async confirmDeleteSession(currentTitle: string): Promise<boolean> {
    const message = `Delete session "${currentTitle}"? This cannot be undone.`;
    try {
      if (typeof window.confirm === "function") {
        return window.confirm(message);
      }
    } catch {
      // Fall through to modal confirmation.
    }

    return new Promise((resolve) => {
      class ConfirmDeleteModal extends Modal {
        private resolved = false;

        constructor(
          app: LLMWikiView["app"],
          private readonly msg: string,
          private readonly onResolve: (value: boolean) => void
        ) {
          super(app);
        }

        onOpen(): void {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h3", { text: "Delete session" });
          contentEl.createEl("p", { text: this.msg });

          const actions = contentEl.createDiv();
          actions.style.display = "flex";
          actions.style.justifyContent = "flex-end";
          actions.style.gap = "8px";
          actions.style.marginTop = "12px";

          const cancelBtn = actions.createEl("button", { text: "No" });
          cancelBtn.addEventListener("click", () => this.cancel());

          const deleteBtn = actions.createEl("button", { text: "Yes" });
          deleteBtn.addClass("mod-warning");
          deleteBtn.addEventListener("click", () => this.confirm());
        }

        onClose(): void {
          this.contentEl.empty();
          if (!this.resolved) {
            this.onResolve(false);
          }
        }

        private confirm(): void {
          this.resolved = true;
          this.onResolve(true);
          this.close();
        }

        private cancel(): void {
          this.resolved = true;
          this.onResolve(false);
          this.close();
        }
      }

      const modal = new ConfirmDeleteModal(this.app, message, resolve);
      modal.open();
    });
  }

  private updateToolbarState(): void {
    if (!this.renameBtnEl || !this.summarizeBtnEl || !this.sessionTriggerEl) return;
    const hasSession = Boolean(this.session);
    const canSummarize = hasSession && (this.session?.messages.length ?? 0) >= 2 && !this.loading;

    this.renameBtnEl.disabled = !hasSession || this.loading;
    this.sessionTriggerEl.disabled = !hasSession && !this.sessionItems.length;
    this.summarizeBtnEl.disabled = !canSummarize;

    if (!hasSession) {
      this.renameBtnEl.title = "No active session";
      this.summarizeBtnEl.title = "No active session";
      return;
    }
    this.renameBtnEl.title = this.loading ? "Busy" : "Rename current session";
    this.summarizeBtnEl.title = canSummarize
      ? "Summarize current session"
      : "Need at least 2 messages to summarize";
  }
}