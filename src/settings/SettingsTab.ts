import { PluginSettingTab, Setting } from "obsidian";
import { resolveProviderConfig, upsertProviderConfig } from "./Settings";
import type LLMWikiPlugin from "../main";

export class LLMWikiSettingsTab extends PluginSettingTab {
  plugin: LLMWikiPlugin;

  constructor(app: any, plugin: LLMWikiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("llm-wiki-settings-root");

    containerEl.createEl("h2", {
      text: "LLM Wiki Settings",
      cls: "llm-wiki-settings-title"
    });

    const isOpenAI = this.plugin.settings.provider === "openai";
    const isAnthropic = this.plugin.settings.provider === "anthropic";
    const isOllama = this.plugin.settings.provider === "ollama";
    const isGemini = this.plugin.settings.provider === "gemini";
    const activeConfig = resolveProviderConfig(this.plugin.settings);

    const hint = containerEl.createEl("div", { cls: "setting-item-description llm-wiki-settings-hint" });
    if (isOpenAI) {
      hint.setText(
        "OpenAI mode also supports Azure OpenAI. For Azure, set Base URL to your endpoint (or deployment URL), set API Key, and set Model to your deployment name. Settings are auto-saved."
      );
    } else if (isAnthropic) {
      hint.setText("Anthropic mode: set API Key and Model. Settings are auto-saved.");
    } else if (isOllama) {
      hint.setText("Ollama mode: set Base URL (default http://127.0.0.1:11434/api/chat) and Model. Settings are auto-saved.");
    } else if (isGemini) {
      hint.setText("Gemini mode: set API Key from Google AI Studio (aistudio.google.com). Model defaults to gemini-2.0-flash. Base URL is optional (leave blank for default). Settings are auto-saved.");
    }

    const providerSection = this.createSection(containerEl, "Provider", "Configure the LLM service used for all operations.");

    new Setting(providerSection)
      .setName("Provider")
      .setDesc("OpenAI, Anthropic, Ollama, Gemini")
      .addDropdown((d) =>
        d
          .addOption("openai", "OpenAI")
          .addOption("anthropic", "Anthropic")
          .addOption("ollama", "Ollama")
          .addOption("gemini", "Google Gemini")
          .setValue(this.plugin.settings.provider)
          .onChange(async (v) => {
            this.plugin.settings.provider = v as any;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    let showApiKey = false;
    let apiKeyInputEl: HTMLInputElement | null = null;

    new Setting(providerSection)
      .setName("API Key")
      .addText((t) => {
        apiKeyInputEl = t.inputEl;
        apiKeyInputEl.type = "password";
        apiKeyInputEl.autocomplete = "off";
        apiKeyInputEl.spellcheck = false;

        t.setPlaceholder("sk-...").setValue(activeConfig.apiKey).onChange(async (v) => {
          upsertProviderConfig(this.plugin.settings, this.plugin.settings.provider, { apiKey: v.trim() });
          await this.plugin.saveSettings();
        });
      })
      .addExtraButton((btn) => {
        const applyMaskState = () => {
          if (!apiKeyInputEl) return;
          apiKeyInputEl.type = showApiKey ? "text" : "password";
          btn.setIcon(showApiKey ? "eye-off" : "eye");
          btn.setTooltip(showApiKey ? "Hide API key" : "Show API key");
        };

        btn.onClick(() => {
          showApiKey = !showApiKey;
          applyMaskState();
        });

        applyMaskState();
      });

    new Setting(providerSection)
      .setName("Model")
      .addText((t) =>
        t.setValue(activeConfig.model).onChange(async (v) => {
          upsertProviderConfig(this.plugin.settings, this.plugin.settings.provider, { model: v.trim() });
          await this.plugin.saveSettings();
        })
      );

    new Setting(providerSection)
      .setName("Base URL")
      .setDesc(
        isOpenAI
          ? "OpenAI: optional override. Azure OpenAI: endpoint or deployment URL."
          : isOllama
            ? "Ollama chat endpoint URL."
            : "Provider endpoint override (optional)."
      )
      .addText((t) =>
        t.setValue(activeConfig.baseUrl).onChange(async (v) => {
          upsertProviderConfig(this.plugin.settings, this.plugin.settings.provider, { baseUrl: v.trim() });
          await this.plugin.saveSettings();
        })
      );

    if (isOpenAI) {
      new Setting(providerSection)
        .setName("Azure OpenAI API Version")
        .setDesc("Used when Base URL is an Azure OpenAI endpoint. Example: 2024-10-21")
        .addText((t) =>
          t.setValue(activeConfig.azureApiVersion || "2024-10-21").onChange(async (v) => {
            upsertProviderConfig(this.plugin.settings, this.plugin.settings.provider, {
              azureApiVersion: v.trim() || "2024-10-21"
            });
            await this.plugin.saveSettings();
          })
        );
    }

    const vaultSection = this.createSection(containerEl, "Vault Folders", "Folders used for raw sources, generated wiki pages, and session storage.");

    new Setting(vaultSection)
      .setName("Raw sources path")
      .addText((t) =>
        t.setValue(this.plugin.settings.rawSourcesPath).onChange(async (v) => {
          this.plugin.settings.rawSourcesPath = v.trim() || "raw";
          await this.plugin.saveSettings();
        })
      );

    new Setting(vaultSection)
      .setName("Wiki path")
      .addText((t) =>
        t.setValue(this.plugin.settings.wikiPath).onChange(async (v) => {
          this.plugin.settings.wikiPath = v.trim() || "wiki";
          await this.plugin.saveSettings();
        })
      );

    new Setting(vaultSection)
      .setName("Sessions path")
      .addText((t) =>
        t.setValue(this.plugin.settings.sessionsPath).onChange(async (v) => {
          this.plugin.settings.sessionsPath = v.trim() || ".llm-wiki/sessions";
          await this.plugin.saveSettings();
        })
      );

    const schemaSection = this.createSection(containerEl, "Schema & Relations", "Control wiki schema loading and relation type overrides.");

    new Setting(schemaSection)
      .setName("Use WIKI_SCHEMA.md")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useWikiSchemaFile).onChange(async (v) => {
          this.plugin.settings.useWikiSchemaFile = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(schemaSection)
      .setName("System prompt override")
      .addText((t) =>
        t.setValue(this.plugin.settings.systemPrompt).onChange(async (v) => {
          this.plugin.settings.systemPrompt = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(schemaSection)
      .setName("Relation types override (comma separated)")
      .addText((t) =>
        t.setValue(this.plugin.settings.relationTypesOverride).onChange(async (v) => {
          this.plugin.settings.relationTypesOverride = v;
          await this.plugin.saveSettings();
        })
      );

    const ingestSection = this.createSection(containerEl, "Ingest", "Configure automatic ingestion behavior and source monitoring.");

    new Setting(ingestSection)
      .setName("Auto ingest")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoIngest).onChange(async (v) => {
          this.plugin.settings.autoIngest = v;
          await this.plugin.saveSettings();
        })
      );

    const lintSection = this.createSection(containerEl, "Lint", "Set the schedule and catch-up behavior for wiki health checks.");

    new Setting(lintSection)
      .setName("Lint schedule")
      .addDropdown((d) =>
        d
          .addOption("off", "Off")
          .addOption("daily", "Daily")
          .addOption("weekly", "Weekly")
          .setValue(this.plugin.settings.lintSchedule)
          .onChange(async (v) => {
            this.plugin.settings.lintSchedule = v as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(lintSection)
      .setName("Lint time (HH:mm)")
      .setDesc("Used for Daily/Weekly schedules. Example: 09:00")
      .addText((t) =>
        t.setValue(this.plugin.settings.lintTimeOfDay).onChange(async (v) => {
          const raw = v.trim();
          const valid = /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw);
          this.plugin.settings.lintTimeOfDay = valid ? raw : "09:00";
          await this.plugin.saveSettings();
        })
      );

    new Setting(lintSection)
      .setName("Catch up missed lint on startup")
      .setDesc("If enabled, run one lint at startup when a scheduled run was missed while Obsidian was closed.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.lintCatchUpOnStartup).onChange(async (v) => {
          this.plugin.settings.lintCatchUpOnStartup = v;
          await this.plugin.saveSettings();
        })
      );

    const contextSection = this.createSection(containerEl, "Context", "Tune how much conversation history is sent to the LLM.");

    new Setting(contextSection)
      .setName("Context window size")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.contextWindowSize)).onChange(async (v) => {
          const num = Number(v);
          this.plugin.settings.contextWindowSize = Number.isFinite(num) && num > 0 ? num : 20;
          await this.plugin.saveSettings();
        })
      );
  }

  private createSection(containerEl: HTMLElement, title: string, description: string): HTMLElement {
    const section = containerEl.createDiv({ cls: "llm-wiki-settings-section" });
    section.createEl("h3", { text: title, cls: "llm-wiki-settings-section-title" });
    section.createEl("div", { text: description, cls: "setting-item-description llm-wiki-settings-section-desc" });
    return section;
  }
}
