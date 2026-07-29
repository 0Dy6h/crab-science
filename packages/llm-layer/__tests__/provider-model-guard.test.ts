import { describe, it, expect } from 'vitest';
import { OpenAIProvider, AnthropicProvider, DeepSeekProvider, LLMError } from '../src/index.js';
import type { LLMOptions } from '../src/index.js';

/**
 * Provider 空模型防线 (EVO-001 边界)
 *
 * 进化调用曾硬编码 model: ''，会被真实 Anthropic/OpenAI/DeepSeek API 以 400 拒绝。
 * 现在 complete() 在边界快速失败，避免浪费一次往返、也让缺陷在测试中可见。
 */
describe('Provider 空模型防线', () => {
  const baseOptions: LLMOptions = {
    model: '',
    systemPrompt: 'x',
    temperature: 0.3,
    maxTokens: 16,
  };

  async function firstEvent(gen: AsyncGenerator<unknown>): Promise<void> {
    // 触发 generator 主体执行（空模型应在产出任何事件前抛错）
    await gen.next();
  }

  it('OpenAIProvider 空模型应抛 LLMError', async () => {
    const p = new OpenAIProvider('sk-test');
    await expect(firstEvent(p.complete([{ role: 'user', content: 'hi' }], baseOptions))).rejects.toBeInstanceOf(LLMError);
  });

  it('AnthropicProvider 空模型应抛 LLMError', async () => {
    const p = new AnthropicProvider('sk-test');
    await expect(firstEvent(p.complete([{ role: 'user', content: 'hi' }], baseOptions))).rejects.toBeInstanceOf(LLMError);
  });

  it('DeepSeekProvider（继承 OpenAI）空模型应抛 LLMError', async () => {
    const p = new DeepSeekProvider('sk-test');
    await expect(firstEvent(p.complete([{ role: 'user', content: 'hi' }], baseOptions))).rejects.toBeInstanceOf(LLMError);
  });

  it('仅空白字符的模型名也应被拒绝', async () => {
    const p = new OpenAIProvider('sk-test');
    await expect(
      firstEvent(p.complete([{ role: 'user', content: 'hi' }], { ...baseOptions, model: '   ' })),
    ).rejects.toBeInstanceOf(LLMError);
  });
});
