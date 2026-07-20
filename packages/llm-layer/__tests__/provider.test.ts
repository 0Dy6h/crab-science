import { describe, it, expect } from 'vitest';
import {
  createProvider,
  createDefaultRegistry,
  ProviderRegistry,
  DeepSeekProvider,
  OpenAIProvider,
  AnthropicProvider,
  LLMError,
} from '../src/index.js';
import { DEEPSEEK_BASE_URL } from '@crab-science/shared';

// ============================================================
// DeepSeekProvider 单元测试
// ============================================================
describe('DeepSeekProvider', () => {
  describe('实例化', () => {
    it('应能正常创建实例', () => {
      const provider = new DeepSeekProvider('sk-test-key');
      expect(provider).toBeInstanceOf(DeepSeekProvider);
    });

    it('应是 OpenAIProvider 的子类', () => {
      const provider = new DeepSeekProvider('sk-test-key');
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('name 属性应为 deepseek', () => {
      const provider = new DeepSeekProvider('sk-test-key');
      expect(provider.name).toBe('deepseek');
    });
  });

  describe('listModels', () => {
    it('应返回 2 个模型', () => {
      const provider = new DeepSeekProvider('sk-test-key');
      const models = provider.listModels();
      expect(models).toHaveLength(2);
    });

    it('应包含 deepseek-chat 模型', () => {
      const provider = new DeepSeekProvider('sk-test-key');
      const models = provider.listModels();
      const chatModel = models.find((m) => m.id === 'deepseek-chat');
      expect(chatModel).toBeDefined();
      expect(chatModel!.name).toBe('DeepSeek Chat');
      expect(chatModel!.provider).toBe('deepseek');
      expect(chatModel!.contextWindow).toBe(64000);
    });

    it('应包含 deepseek-reasoner 模型', () => {
      const provider = new DeepSeekProvider('sk-test-key');
      const models = provider.listModels();
      const reasonerModel = models.find((m) => m.id === 'deepseek-reasoner');
      expect(reasonerModel).toBeDefined();
      expect(reasonerModel!.name).toBe('DeepSeek Reasoner');
      expect(reasonerModel!.provider).toBe('deepseek');
      expect(reasonerModel!.contextWindow).toBe(64000);
    });

    it('所有模型的 provider 字段应为 deepseek', () => {
      const provider = new DeepSeekProvider('sk-test-key');
      const models = provider.listModels();
      expect(models.every((m) => m.provider === 'deepseek')).toBe(true);
    });

    it('所有模型应包含定价信息', () => {
      const provider = new DeepSeekProvider('sk-test-key');
      const models = provider.listModels();
      expect(models.every((m) => m.pricing.inputPerMillion > 0)).toBe(true);
      expect(models.every((m) => m.pricing.outputPerMillion > 0)).toBe(true);
    });
  });
});

// ============================================================
// createProvider 工厂函数测试
// ============================================================
describe('createProvider', () => {
  it('应创建 OpenAIProvider', () => {
    const provider = createProvider('openai', 'sk-test');
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it('应创建 AnthropicProvider', () => {
    const provider = createProvider('anthropic', 'sk-ant-test');
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('应创建 DeepSeekProvider', () => {
    const provider = createProvider('deepseek', 'sk-ds-test');
    expect(provider).toBeInstanceOf(DeepSeekProvider);
    expect(provider.name).toBe('deepseek');
  });

  it('名称大小写不敏感（DEEPSEEK 大写）', () => {
    const provider = createProvider('DEEPSEEK', 'sk-ds-test');
    expect(provider).toBeInstanceOf(DeepSeekProvider);
    expect(provider.name).toBe('deepseek');
  });

  it('名称大小写不敏感（DeepSeek 混合大小写）', () => {
    const provider = createProvider('DeepSeek', 'sk-ds-test');
    expect(provider).toBeInstanceOf(DeepSeekProvider);
  });

  it('未知 provider 应抛出 LLMError', () => {
    expect(() => createProvider('unknown', 'sk-test')).toThrow(LLMError);
  });

  it('未知 provider 错误信息应包含 provider 名称', () => {
    try {
      createProvider('gemini', 'sk-test');
      expect.fail('应抛出错误');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain('gemini');
    }
  });
});

// ============================================================
// createDefaultRegistry 测试
// ============================================================
describe('createDefaultRegistry', () => {
  it('应注册所有三个 provider（提供全部 key）', () => {
    const registry = createDefaultRegistry({
      openai: 'sk-openai',
      anthropic: 'sk-ant',
      deepseek: 'sk-ds',
    });

    expect(registry.list()).toHaveLength(3);
    expect(registry.has('openai')).toBe(true);
    expect(registry.has('anthropic')).toBe(true);
    expect(registry.has('deepseek')).toBe(true);
  });

  it('应仅注册 deepseek（仅提供 deepseek key）', () => {
    const registry = createDefaultRegistry({
      deepseek: 'sk-ds',
    });

    expect(registry.list()).toHaveLength(1);
    expect(registry.has('deepseek')).toBe(true);
    expect(registry.has('openai')).toBe(false);
    expect(registry.has('anthropic')).toBe(false);
  });

  it('未提供 deepseek key 时不应注册 deepseek', () => {
    const registry = createDefaultRegistry({
      openai: 'sk-openai',
      anthropic: 'sk-ant',
    });

    expect(registry.has('deepseek')).toBe(false);
  });

  it('空 apiKeys 应返回空注册表', () => {
    const registry = createDefaultRegistry({});
    expect(registry.list()).toHaveLength(0);
  });

  it('注册的 deepseek provider 应为 DeepSeekProvider 实例', () => {
    const registry = createDefaultRegistry({
      deepseek: 'sk-ds',
    });

    const provider = registry.get('deepseek');
    expect(provider).toBeInstanceOf(DeepSeekProvider);
    expect(provider.name).toBe('deepseek');
  });
});

// ============================================================
// ProviderRegistry 测试（回归）
// ============================================================
describe('ProviderRegistry', () => {
  it('应注册并获取 provider', () => {
    const registry = new ProviderRegistry();
    const provider = new DeepSeekProvider('sk-test');
    registry.register(provider);

    expect(registry.get('deepseek')).toBe(provider);
  });

  it('获取未注册的 provider 应抛出 LLMError', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.get('nonexistent')).toThrow(LLMError);
  });

  it('has 应正确返回注册状态', () => {
    const registry = new ProviderRegistry();
    expect(registry.has('deepseek')).toBe(false);

    registry.register(new DeepSeekProvider('sk-test'));
    expect(registry.has('deepseek')).toBe(true);
  });

  it('list 应返回所有已注册 provider 名称', () => {
    const registry = new ProviderRegistry();
    registry.register(new OpenAIProvider('sk-test'));
    registry.register(new DeepSeekProvider('sk-test'));

    const names = registry.list();
    expect(names).toContain('openai');
    expect(names).toContain('deepseek');
    expect(names).toHaveLength(2);
  });
});
