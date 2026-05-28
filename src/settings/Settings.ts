import type { LLMWikiSettings, ProviderConfig, ProviderType } from "../types";

export const PROVIDER_DEFAULTS: Record<ProviderType, Omit<ProviderConfig, "provider">> = {
  openai: {
    apiKey: "",
    model: "gpt-5.4-mini",
    baseUrl: "",
    azureApiVersion: "2024-10-21"
  },
  anthropic: {
    apiKey: "",
    model: "claude-sonnet-4-6",
    baseUrl: ""
  },
  ollama: {
    apiKey: "",
    model: "llama3.1",
    baseUrl: "http://127.0.0.1:11434/api/chat"
  },
  gemini: {
    apiKey: "",
    model: "gemini-2.5-flash",
    baseUrl: ""
  },
  custom: {
    apiKey: "",
    model: "",
    baseUrl: ""
  }
};

export function createDefaultProviderConfigs(): ProviderConfig[] {
  return (Object.keys(PROVIDER_DEFAULTS) as ProviderType[]).map((provider) => ({
    provider,
    ...PROVIDER_DEFAULTS[provider]
  }));
}

export function resolveProviderConfig(settings: LLMWikiSettings, provider: ProviderType = settings.provider): ProviderConfig {
  const fromArray = settings.providerConfigs?.find((x) => x.provider === provider);
  if (fromArray) return fromArray;

  const fallback = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    apiKey: settings.apiKey ?? fallback.apiKey,
    model: settings.model ?? fallback.model,
    baseUrl: settings.baseUrl ?? fallback.baseUrl,
    azureApiVersion: settings.azureApiVersion ?? fallback.azureApiVersion
  };
}

export function upsertProviderConfig(
  settings: LLMWikiSettings,
  provider: ProviderType,
  patch: Partial<Omit<ProviderConfig, "provider">>
): void {
  const existing = settings.providerConfigs?.find((x) => x.provider === provider);
  if (existing) {
    Object.assign(existing, patch);
    return;
  }
  if (!Array.isArray(settings.providerConfigs)) {
    settings.providerConfigs = [];
  }
  settings.providerConfigs.push({
    provider,
    ...PROVIDER_DEFAULTS[provider],
    ...patch
  });
}

export const DEFAULT_SETTINGS: LLMWikiSettings = {
  provider: "openai",
  providerConfigs: createDefaultProviderConfigs(),
  rawSourcesPath: "raw",
  wikiPath: "wiki",
  sessionsPath: ".llm-wiki/sessions",
  wikiSubdirs: ["sources", "entities", "concepts", "analyses"],
  autoIngest: true,
  autoIngestDebounceMs: 2000,
  useWikiSchemaFile: true,
  systemPrompt: "You are an assistant that maintains a structured Obsidian wiki.",
  defaultPageTypeOverride: "",
  relationTypesOverride: "",
  outputLanguage: "zh-TW",
  lintSchedule: "off",
  lintTimeOfDay: "09:00",
  lintCatchUpOnStartup: false,
  lastLintRunAt: "",
  contextWindowSize: 20,
  maxMessagesPerSession: 500
};