import { describe, it, expect } from 'vitest';
import { KnowledgeRetriever } from '../../src/knowledge/knowledge-retriever.js';
import type { Experience, ExperienceRepository, KnowledgeRepository } from '@crab-science/shared';
import { EXPERIENCE_INJECTION_TOKEN_BUDGET } from '@crab-science/shared';

/**
 * KnowledgeRetriever 纯逻辑测试（不需要 SQLite）
 *
 * 重点测试：
 * - formatForInjection: token 预算裁剪、任务截断、keyLearnings 截断、outcome 映射
 * - retrieve: 关键词检索、知识图谱扩展、排序逻辑（使用 mock 仓库）
 */
describe('KnowledgeRetriever - pure logic', () => {
  // 创建 mock 仓库
  function createMockRetriever(
    experiences: Experience[],
    relatedMap: Map<string, Experience[]> = new Map(),
  ): KnowledgeRetriever {
    const mockExpRepo = {
      getRecent: (limit: number) => experiences.slice(0, limit),
      findByTaskKeywords: (keywords: string[], limit: number) => {
        const matches = experiences.filter((exp) =>
          keywords.some((kw) =>
            exp.task.toLowerCase().includes(kw.toLowerCase()),
          ),
        );
        return matches.slice(0, limit);
      },
    } as unknown as ExperienceRepository;

    const mockKnowledgeRepo = {
      findRelated: (expId: string, limit: number) => {
        return (relatedMap.get(expId) || []).slice(0, limit);
      },
    } as unknown as KnowledgeRepository;

    return new KnowledgeRetriever(mockExpRepo, mockKnowledgeRepo, {
      experienceInjectionTokenBudget: 500,
      experienceInjectionTopK: 5,
    });
  }

  function makeExperience(overrides: Partial<Experience> = {}): Experience {
    return {
      id: `exp_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      taskId: 'task-1',
      sessionId: 'session-1',
      task: '数据分析任务',
      skillUsed: 'data-skill',
      subagentUsed: null,
      outcome: 'success',
      duration: 5000,
      keyLearnings: ['使用 pandas 处理数据'],
      tags: ['python', 'data'],
      relatedExperiences: [],
      ...overrides,
    };
  }

  // ============================================================
  // formatForInjection 测试
  // ============================================================
  describe('formatForInjection', () => {
    it('空经验列表应返回空字符串', () => {
      const retriever = createMockRetriever([]);
      const text = retriever.formatForInjection([]);
      expect(text).toBe('');
    });

    it('应包含标题行', () => {
      const retriever = createMockRetriever([]);
      const exp = makeExperience();
      const text = retriever.formatForInjection([exp]);
      expect(text).toContain('# 相关经验');
    });

    it('应正确映射 outcome 图标和标签', () => {
      const retriever = createMockRetriever([]);
      const experiences = [
        makeExperience({ outcome: 'success', id: 'e1' }),
        makeExperience({ outcome: 'partial', id: 'e2' }),
        makeExperience({ outcome: 'failure', id: 'e3' }),
      ];
      const text = retriever.formatForInjection(experiences);
      expect(text).toContain('[成功]');
      expect(text).toContain('[部分]');
      expect(text).toContain('[失败]');
    });

    it('应截断超过 50 字符的任务描述', () => {
      const retriever = createMockRetriever([]);
      const longTask = '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的任务描述超过五十个字符';
      const exp = makeExperience({ task: longTask });
      const text = retriever.formatForInjection([exp]);
      expect(text).toContain('...');
      expect(text).not.toContain(longTask);
    });

    it('应截断超过 80 字符的 keyLearnings', () => {
      const retriever = createMockRetriever([]);
      const longLearning = '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的学习点'.repeat(2);
      const exp = makeExperience({ keyLearnings: [longLearning] });
      const text = retriever.formatForInjection([exp]);
      expect(text).toContain('...');
    });

    it('应最多显示 3 条 keyLearnings', () => {
      const retriever = createMockRetriever([]);
      const exp = makeExperience({
        keyLearnings: ['学习1', '学习2', '学习3', '学习4', '学习5'],
      });
      const text = retriever.formatForInjection([exp]);
      expect(text).toContain('学习1');
      expect(text).toContain('学习2');
      expect(text).toContain('学习3');
      expect(text).not.toContain('学习4');
      expect(text).not.toContain('学习5');
    });

    it('keyLearnings 为空时应显示"无"', () => {
      const retriever = createMockRetriever([]);
      const exp = makeExperience({ keyLearnings: [] });
      const text = retriever.formatForInjection([exp]);
      expect(text).toContain('无');
    });

    it('应在超出 token 预算时停止添加经验', () => {
      // 设置极小的 token 预算
      const mockExpRepo = {} as unknown as ExperienceRepository;
      const mockKnowledgeRepo = {} as unknown as KnowledgeRepository;
      const retriever = new KnowledgeRetriever(
        mockExpRepo,
        mockKnowledgeRepo,
        { experienceInjectionTokenBudget: 10 }, // 极小预算
      );

      const experiences = [
        makeExperience({ task: '任务一', keyLearnings: ['学习点一'] }),
        makeExperience({ task: '任务二', keyLearnings: ['学习点二'] }),
        makeExperience({ task: '任务三', keyLearnings: ['学习点三'] }),
      ];

      const text = retriever.formatForInjection(experiences);
      // 应包含标题 + 至少一条经验，但不会包含全部
      expect(text).toContain('# 相关经验');
      // 不应包含第三条（预算太小）
      const lines = text.split('\n');
      expect(lines.length).toBeLessThan(experiences.length + 1);
    });

    it('未知 outcome 应使用默认图标', () => {
      const retriever = createMockRetriever([]);
      const exp = makeExperience({ outcome: 'unknown' as Experience['outcome'] });
      const text = retriever.formatForInjection([exp]);
      // 未知 outcome 应不报错，使用默认标签
      expect(text).toContain('[unknown]');
    });
  });

  // ============================================================
  // retrieve 测试（使用 mock 仓库）
  // ============================================================
  describe('retrieve with mock repos', () => {
    it('无关键词时应返回最近经验', () => {
      const experiences = [
        makeExperience({ id: 'e1', task: '任务A' }),
        makeExperience({ id: 'e2', task: '任务B' }),
      ];
      const retriever = createMockRetriever(experiences);

      // 空字符串 → 无关键词 → 返回 getRecent
      const results = retriever.retrieve('');
      expect(results.length).toBeGreaterThan(0);
    });

    it('应按关键词检索匹配的经验', () => {
      const experiences = [
        makeExperience({ id: 'e1', task: '数据分析任务' }),
        makeExperience({ id: 'e2', task: '模型训练任务' }),
      ];
      const retriever = createMockRetriever(experiences);

      const results = retriever.retrieve('数据分析');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((e) => e.task.includes('数据分析'))).toBe(true);
    });

    it('无匹配关键词时应返回空数组', () => {
      const experiences = [
        makeExperience({ id: 'e1', task: '数据分析任务' }),
      ];
      const retriever = createMockRetriever(experiences);

      const results = retriever.retrieve('完全不相关的关键词xyz');
      expect(results).toHaveLength(0);
    });

    it('应通过知识图谱扩展相关经验', () => {
      const exp1 = makeExperience({ id: 'e1', task: '数据分析' });
      const exp2 = makeExperience({ id: 'e2', task: '相关任务' });
      const exp3 = makeExperience({ id: 'e3', task: '无关任务' });

      // e2 是 e1 的相关经验
      const relatedMap = new Map<string, Experience[]>();
      relatedMap.set('e1', [exp2]);

      const retriever = createMockRetriever([exp1, exp3], relatedMap);

      const results = retriever.retrieve('数据分析');
      // 应包含直接匹配的 e1 和通过图谱扩展的 e2
      expect(results.some((e) => e.id === 'e1')).toBe(true);
      expect(results.some((e) => e.id === 'e2')).toBe(true);
      // 不应包含不相关的 e3
      expect(results.some((e) => e.id === 'e3')).toBe(false);
    });

    it('应按 outcome 优先级排序（success > partial > failure）', () => {
      const successExp = makeExperience({
        id: 'e1',
        task: '测试任务',
        outcome: 'success',
        timestamp: '2025-01-03T00:00:00Z',
      });
      const failureExp = makeExperience({
        id: 'e2',
        task: '测试任务',
        outcome: 'failure',
        timestamp: '2025-01-02T00:00:00Z',
      });
      const partialExp = makeExperience({
        id: 'e3',
        task: '测试任务',
        outcome: 'partial',
        timestamp: '2025-01-01T00:00:00Z',
      });

      const retriever = createMockRetriever([
        failureExp,
        partialExp,
        successExp,
      ]);

      const results = retriever.retrieve('测试任务');
      expect(results.length).toBeGreaterThanOrEqual(3);
      // success 应排在前面
      expect(results[0].outcome).toBe('success');
      // partial 应在 failure 前面
      const partialIdx = results.findIndex((e) => e.outcome === 'partial');
      const failureIdx = results.findIndex((e) => e.outcome === 'failure');
      expect(partialIdx).toBeLessThan(failureIdx);
    });

    it('应限制返回数量为 topK', () => {
      const experiences: Experience[] = [];
      for (let i = 0; i < 10; i++) {
        experiences.push(
          makeExperience({
            id: `e${i}`,
            task: '测试任务',
            timestamp: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          }),
        );
      }
      const retriever = createMockRetriever(experiences);

      const results = retriever.retrieve('测试任务', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });
});
