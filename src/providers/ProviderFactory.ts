import type { LLMWikiSettings } from "../types";
import type { LLMProvider } from "./LLMProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { GeminiProvider } from "./GeminiProvider";
import { OllamaProvider } from "./OllamaProvider";
import { OpenAIProvider } from "./OpenAIProvider";

export class ProviderFactory {
  static create(settings: LLMWikiSettings): LLMProvider {
    if (settings.provider === "anthropic") return new AnthropicProvider(settings);
    if (settings.provider === "ollama") return new OllamaProvider(settings);
    if (settings.provider === "gemini") return new GeminiProvider(settings);
    return new OpenAIProvider(settings);
  }
}