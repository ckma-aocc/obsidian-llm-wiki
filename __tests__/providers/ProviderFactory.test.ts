import { ProviderFactory } from "../../src/providers/ProviderFactory";
import { OpenAIProvider } from "../../src/providers/OpenAIProvider";
import { AnthropicProvider } from "../../src/providers/AnthropicProvider";
import { OllamaProvider } from "../../src/providers/OllamaProvider";
import { DEFAULT_SETTINGS } from "../../src/settings/Settings";

describe("ProviderFactory", () => {
  it("creates OpenAI provider by default", () => {
    const provider = ProviderFactory.create({ ...DEFAULT_SETTINGS, provider: "openai" });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it("creates Anthropic provider", () => {
    const provider = ProviderFactory.create({ ...DEFAULT_SETTINGS, provider: "anthropic" });
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it("creates Ollama provider", () => {
    const provider = ProviderFactory.create({ ...DEFAULT_SETTINGS, provider: "ollama" });
    expect(provider).toBeInstanceOf(OllamaProvider);
  });
});