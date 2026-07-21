import { describe, it, expect } from 'vitest';
import { PatternDetector } from '../../src/subagent/pattern-detector.js';
import type { TaskRecord, SkillMetricsRepository } from '@crab-science/shared';
import { SUBAGENT_PATTERN_THRESHOLD } from '@crab-science/shared';

/**
 * PatternDetector 纯逻辑测试（使用 mock SkillMetricsRepository）
 *
 * 重点测试：
 * - detect(): 阈值检测、聚合逻辑、排序
 * - extractSignature: 签名格式
 * - inferTaskType: 任务类型推断
 * - generateSuggestedName: 名称生成
 * - generateSuggestedDescription: 描述生成
 */
describe('PatternDetector - mock-based tests', () => {
  function makeTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
    return {
      taskId: `task_${Math.random().toString(36).substring(2, 8)}`,
      task: '数据分析任务',
      toolsUsed: ['read', 'bash'],
      skillUsed: 'data-skill',
      outcome: 'success',
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  function createMockRepo(taskRecords: TaskRecord[]): SkillMetricsRepository {
    return {
      getRecentTaskRecords: (limit: number) => taskRecords.slice(0, limit),
    } as unknown as SkillMetricsRepository;
  }

  describe('detect - 基本逻辑', () => {
    it('任务记录数不足阈值时应返回空数组', () => {
      const records = [
        makeTaskRecord({ task: '数据分析' }),
        makeTaskRecord({ task: '数据分析' }),
      ];
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 5,
      });

      const patterns = detector.detect();
      expect(patterns).toHaveLength(0);
    });

    it('任务记录总数不足阈值时应返回空数组（即使有相同签名）', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 4; i++) {
        records.push(makeTaskRecord({ task: '相同任务' }));
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 5,
      });

      const patterns = detector.detect();
      // 总记录数 4 < 阈值 5
      expect(patterns).toHaveLength(0);
    });

    it('相同签名出现次数 >= 阈值时应返回模式', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 5; i++) {
        records.push(
          makeTaskRecord({
            task: '数据分析报告',
            skillUsed: 'data-skill',
            toolsUsed: ['read', 'bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 5,
      });

      const patterns = detector.detect();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].count).toBe(5);
    });

    it('不同签名的任务不应被聚合', () => {
      const records: TaskRecord[] = [];
      // 3 个搜索任务
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '搜索数据',
            skillUsed: 'search-skill',
            toolsUsed: ['search'],
          }),
        );
      }
      // 3 个写作任务（不同签名）
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '撰写报告',
            skillUsed: 'write-skill',
            toolsUsed: ['write'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      // 应有两个不同的模式
      expect(patterns).toHaveLength(2);
    });
  });

  describe('detect - 排序逻辑', () => {
    it('应按出现次数降序排序', () => {
      const records: TaskRecord[] = [];
      // 5 个相同签名A
      for (let i = 0; i < 5; i++) {
        records.push(
          makeTaskRecord({
            task: '搜索数据',
            skillUsed: 'search-skill',
            toolsUsed: ['search'],
          }),
        );
      }
      // 3 个相同签名B
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '撰写报告',
            skillUsed: 'write-skill',
            toolsUsed: ['write'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns).toHaveLength(2);
      expect(patterns[0].count).toBe(5);
      expect(patterns[1].count).toBe(3);
    });
  });

  describe('签名提取逻辑（通过 detect 间接验证）', () => {
    it('skillUsed 为 null 时签名应使用 "none"', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据',
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns).toHaveLength(1);
      // 签名格式：none|bash|analysis
      expect(patterns[0].signature).toContain('none');
    });

    it('toolsUsed 为空数组时签名应使用 "none"', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据',
            skillUsed: 'test-skill',
            toolsUsed: [],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].signature).toContain('none');
    });

    it('toolsUsed 顺序不同时应生成相同签名', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据',
            skillUsed: 'skill-a',
            toolsUsed: i % 2 === 0 ? ['bash', 'read'] : ['read', 'bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      // 工具顺序不同但排序后相同，应聚合为一个模式
      expect(patterns).toHaveLength(1);
      expect(patterns[0].count).toBe(3);
    });
  });

  describe('任务类型推断（通过 suggestedName 间接验证）', () => {
    it('搜索类任务应推断为 search 类型', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '搜索相关文档',
            skillUsed: null,
            toolsUsed: ['search'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedName).toContain('search');
    });

    it('分析类任务应推断为 analysis 类型', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据趋势',
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedName).toContain('analysis');
    });

    it('写作类任务应推断为 write 类型', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '撰写技术文档',
            skillUsed: null,
            toolsUsed: ['write'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedName).toContain('write');
    });

    it('测试类任务应推断为 test 类型', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '测试新功能',
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedName).toContain('test');
    });

    it('通用任务应推断为 general 类型', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '执行某个操作',
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedName).toContain('general');
    });
  });

  describe('建议名称生成', () => {
    it('有 skill 时名称应包含 skill 名', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据',
            skillUsed: 'my-skill',
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedName).toContain('my-skill');
      expect(patterns[0].suggestedName).toContain('analysis');
      expect(patterns[0].suggestedName).toContain('agent');
    });

    it('无 skill 时名称应只包含 taskType', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据',
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedName).toBe('analysis-agent');
    });

    it('名称应为小写', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据',
            skillUsed: 'MySkill',
            toolsUsed: ['Bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedName).toBe(
        patterns[0].suggestedName.toLowerCase(),
      );
    });
  });

  describe('建议描述生成', () => {
    it('应包含出现次数', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 5; i++) {
        records.push(
          makeTaskRecord({
            task: '分析销售数据',
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedDescription).toContain('5');
    });

    it('应包含典型任务描述（截断到 60 字符）', () => {
      const longTask = '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的任务描述超过六十个字符';
      const records: TaskRecord[] = [];
      for (let i = 0; i < 3; i++) {
        records.push(
          makeTaskRecord({
            task: longTask,
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 3,
      });

      const patterns = detector.detect();
      expect(patterns[0].suggestedDescription).toContain('...');
      // 不应包含完整的超长任务描述
      expect(patterns[0].suggestedDescription).not.toContain(longTask);
    });
  });

  describe('配置覆盖', () => {
    it('应使用配置中的自定义阈值', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < 2; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据',
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      // 自定义阈值为 2
      const detector = new PatternDetector(repo, {
        subagentPatternThreshold: 2,
      });

      const patterns = detector.detect();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].count).toBe(2);
    });

    it('无配置时应使用默认阈值', () => {
      const records: TaskRecord[] = [];
      for (let i = 0; i < SUBAGENT_PATTERN_THRESHOLD; i++) {
        records.push(
          makeTaskRecord({
            task: '分析数据',
            skillUsed: null,
            toolsUsed: ['bash'],
          }),
        );
      }
      const repo = createMockRepo(records);
      const detector = new PatternDetector(repo, {});

      const patterns = detector.detect();
      expect(patterns).toHaveLength(1);
    });
  });
});
