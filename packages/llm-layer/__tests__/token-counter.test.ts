import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCounter, tokenCounter } from '@crab-science/llm-layer';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
  });

  describe('count', () => {
    it('空字符串应返回 0', () => {
      expect(counter.count('')).toBe(0);
    });

    it('应返回字符数 / 4 的向上取整', () => {
      expect(counter.count('abcd')).toBe(1); // 4/4 = 1
      expect(counter.count('abc')).toBe(1); // 3/4 → ceil = 1
      expect(counter.count('abcde')).toBe(2); // 5/4 → ceil = 2
    });

    it('应处理长文本', () => {
      const text = 'a'.repeat(400);
      expect(counter.count(text)).toBe(100);
    });
  });

  describe('estimateCost', () => {
    it('应正确计算已知模型的成本', () => {
      // claude-sonnet-4-20250514: input $3/M, output $15/M
      const cost = counter.estimateCost(1000000, 500000, 'claude-sonnet-4-20250514');
      // input: 1M * $3/M = $3
      // output: 500K * $15/M = $7.5
      // total = $10.5
      expect(cost).toBeCloseTo(10.5, 4);
    });

    it('应正确计算 OpenAI 模型成本', () => {
      // gpt-4o: input $2.5/M, output $10/M
      const cost = counter.estimateCost(1000000, 1000000, 'gpt-4o');
      // input: 1M * $2.5/M = $2.5
      // output: 1M * $10/M = $10
      // total = $12.5
      expect(cost).toBeCloseTo(12.5, 4);
    });

    it('应正确计算 gpt-4o-mini 成本', () => {
      // gpt-4o-mini: input $0.15/M, output $0.6/M
      const cost = counter.estimateCost(1000000, 1000000, 'gpt-4o-mini');
      // input: 1M * $0.15/M = $0.15
      // output: 1M * $0.6/M = $0.6
      // total = $0.75
      expect(cost).toBeCloseTo(0.75, 4);
    });

    it('未知模型应使用默认定价', () => {
      const cost = counter.estimateCost(1000000, 1000000, 'unknown-model');
      // 默认: input $3/M, output $15/M
      // total = $18
      expect(cost).toBeCloseTo(18, 4);
    });

    it('0 token 应返回 0 成本', () => {
      expect(counter.estimateCost(0, 0, 'gpt-4o')).toBe(0);
    });

    it('应处理小量 token', () => {
      const cost = counter.estimateCost(100, 50, 'gpt-4o');
      // input: 100/1M * $2.5 = $0.00025
      // output: 50/1M * $10 = $0.0005
      // total = $0.00075
      expect(cost).toBeCloseTo(0.00075, 6);
    });

    it('应支持 claude-opus-4 定价', () => {
      // claude-opus-4-20250514: input $15/M, output $75/M
      const cost = counter.estimateCost(1000000, 1000000, 'claude-opus-4-20250514');
      // total = $15 + $75 = $90
      expect(cost).toBeCloseTo(90, 4);
    });

    it('应支持 claude-3-5-sonnet 定价', () => {
      const cost = counter.estimateCost(1000000, 0, 'claude-3-5-sonnet-20241022');
      // input only: $3
      expect(cost).toBeCloseTo(3, 4);
    });

    it('应支持 claude-3-5-haiku 定价', () => {
      const cost = counter.estimateCost(0, 1000000, 'claude-3-5-haiku-20241022');
      // output only: $4
      expect(cost).toBeCloseTo(4, 4);
    });

    it('应支持 gpt-4-turbo 定价', () => {
      const cost = counter.estimateCost(1000000, 1000000, 'gpt-4-turbo');
      // input: $10, output: $30
      expect(cost).toBeCloseTo(40, 4);
    });
  });

  describe('getPricing', () => {
    it('应返回已知模型的定价', () => {
      const pricing = counter.getPricing('gpt-4o');
      expect(pricing.inputPerMillion).toBe(2.5);
      expect(pricing.outputPerMillion).toBe(10);
    });

    it('应返回 claude-sonnet-4 的定价', () => {
      const pricing = counter.getPricing('claude-sonnet-4-20250514');
      expect(pricing.inputPerMillion).toBe(3);
      expect(pricing.outputPerMillion).toBe(15);
    });

    it('未知模型应返回默认定价', () => {
      const pricing = counter.getPricing('unknown-model');
      expect(pricing.inputPerMillion).toBe(3);
      expect(pricing.outputPerMillion).toBe(15);
    });
  });

  describe('全局实例', () => {
    it('tokenCounter 应是 TokenCounter 实例', () => {
      expect(tokenCounter).toBeInstanceOf(TokenCounter);
    });

    it('全局实例应可正常使用', () => {
      expect(tokenCounter.count('test')).toBe(1);
      expect(tokenCounter.estimateCost(100, 50, 'gpt-4o')).toBeGreaterThan(0);
    });
  });
});
