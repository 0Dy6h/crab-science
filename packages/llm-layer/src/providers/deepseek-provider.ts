import { OpenAIProvider } from './openai-provider.js';
import type { ModelInfo } from '../types.js';
import { DEEPSEEK_BASE_URL } from '@crab-science/shared';

/**
 * DeepSeek Provider 实现
 * DeepSeek API 完全兼容 OpenAI 格式，通过继承 OpenAIProvider 复用全部逻辑，
 * 仅需指定不同的 base URL 与模型列表。
 */
export class DeepSeekProvider extends OpenAIProvider {
  readonly name = 'deepseek';

  constructor(apiKey: string) {
    super(apiKey, DEEPSEEK_BASE_URL);
  }

  /** 列出 DeepSeek 可用模型 */
  listModels(): ModelInfo[] {
    return [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        contextWindow: 64000,
        pricing: { inputPerMillion: 0.27, outputPerMillion: 1.1 },
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        provider: 'deepseek',
        contextWindow: 64000,
        pricing: { inputPerMillion: 0.55, outputPerMillion: 2.19 },
      },
    ];
  }
}
