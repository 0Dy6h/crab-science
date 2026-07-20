import type { ModelInfo } from './types.js';

// ============================================================
// Token 计数器与成本估算
// Phase 1 使用简易估算（字符数 / 4）
// ============================================================

/** 各模型定价表（USD per million tokens） */
const PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  // Anthropic
  'claude-sonnet-4-20250514': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.8, outputPerMillion: 4 },
  // OpenAI
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4-turbo': { inputPerMillion: 10, outputPerMillion: 30 },
};

/**
 * Token 计数器
 */
export class TokenCounter {
  /** 简易 token 估算（字符数 / 4） */
  count(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * 估算成本
   * @param inputTokens - 输入 token 数
   * @param outputTokens - 输出 token 数
   * @param model - 模型 ID
   * @returns 成本（USD）
   */
  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing = PRICING[model] ?? { inputPerMillion: 3, outputPerMillion: 15 };
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }

  /** 获取模型定价 */
  getPricing(model: string): { inputPerMillion: number; outputPerMillion: number } {
    return PRICING[model] ?? { inputPerMillion: 3, outputPerMillion: 15 };
  }
}

/** 全局 TokenCounter 实例 */
export const tokenCounter = new TokenCounter();
