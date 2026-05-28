export type ProviderType = "openai" | "anthropic" | "ollama" | "gemini" | "custom";
export type LintSchedule = "off" | "daily" | "weekly";
export type OutputLanguage = "zh-TW" | "en";

export interface ProviderConfig {
  provider: ProviderType;
  apiKey: string;
  model: string;
  baseUrl: string;
  azureApiVersion?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
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

export interface LLMWikiSettings {
  provider: ProviderType;
  providerConfigs: ProviderConfig[];
  // Legacy single-provider fields for backward compatibility and migration.
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  azureApiVersion?: string;
  rawSourcesPath: string;
  wikiPath: string;
  sessionsPath: string;
  wikiSubdirs: string[];
  autoIngest: boolean;
  autoIngestDebounceMs: number;
  useWikiSchemaFile: boolean;
  systemPrompt: string;
  defaultPageTypeOverride: string;
  relationTypesOverride: string;
  outputLanguage: OutputLanguage;
  lintSchedule: LintSchedule;
  lintTimeOfDay: string;
  lintCatchUpOnStartup: boolean;
  lastLintRunAt: string;
  contextWindowSize: number;
  maxMessagesPerSession: number;
}

export interface WikiSchema {
  systemPrompt: string;
  pageTypes: string[];
  relationTypes: string[];
  defaultPageType: string;
}