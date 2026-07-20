import type { LLMProvider } from './types.js';
import { LLMError } from './types.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { DeepSeekProvider } from './providers/deepseek-provider.js';

/**
 * Provider 注册表
 * 管理 LLM Provider 实例的注册与获取
 */
export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  /** 注册一个 Provider */
  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** 获取指定 Provider */
  get(name: string): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new LLMError(`Provider "${name}" 未注册`, name);
    }
    return provider;
  }

  /** 列出所有已注册 Provider 名称 */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /** 检查 Provider 是否已注册 */
  has(name: string): boolean {
    return this.providers.has(name);
  }
}

/**
 * 创建 Provider 实例的工厂函数
 * @param name - Provider 名称（'openai' | 'anthropic' | 'deepseek'）
 * @param apiKey - API Key
 * @returns LLMProvider 实例
 */
export function createProvider(name: string, apiKey: string): LLMProvider {
  switch (name.toLowerCase()) {
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'deepseek':
      return new DeepSeekProvider(apiKey);
    default:
      throw new LLMError(`未知的 Provider: ${name}`, name);
  }
}

/**
 * 创建并填充默认注册表
 */
export function createDefaultRegistry(apiKeys: Record<string, string>): ProviderRegistry {
  const registry = new ProviderRegistry();
  if (apiKeys.openai) {
    registry.register(new OpenAIProvider(apiKeys.openai));
  }
  if (apiKeys.anthropic) {
    registry.register(new AnthropicProvider(apiKeys.anthropic));
  }
  if (apiKeys.deepseek) {
    registry.register(new DeepSeekProvider(apiKeys.deepseek));
  }
  return registry;
}
